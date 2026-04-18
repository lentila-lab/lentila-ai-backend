export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, mealTime } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    const prompt = `당신은 한국 음식 영양성분 분석 전문가입니다.
사용자가 입력한 식사 내용을 분석해서 각 음식의 영양성분을 추정해주세요.

입력: "${text.trim()}"
식사 시간: ${mealTime || '미지정'}

규칙:
1. 한국인의 일반적인 1인분 기준으로 추정
2. "반 그릇", "1/2", "반 접시" 등 분량 표현을 정확히 반영
3. 영양성분은 추정값이므로 "약" 수준의 정확도
4. "치료", "예방", "건강 효과" 등 의학적 표현 절대 사용 금지
5. 수치만 제공, 평가나 진단 금지

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 절대 포함 금지:
{
  "foods": [
    {
      "name": "음식 이름 (분량 포함)",
      "cal": 칼로리(kcal, 정수),
      "protein": 단백질(g, 정수),
      "carbs": 탄수화물(g, 정수),
      "fat": 지방(g, 정수),
      "sugar": 당류(g, 정수)
    }
  ],
  "totals": {
    "cal": 총 칼로리(정수),
    "protein": 총 단백질(정수),
    "carbs": 총 탄수화물(정수),
    "fat": 총 지방(정수),
    "sugar": 총 당류(정수)
  }
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
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(500).json({ error: 'AI API call failed' });
    }

    const data = await response.json();
    const textBlock = data.content.find(b => b.type === 'text');
    const rawText = textBlock ? textBlock.text : '';
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanText);

    return res.status(200).json(result);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
