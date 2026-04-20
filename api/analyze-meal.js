export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, mealTime, lang } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

    const langMap = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' };
    const responseLang = langMap[lang] || '한국어';

    const prompt = `당신은 음식 영양성분 분석 전문가입니다.
사용자가 입력한 식사 내용에서 [음식명 + 수량 + 단위]를 정확히 분리 추출하고, 1단위당 영양성분과 총합을 반환하세요.

입력: "${text.trim()}"
식사 시간: ${mealTime || '미지정'}

━━━ 수량 추출 규칙 ━━━
- "족발 2조각" → quantity: 2, unit: "조각"
- "계란 3개" → quantity: 3, unit: "개"
- "밥 1/2공기" → quantity: 0.5, unit: "공기"
- "반 개", "반개" → quantity: 0.5, unit: "개"
- "1/4" → quantity: 0.25
- 수량 명시 없으면 → quantity: 1, unit: "개"
- "1인분" 자동 가정 금지 → 반드시 실제 먹은 단위 기준 보수적 추정

━━━ 단위 기준 ━━━
개 / 조각 / 인분 / 그릇 / 공기 / 잔 / 장 / 줄 / 개 / g / ml 중 가장 적절한 것 사용

━━━ 영양성분 계산 규칙 ━━━
- unitCal, unitProtein 등 = 반드시 1단위(quantity:1)당 영양성분
- cal = unitCal × quantity (반드시 일치)
- protein = unitProtein × quantity (반드시 일치)
- carbs, fat, sugar 동일

━━━ 기타 규칙 ━━━
- 음식 이름은 반드시 ${responseLang}로 응답
- 수치만 제공, 평가나 진단 금지
- 다른 텍스트 없이 JSON만 응답

반드시 아래 JSON 형식으로만 응답:
{"foods":[{"name":"음식명(${responseLang})","quantity":1,"unit":"개","unitCal":0,"unitProtein":0,"unitCarbs":0,"unitFat":0,"unitSugar":0,"cal":0,"protein":0,"carbs":0,"fat":0,"sugar":0}],"totals":{"cal":0,"protein":0,"carbs":0,"fat":0,"sugar":0}}`;

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
        messages: [{ role: 'user', content: prompt }]
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
