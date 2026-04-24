export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image, mealTime, lang, memo, myFoods, handSize } = req.body;
    if (!image) return res.status(400).json({ error: 'image is required' });

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = image.match(/^data:(image\/\w+);/) ? image.match(/^data:(image\/\w+);/)[1] : 'image/jpeg';
    const langMap = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' };
    const responseLang = langMap[lang] || '한국어';

    // 단골 메뉴 힌트 구성 (최대 15개까지만 프롬프트에 포함)
    let myFoodsHint = '';
    if (Array.isArray(myFoods) && myFoods.length > 0) {
      const top = myFoods.slice(0, 15);
      myFoodsHint = '\n\n━━ 사용자 자주 먹는 음식 (매칭 우선) ━━\n';
      top.forEach(f => {
        myFoodsHint += `- ${f.name}: ${f.quantity}${f.unit}당 ${Math.round(f.cal||0)}kcal, 단백질 ${Math.round((f.protein||0)*10)/10}g\n`;
      });
      myFoodsHint += '위 음식 중 사진과 명확히 일치하는 것이 있으면 해당 값을 우선 사용하세요.\n';
    }

    // 사용자 메모
    let memoHint = '';
    if (memo && typeof memo === 'string' && memo.trim()) {
      memoHint = `\n\n━━ 사용자 추가 설명 ━━\n"${memo.trim()}"\n이 설명을 사진 분석에 반영하세요. 설명이 사진과 다르면 설명을 우선합니다.\n`;
    }

    // 사용자 손바닥 실측 크기
    let handSizeHint = '';
    if (handSize && handSize.palmWidth && handSize.palmLength) {
      handSizeHint = `\n\n━━ 사용자 손바닥 실측 크기 (정확함) ━━\n`
        + `가로 폭: ${handSize.palmWidth}mm (새끼손가락~엄지 밑 관절)\n`
        + `세로 길이: ${handSize.palmLength}mm (손목~중지 끝)\n`;
      if (handSize.thumbLength) handSizeHint += `엄지 길이: ${handSize.thumbLength}mm\n`;
      handSizeHint += `사진에 사용자의 손이 보이면 위 크기를 기준으로 다른 음식의 양을 정확히 비교·계산하세요. 손바닥과 음식 면적을 비교해 부피·무게 환산.\n`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data }
            },
            {
              type: 'text',
              text: `이 음식 사진을 보고 영양성분을 추정해주세요.

━━ 음식 식별 규칙 ━━
- 사진에 보이는 모든 음식을 식별
- 음식이 아니면 foods를 빈 배열로 반환
- 음식 이름과 identified는 반드시 ${responseLang}로 응답
- 조리법을 외관으로 판별 (튀김/구이/볶음/찜/생) — 조리법에 따라 kcal 20~40% 조정

━━ 수량 추정 규칙 (크기 힌트 사용) ━━
- 사진에서 개수/조각 수를 직접 세어서 추정
  예: 족발 3개 보임 → quantity: 3, unit: "조각"
- 크기 추정 기준:
  · 일반 밥공기 지름 ≈ 12cm, 큰 공기 ≈ 15cm
  · 국그릇 지름 ≈ 16cm
  · 일반 수저 길이 ≈ 20cm, 젓가락 ≈ 23cm
  · 성인 손바닥 ≈ 9×9cm, 엄지 ≈ 5cm
  · 신용카드 ≈ 8.5×5.4cm
- 사진에 참조 사물(수저·손·카드)이 보이면 크기 기준으로 삼기
- 그릇을 기준으로 담긴 양이 꽉 찼는지/반인지/1/4인지 판단
- 수량 불명확하면 quantity: 1, unit: "개"
- "1인분" 자동 가정 금지 — 보이는 실제 양 기준

━━ 영양성분 계산 규칙 ━━
- unitCal, unitProtein 등 = 반드시 1단위(quantity:1)당 영양성분
- cal = unitCal × quantity (반드시 일치)
- protein = unitProtein × quantity (반드시 일치)
- carbs, fat, sugar 동일

━━ 신뢰도 표시 규칙 ━━
- 각 음식마다 confidence 필드 (0.0~1.0)
  · 0.9 이상: 명확히 식별됨 (사진 선명, 크기 기준 있음)
  · 0.7~0.9: 대체로 명확
  · 0.5~0.7: 불명확 (양·종류 애매)
  · 0.5 미만: 매우 불명확 (사진 흐림, 가려짐)
- 불명확한 이유가 있으면 warning 필드에 짧게 (예: "크기 참조 사물 없음", "속재료 불명확")

━━ 기타 규칙 ━━
- identified 배열에 수량 포함: ["족발 3조각", "막국수 1그릇"]
- 수치만 제공, 평가나 진단 금지
- 다른 텍스트 없이 JSON만 응답${myFoodsHint}${memoHint}${handSizeHint}

반드시 아래 JSON 형식으로만 응답:
{"identified":["음식1(${responseLang})"],"foods":[{"name":"음식명(${responseLang})","quantity":1,"unit":"개","unitCal":0,"unitProtein":0,"unitCarbs":0,"unitFat":0,"unitSugar":0,"cal":0,"protein":0,"carbs":0,"fat":0,"sugar":0,"confidence":0.85,"warning":""}],"totals":{"cal":0,"protein":0,"carbs":0,"fat":0,"sugar":0}}`
            }
          ]
        }]
      })
    });

    if (!response.ok) return res.status(500).json({ error: 'AI API call failed' });
    const data = await response.json();
    const textBlock = data.content.find(b => b.type === 'text');
    return res.status(200).json(JSON.parse((textBlock ? textBlock.text : '').replace(/```json|```/g, '').trim()));
  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
