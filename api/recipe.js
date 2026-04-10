export default async function handler(req, res) {
  // CORS 헤더 설정 (아임웹에서 호출 허용)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 (CORS preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { goal, situation, ingredients, avoid } = req.body;

    if (!goal || !situation || !ingredients) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const prompt = `당신은 렌틸라 콩스틱 땅콩버터를 활용한 창의적 레시피를 만드는 AI 셰프입니다.
렌틸라 콩스틱은 발효 렌틸콩과 하이올레닉 땅콩으로 만든 고단백 땅콩버터이며, 1스틱(약 18g)당 단백질 6.5g입니다.

사용자 상황:
- 관심사: ${goal}
- 먹는 시점: ${situation}
- 보유 재료: ${ingredients}
- 피하고 싶은 것: ${avoid || '없음'}

평범한 조합(요거트+땅콩버터, 빵+땅콩버터)이 아닌 사용자 상황에 딱 맞는 완전히 새롭고 창의적인 레시피 1개를 만들어주세요.
사용자 보유 재료를 주재료로 하되, 일반 가정에서 쉽게 구할 수 있는 추가 재료 1~3가지를 더해도 됩니다.
조리는 5분 이내여야 합니다.

중요: "치료" "예방" 같은 단어는 절대 사용 금지. 영양 효능은 "도움이 될 수 있다" 수준만 허용.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 절대 포함 금지:
{
  "headline": "공감 헤드라인 (20자 이내)",
  "summary": "사용자 답변 기반 2~3문장 종합 조언",
  "emoji": "레시피 대표 이모지 1개",
  "name": "창의적 레시피 이름 (20자 이내)",
  "description": "레시피 특징 (2문장)",
  "ingredients": ["재료1 + 분량", "재료2 + 분량", "재료3 + 분량", "렌틸라 콩스틱 1개"],
  "steps": ["조리 단계 1", "조리 단계 2", "조리 단계 3"],
  "nutrients": ["단백질 약 Xg", "주요영양소", "특징"],
  "chef_note": "셰프의 한 줄 팁"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(500).json({ error: 'AI API call failed', details: errText });
    }

    const data = await response.json();
    const textBlock = data.content.find(b => b.type === 'text');
    const rawText = textBlock ? textBlock.text : '';

    // JSON 추출 (```json 마크다운 제거)
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    const recipe = JSON.parse(cleanText);

    return res.status(200).json(recipe);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
