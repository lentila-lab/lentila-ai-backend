export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { weekData, goals, glp1, weight, supplements } = req.body;
    if (!weekData) return res.status(400).json({ error: 'weekData is required' });

    // 통계 계산
    const recordedDays = weekData.filter(d => d.meals > 0).length;
    const avgCal = recordedDays > 0
      ? Math.round(weekData.reduce((s, d) => s + (d.cal || 0), 0) / recordedDays)
      : 0;
    const avgProtein = recordedDays > 0
      ? Math.round(weekData.reduce((s, d) => s + (d.protein || 0), 0) / recordedDays * 10) / 10
      : 0;
    const totalBurned = weekData.reduce((s, d) => s + (d.burnedCal || 0), 0);
    const exerciseDays = weekData.filter(d => d.exercise && d.exercise !== 'none').length;
    const highStressDays = weekData.filter(d => d.stress === 'high').length;

    const summary = {
      기간: weekData[0]?.label + ' ~ ' + weekData[6]?.label,
      목표: goals,
      통계: {
        기록일수: recordedDays + '일/7일',
        평균칼로리: avgCal + 'kcal',
        평균단백질: avgProtein + 'g',
        총소모칼로리: totalBurned + 'kcal',
        운동일수: exerciseDays + '일',
        고스트레스일수: highStressDays + '일'
      },
      일별데이터: weekData.map(d => ({
        날짜: d.label,
        식사횟수: d.meals || 0,
        칼로리: d.cal || 0,
        단백질: d.protein || 0,
        탄수화물: d.carbs || 0,
        지방: d.fat || 0,
        당류: d.sugar || 0,
        소모칼로리: d.burnedCal || 0,
        운동: d.exercise || '없음',
        활동량: d.activity || '미입력',
        스트레스: d.stress || '미입력',
        기분: d.mood || '미입력',
        운동메모: d.memo || '',
        영양제체크: (d.suppChecked || []).join(', ') || '없음'
      })),
      GLP1: glp1 || '해당없음',
      체중변화: weight || '기록없음',
      영양제목록: (supplements || []).join(', ')
    };

    const systemPrompt = `당신은 렌틸라 식품의 AI 영양 코치 "콩 셰프 렌티"입니다.
사용자의 1주일 건강 데이터를 분석해 따뜻하고 구체적인 인사이트를 제공하세요.
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트나 마크다운 금지.
{"title":"이번주별명(예:단백질챔피언주간)","emoji":"이모지1개","summary":"한줄총평20자이내","score":숫자(0-100),"good":"잘한점1문장","bad":"아쉬운점1문장","nextWeek":"다음주행동제안1문장","mission":"다음주구체적미션(예:단백질목표5일달성)","lenti_comment":"렌티따뜻한한마디"}
GLP-1이 해당없음이면 체중+식단 중심으로 분석. 점수: 식단기록40%+단백질달성20%+운동20%+영양제10%+라이프스타일10%.`;

    const userPrompt = `다음 데이터를 분석해주세요:\n${JSON.stringify(summary, null, 2)}`;

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
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: 'AI API 오류', detail: errText });
    }

    const data = await response.json();
    const textBlock = data.content.find(b => b.type === 'text');
    const raw = (textBlock ? textBlock.text : '').replace(/```json|```/g, '').trim();
    const report = JSON.parse(raw);

    return res.status(200).json(report);
  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
