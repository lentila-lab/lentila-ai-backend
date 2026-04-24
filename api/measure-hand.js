export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image is required' });

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = image.match(/^data:(image\/\w+);/) ? image.match(/^data:(image\/\w+);/)[1] : 'image/jpeg';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data }
            },
            {
              type: 'text',
              text: `이 사진은 A4 용지(정확히 210mm × 297mm) 위에 사용자의 손을 올린 모습입니다.

A4 용지를 크기 기준으로 삼아 다음을 측정해주세요:

1. palmWidth: 손바닥 가로 폭 (mm)
   - 새끼손가락 밑 관절부터 엄지 밑 관절까지의 가장 넓은 폭
2. palmLength: 손 전체 세로 길이 (mm)
   - 손목 주름부터 중지 끝까지
3. thumbLength: 엄지 길이 (mm)
   - 엄지 밑 관절부터 엄지 끝까지

━━ 측정 실패 조건 ━━
- A4 용지가 화면에 전부 보이지 않음
- 손이 A4 용지를 벗어남
- 손이 펴져 있지 않고 주먹 쥠
- 사진이 너무 흐리거나 어두움
- 손이 아닌 다른 것

위 중 하나라도 해당되면 unable: true와 reason을 반환하세요.

━━ 신뢰도 ━━
측정 자신감을 0.0~1.0으로 반환 (confidence)

반드시 아래 JSON 형식으로만 응답:
{"palmWidth":82,"palmLength":185,"thumbLength":58,"confidence":0.9,"unable":false,"reason":""}`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'AI API call failed', detail: err });
    }
    const data = await response.json();
    const textBlock = data.content.find(b => b.type === 'text');
    const raw = (textBlock ? textBlock.text : '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
