export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image, mealTime, lang } = req.body;
    if (!image) return res.status(400).json({ error: 'image is required' });

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = image.match(/^data:(image\/\w+);/) ? image.match(/^data:(image\/\w+);/)[1] : 'image/jpeg';
    const langMap = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' };
    const responseLang = langMap[lang] || '한국어';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: `이 음식 사진을 보고 영양성분을 추정해주세요.

규칙:
1. 사진에 보이는 모든 음식을 식별
2. 1인분 기준으로 분량 추정
3. 수치만 제공, 평가나 진단 금지
4. 음식 이름과 identified는 반드시 ${responseLang}로 응답
5. 음식이 아니면 foods를 빈 배열로

반드시 아래 JSON 형식으로만 응답. 다른 텍스트 포함 금지:
{"identified":["음식1(${responseLang})"],"foods":[{"name":"음식명(${responseLang})","cal":0,"protein":0,"carbs":0,"fat":0,"sugar":0}],"totals":{"cal":0,"protein":0,"carbs":0,"fat":0,"sugar":0}}` }
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
