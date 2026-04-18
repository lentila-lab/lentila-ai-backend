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
사용자가 입력한 식사 내용을 분석해서 각 음식의 영양성분을 추정해주세요.

입력: "${text.trim()}"
식사 시간: ${mealTime || '미지정'}

규칙:
1. 일반적인 1인분 기준으로 추정
2. 분량 표현을 정확히 반영
3. 수치만 제공, 평가나 진단 금지
4. 음식 이름은 반드시 ${responseLang}로 응답

반드시 아래 JSON 형식으로만 응답. 다른 텍스트 포함 금지:
{"foods":[{"name":"음식명(${responseLang})","cal":0,"protein":0,"carbs":0,"fat":0,"sugar":0}],"totals":{"cal":0,"protein":0,"carbs":0,"fat":0,"sugar":0}}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
    });

    if (!response.ok) return res.status(500).json({ error: 'AI API call failed' });
    const data = await response.json();
    const textBlock = data.content.find(b => b.type === 'text');
    return res.status(200).json(JSON.parse((textBlock ? textBlock.text : '').replace(/```json|```/g, '').trim()));
  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
