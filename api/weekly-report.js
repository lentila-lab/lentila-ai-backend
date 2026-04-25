export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      weekData, goals, glp1, weight, supplements,
      userProfile, streakDays, recordedDays,
      kongstickAnalysis, bestDay, worstDay, myFoods
    } = req.body;
    if (!weekData) return res.status(400).json({ error: 'weekData is required' });

    // ── 통계 계산 ──
    const recDays = recordedDays || weekData.filter(d => d.meals > 0).length;
    const avgCal = recDays > 0
      ? Math.round(weekData.reduce((s, d) => s + (d.cal || 0), 0) / recDays)
      : 0;
    const avgProtein = recDays > 0
      ? Math.round(weekData.reduce((s, d) => s + (d.protein || 0), 0) / recDays * 10) / 10
      : 0;
    const avgCarbs = recDays > 0
      ? Math.round(weekData.reduce((s, d) => s + (d.carbs || 0), 0) / recDays)
      : 0;
    const avgSugar = recDays > 0
      ? Math.round(weekData.reduce((s, d) => s + (d.sugar || 0), 0) / recDays)
      : 0;
    const totalBurned = weekData.reduce((s, d) => s + (d.burnedCal || 0), 0);
    const exerciseDays = weekData.filter(d => d.exercise && d.exercise !== 'none').length;
    const hardExerciseDays = weekData.filter(d => d.exercise === 'hard').length;
    const highStressDays = weekData.filter(d => d.stress === 'high').length;
    const tiredDays = weekData.filter(d => d.mood === 'tired' || d.mood === 'bad').length;
    const sugarOverDays = weekData.filter(d => (d.sugar || 0) > (goals?.sugar || 50)).length;

    // 영양제 통계
    const suppCompletedDays = weekData.filter(d => (d.suppCompleted || []).length > 0).length;
    const totalRunningExercises = weekData.reduce((s, d) => s + ((d.exerciseLog || []).length), 0);

    // ── AI에게 전달할 종합 데이터 ──
    const summary = {
      기간: weekData[0]?.label + ' ~ ' + weekData[6]?.label,
      목표: goals,

      사용자프로필: userProfile ? {
        목표타입: userProfile.goalLabel || '유지',
        나이: userProfile.age,
        성별: userProfile.gender === 'female' ? '여성' : userProfile.gender === 'male' ? '남성' : null,
        키: userProfile.height ? userProfile.height + 'cm' : null,
        활동량설정: userProfile.activityLevel,
        TDEE_권장칼로리: userProfile.tdee ? userProfile.tdee + 'kcal' : null
      } : null,

      통계: {
        기록일수: recDays + '일/7일',
        연속기록: streakDays + '일',
        평균칼로리: avgCal + 'kcal',
        평균단백질: avgProtein + 'g',
        평균탄수: avgCarbs + 'g',
        평균당류: avgSugar + 'g',
        당류초과일수: sugarOverDays + '일',
        총소모칼로리: totalBurned + 'kcal',
        운동일수: exerciseDays + '일',
        고강도운동일수: hardExerciseDays + '일',
        고스트레스일수: highStressDays + '일',
        피곤·우울한날: tiredDays + '일',
        영양제완료일수: suppCompletedDays + '일',
        총운동횟수: totalRunningExercises + '회'
      },

      베스트데이: bestDay,
      아쉬운데이: worstDay,

      콩스틱효과: kongstickAnalysis,

      일별데이터: weekData.map(d => ({
        날짜: d.label,
        식사횟수: d.meals || 0,
        칼로리: d.cal || 0,
        단백질: d.protein || 0,
        탄수화물: d.carbs || 0,
        지방: d.fat || 0,
        당류: d.sugar || 0,
        소모칼로리: d.burnedCal || 0,
        순섭취칼로리: (d.cal || 0) - (d.burnedCal || 0),
        운동: d.exercise || '없음',
        운동이력: (d.exerciseLog || []).map(e => `${e.memo}(${e.burned}kcal)`).join(', ') || '없음',
        활동량: d.activity || '미입력',
        스트레스: d.stress || '미입력',
        기분: d.mood || '미입력',
        영양제완료: (d.suppCompleted || []).join(', ') || '없음',
        영양제부분완료: (d.suppPartial || []).join(', ') || '없음',
        주요음식: (d.foodNames || []).slice(0, 5).join(', ') || '없음'
      })),

      GLP1: glp1 ? {
        종류: glp1.type,
        현재용량: glp1.currentDose,
        최근주사: glp1.recentInjections,
        마지막주사후일수: glp1.daysSinceLastInjection,
        다음주사D_day: glp1.daysToNextInjection,
        총주사횟수: glp1.totalInjections
      } : '해당없음',

      체중변화: weight ? {
        시작: weight.start,
        끝: weight.end,
        목표: weight.goal,
        주간변화량: weight.change + 'kg',
        목표까지남은체중: weight.remainingToGoal + 'kg',
        일별추세: weight.dailyTrend
      } : '기록없음',

      활성영양제: (supplements || []).join(', '),
      자주먹는음식TOP10: (myFoods || []).map(f => `${f.name}(${f.usedCount}회)`).join(', ')
    };

    // ── 시스템 프롬프트 ──
    const goalContext = userProfile?.goalLabel
      ? `사용자의 주 목표는 "${userProfile.goalLabel}"입니다. 이 목표에 맞춰 분석을 조정하세요:
  - 감량: 칼로리 적자, 당류 관리, 단백질 비중 강조
  - 유지: 균형잡힌 식단, 꾸준함 강조
  - 근육증가: 단백질 충분량, 운동 일수, 회복 강조
  - 저속노화: 당류·혈당 관리, 항염 식단, 스트레스 관리, 수면 강조`
      : '';

    const kongContext = kongstickAnalysis
      ? `콩스틱(렌틸라 제품) 효과 데이터: ${JSON.stringify(kongstickAnalysis)}. 콩스틱 챙긴 날과 안 챙긴 날의 단백질 차이를 자연스럽게 언급하면 좋아요.`
      : '';

    const systemPrompt = `당신은 렌틸라 식품의 AI 영양 코치 "콩 셰프 렌티"입니다.
사용자의 1주일 건강 데이터를 분석해 따뜻하고 구체적인 인사이트를 제공하세요.

${goalContext}

${kongContext}

분석 원칙:
1. 베스트 데이는 구체적으로 칭찬 (요일, 수치 포함)
2. 아쉬운 점은 비난하지 않고 다음 주 개선 제안으로 연결
3. 사용자 목표(감량/근육/저속노화/유지)에 맞는 조언
4. GLP-1 사용자라면 주사 사이클(피크/저점)에 맞춘 단백질·식단 전략 언급
5. 연속 기록 일수가 3일 이상이면 동기부여 멘트
6. 콩스틱 효과가 있으면 자연스럽게 언급
7. 모든 필드 한국어, 따뜻한 톤

반드시 아래 JSON 형식으로만 응답. 다른 텍스트나 마크다운 금지:
{"title":"이번주별명-감성적으로(예:꾸준한콩러의한주)","emoji":"이모지1개","summary":"한줄총평(20자이내,인용구형식)","good":"이번주잘한점1문장(베스트데이·구체수치포함)","bad":"아쉬운점1문장(구체적,비난X)","nextWeek":"다음주행동제안1문장(아쉬웠던요일·근거포함)","mission":"다음주미션(짧고구체적,예:화·금요일점심에콩스틱챙기기)","lenti_comment":"렌티따뜻한한마디(콩스틱·목표·연속기록자연스럽게)"}`;

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
        max_tokens: 2000,  // 1500 → 2000 증대
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
