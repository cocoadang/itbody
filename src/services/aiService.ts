import { auth, isDevSandbox } from '../firebase/config';
import type {
  AiSessionDraft,
  AiSessionDraftContext,
  AiReviewDraft,
  AiReviewDraftRequest,
  ExerciseRecord
} from '../types';

/**
 * Phase 7: AI 기록 보조 서비스 (Client Side API Proxy & Graceful Fallback)
 * 
 * 개인정보 최소화:
 * - 회원 이름, 전화번호, 이메일, 생년월일 등 민감 식별자는 Gemini API로 전송하지 않습니다.
 * - '회원', '회원님' 등의 익명 context만 전달합니다.
 * - 결과는 절대 Firestore에 자동 저장되지 않으며, 트레이너의 확인 및 수정 후 [적용] 단계를 거칩니다.
 */

/**
 * Heuristic fallback parser for session memo when Gemini API is unavailable or offline
 */
export function fallbackParseSessionMemo(rawMemo: string): AiSessionDraft {
  const lines = rawMemo.split(/[\n.]+/).map((l) => l.trim()).filter(Boolean);
  const exercises: ExerciseRecord[] = [];
  const feedbackItems: string[] = [];
  const internalNotes: string[] = [];
  let nextGoal = '';

  for (const line of lines) {
    // Check if line contains exercise pattern, e.g. "스쿼트 60kg 10 10 8" or "데드리프트 80kg 5x5"
    const match = line.match(/([가-힣a-zA-Z\s]+?)\s*(\d+)\s*kg\s*([\d\s\w]+)/i);
    if (match) {
      const exerciseName = match[1].trim().replace(/^(회원|님|오전|오후)\s*/, '');
      const weight = parseFloat(match[2]) || 0;
      const repsPart = match[3].trim();
      
      const repNumbers: number[] = [];
      const repMatches = repsPart.matchAll(/\b\d+\b/g);
      for (const m of repMatches) {
        repNumbers.push(parseInt(m[0], 10));
      }

      if (repNumbers.length > 0) {
        exercises.push({
          exerciseName: exerciseName || '운동',
          sets: repNumbers.map((r, idx) => ({
            setNumber: idx + 1,
            weight,
            reps: r
          })),
          memo: ''
        });
        continue;
      }
    }

    // Check for next goal pattern
    if (/다음|목표|next/i.test(line)) {
      nextGoal = line.replace(/다음(번|에| 수업)?\s*/g, '').trim();
      continue;
    }

    // Check for internal coaching vs feedback
    if (/통증|불편|피로|자세|코칭|주의/i.test(line)) {
      internalNotes.push(line);
    } else {
      feedbackItems.push(line);
    }
  }

  // Fallback defaults if nothing was parsed
  if (exercises.length === 0) {
    exercises.push({
      exerciseName: '스쿼트',
      sets: [
        { setNumber: 1, weight: 40, reps: 10 },
        { setNumber: 2, weight: 40, reps: 10 }
      ],
      memo: '자연어 메모 확인 후 수정 요망'
    });
  }

  return {
    exercises,
    memberFeedback: feedbackItems.length > 0
      ? feedbackItems.join(' ')
      : '오늘도 높은 집중도로 성실하게 운동에 참여하셨습니다. 수고 많으셨습니다!',
    nextSessionGoal: nextGoal || '오늘 수행 중량을 바탕으로 점진적 부하 증량 및 안정적인 가동범위 유지',
    internalNote: internalNotes.length > 0
      ? internalNotes.join(' / ')
      : '회원 컨디션 및 관절 가동범위 체크 완료.'
  };
}

/**
 * Heuristic fallback for review draft when Gemini API is unavailable
 */
export function fallbackGenerateReviewDraft(req: AiReviewDraftRequest): AiReviewDraft {
  const { stats, reviewType } = req;
  const typeLabel =
    reviewType === 'TEN_SESSION'
      ? '10회차 중간 점검'
      : reviewType === 'TWENTY_SESSION'
      ? '20회차 성과 점검'
      : '정기 성과 점검';

  const weightDiff = stats.bodyChanges?.weightChange;
  const muscleDiff = stats.bodyChanges?.muscleChange;
  const fatDiff = stats.bodyChanges?.fatPercentageChange;

  const changes: string[] = [];
  if (weightDiff) changes.push(`체중 ${weightDiff}kg`);
  if (muscleDiff) changes.push(`골격근량 ${muscleDiff}kg`);
  if (fatDiff) changes.push(`체지방률 ${fatDiff}%`);

  const summary = changes.length > 0
    ? `${typeLabel} 완료: ${changes.join(', ')} 변화 및 성실한 출석 달성`
    : `${typeLabel} 완료: PT ${stats.completedPtCount}회 완료 및 운동 루틴 정착`;

  const topExercises = stats.exerciseProgress?.slice(0, 2).map((e) => `${e.exerciseName} 중량 향상`).join(', ') || '주요 근력 운동 수행능력 점진적 증가';

  const trainerFeedback = `이번 점검 기간 동안 PT ${stats.completedPtCount}회와 개인운동 ${stats.completedSoloCount}회를 꾸준히 소화하시며 훌륭한 출석 성실도를 보여주셨습니다. ${topExercises}과 함께 신체 밸런스가 한층 안정되었습니다. 지금의 페이스를 유지하여 다음 목표까지 함께 나아가겠습니다.`;

  const suggestedNextGoals = [
    '주 2회 이상 개인운동 루틴 유지하기',
    '주요 근력 운동 안정된 자세로 중량 점진적 증량',
    '균형 잡힌 영양 섭취 및 수분 보충 습관화'
  ];

  return {
    summary,
    trainerFeedback,
    suggestedNextGoals
  };
}

/**
 * Call Server API to generate PT Session draft from natural language memo
 */
export async function generateAiSessionDraft(
  rawMemo: string,
  context?: AiSessionDraftContext,
  memberId?: string
): Promise<AiSessionDraft> {
  if (isDevSandbox) return fallbackParseSessionMemo(rawMemo);
  try {
    const res = await fetch('/api/ai/session-draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await auth?.currentUser?.getIdToken() || ''}`
      },
      body: JSON.stringify({
        rawMemo,
        memberId,
        context
      })
    });

    if (!res.ok) {
      console.warn(`[AI Service] Server responded with status ${res.status}. Using fallback parser.`);
      return fallbackParseSessionMemo(rawMemo);
    }

    const data = await res.json();
    if (data.success && data.draft) {
      return data.draft;
    }

    console.warn('[AI Service] Invalid draft format from server. Using fallback.');
    return fallbackParseSessionMemo(rawMemo);
  } catch (err) {
    console.warn('[AI Service] Network error calling /api/ai/session-draft. Using graceful fallback.', err);
    return fallbackParseSessionMemo(rawMemo);
  }
}

/**
 * Call Server API to generate Progress Review draft from actual verified metrics
 */
export async function generateAiReviewDraft(
  request: AiReviewDraftRequest,
  memberId?: string
): Promise<AiReviewDraft> {
  if (isDevSandbox) return fallbackGenerateReviewDraft(request);
  try {
    const res = await fetch('/api/ai/review-draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await auth?.currentUser?.getIdToken() || ''}`
      },
      body: JSON.stringify({ ...request, memberId })
    });

    if (!res.ok) {
      console.warn(`[AI Service] Server responded with status ${res.status}. Using fallback review draft.`);
      return fallbackGenerateReviewDraft(request);
    }

    const data = await res.json();
    if (data.success && data.draft) {
      return data.draft;
    }

    console.warn('[AI Service] Invalid review draft from server. Using fallback.');
    return fallbackGenerateReviewDraft(request);
  } catch (err) {
    console.warn('[AI Service] Network error calling /api/ai/review-draft. Using graceful fallback.', err);
    return fallbackGenerateReviewDraft(request);
  }
}
