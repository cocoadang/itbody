export type UserRole = 'CENTER_ADMIN' | 'TRAINER' | 'MEMBER';

export type MemberStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

export type TrainerStatus = 'ACTIVE' | 'INACTIVE';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  centerId: string;
  trainerId?: string;
  memberId?: string;
}

export interface Center {
  centerId: string;
  name: string;
  address: string;
  phone: string;
  businessNumber: string;
  createdAt: string;
  updatedAt: string;
}

export interface Trainer {
  trainerId: string;
  centerId: string;
  name: string;
  phone: string;
  specialty: string;
  role: 'TRAINER' | 'CENTER_ADMIN';
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt?: string;
  uid?: string;
  loginEmail?: string;
  bio?: string;
}

export interface ProgressPhotoConsent {
  granted: boolean;
  grantedAt?: string;
  consentedAt?: string;
  consentedBy?: string;
  revokedAt?: string;
  revokedBy?: string;
}

export interface Member {
  memberId: string;
  centerId: string;
  trainerId: string;
  name: string;
  gender: Gender;
  birthDate: string; // YYYY-MM-DD
  phone: string;
  email?: string | null;
  uid?: string | null;
  startDate: string; // YYYY-MM-DD
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  sourceLeadId?: string | null;
  progressPhotoConsent?: ProgressPhotoConsent;
}

// ==========================================
// PHASE 2: CONSULTATION
// ==========================================

export type ExercisePurpose =
  | 'WEIGHT_LOSS'
  | 'MUSCLE_GAIN'
  | 'BODY_SHAPE'
  | 'PAIN_MANAGEMENT'
  | 'FITNESS'
  | 'HABIT'
  | 'OTHER';

export interface ExerciseExperience {
  hasExperience: boolean;
  preferredExercises?: string;
  difficultExercises?: string;
  pastDuration?: string;
  reasonForStop?: string;
}

export interface Lifestyle {
  sleepHoursPerDay?: number | string;
  workoutDaysPerWeek?: number | string;
  availableTimeSlots?: string;
  jobActivityLevel?: 'SEDENTARY' | 'LIGHTLY_ACTIVE' | 'MODERATELY_ACTIVE' | 'VERY_ACTIVE' | string;
}

export interface MotivationInterview {
  biggestReason: string; // 운동을 시작하게 된 가장 큰 이유는 무엇인가?
  goalAchievedWish: string; // 이 목표를 이루면 가장 하고 싶은 것은 무엇인가?
  biggestConcern: string; // 운동하면서 가장 걱정되는 것은 무엇인가?
  pastObstacle: string; // 과거 운동을 지속하기 어려웠던 이유는 무엇인가?
  threeMonthsVision: string; // 3개월 후 어떤 모습이었으면 좋겠는가?
}

export interface Consultation {
  consultationId: string;
  centerId: string;
  memberId: string;
  trainerId: string;
  trainerName?: string;
  consultationDate: string; // YYYY-MM-DD
  exercisePurposes: ExercisePurpose[];
  exerciseExperience: ExerciseExperience;
  lifestyle: Lifestyle;
  memberPrecautions: string; // 회원이 알려준 운동 시 주의사항 (비진단성)
  trainerObservations?: string; // 트레이너 관찰사항 (가벼운 움직임/자세 관찰)
  initialExercisePlan?: string; // 초기 운동 계획 (비의료적 지도 방향성)
  precautions?: string; // 하위 호환용 필드
  motivationInterview: MotivationInterview;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 2: MEMBER GOALS
// ==========================================

export type GoalCategory =
  | 'BODY_COMPOSITION'
  | 'PERFORMANCE'
  | 'HABIT'
  | 'REHAB_POSTURE'
  | 'OTHER';

export type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'PAUSED' | 'CANCELLED';

export type GoalMetricKey =
  | 'WEIGHT_KG'
  | 'BODY_FAT_PERCENTAGE'
  | 'SKELETAL_MUSCLE_MASS_KG'
  | 'BODY_FAT_MASS_KG'
  | 'WAIST_CM'
  | 'weightKg'
  | 'bodyFatPercentage'
  | 'skeletalMuscleMassKg'
  | 'bodyFatMassKg'
  | 'waistCm'
  | 'EXERCISE_MAX_WEIGHT'
  | 'EXERCISE_MAX_REPS'
  | 'WORKOUT_FREQUENCY'
  | 'OTHER';

export interface MemberGoal {
  goalId: string;
  centerId: string;
  memberId: string;
  trainerId: string;
  category: GoalCategory;
  title: string;
  description?: string;
  targetValue?: number | string;
  targetUnit?: string;
  targetDate?: string; // YYYY-MM-DD
  status: GoalStatus;
  metricKey?: GoalMetricKey;
  exerciseName?: string;
  startValue?: number | string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

// ==========================================
// PHASE 2: PT CONTRACTS
// ==========================================

export type ContractStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export interface PtContract {
  contractId: string;
  centerId: string;
  memberId: string;
  trainerId: string;
  title: string; // e.g. "정규 1:1 PT 30회권"
  totalSessions: number;
  usedSessions: number;
  // remainingSessions = totalSessions - usedSessions
  startDate: string; // YYYY-MM-DD
  expirationDate: string; // YYYY-MM-DD
  status: ContractStatus;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 2: PT SESSIONS (Expanded)
// ==========================================

export type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type MemberCondition = 'EXCELLENT' | 'GOOD' | 'NORMAL' | 'TIRED' | 'POOR';

export interface ExerciseSet {
  setNumber: number;
  weight: number; // in kg (0 for bodyweight)
  reps: number;
}

export interface ExerciseRecord {
  exerciseName: string;
  sets: ExerciseSet[];
  memo?: string;
}

export interface PtSession {
  sessionId: string;
  centerId: string;
  trainerId: string;
  trainerName?: string;
  memberId: string;
  memberName: string;
  contractId: string; // Explicitly tied to PtContract (SSOT for remaining calculation)
  sessionNumber: number; // e.g. 1, 2, 3 ...
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: SessionStatus;
  memberCondition?: MemberCondition;
  sessionNotes?: string; // Legacy field for trainer internal notes
  internalNote?: string; // Trainer internal note (Strictly prohibited from MEMBER view)
  trainerFeedback?: string; // Member-facing feedback
  memberFeedback?: string; // Member-facing feedback
  nextSessionGoal?: string;
  exercises: ExerciseRecord[];
  media?: SessionMedia[]; // Photos/videos attached by staff via the journal API
  createdAt: string;
  updatedAt?: string;
}

export interface SessionMedia {
  mediaId: string;
  kind: 'image' | 'video';
  contentType: string;
  url: string;
  storagePath: string;
  name?: string;
  size?: number;
  createdAt: string;
}

export interface SessionComment {
  commentId: string;
  sessionId: string;
  sessionNumber: number;
  memberId: string;
  authorRole: 'MEMBER' | 'STAFF';
  authorName: string;
  text: string;
  createdAt: string;
  readByStaffAt: string | null;
  memberName?: string;
}

// ==========================================
// PHASE 2: TIMELINE & DASHBOARD ATTENTION
// ==========================================

export type TimelineEventType =
  | 'CONSULTATION'
  | 'GOAL'
  | 'CONTRACT'
  | 'PT_SESSION'
  | 'BODY_MEASUREMENT'
  | 'PROGRESS_PHOTO'
  | 'PROGRESS_REVIEW'
  | 'PERSONAL_WORKOUT';

export interface TimelineEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string;
  type: TimelineEventType;
  title: string;
  description: string;
  badgeText?: string;
  badgeColor?: string;
  meta?: Record<string, unknown>;
}

export type AttentionReasonCode =
  | 'LOW_REMAINING_SESSIONS'
  | 'LONG_ABSENCE'
  | 'NO_GOAL'
  | 'NO_CONSULTATION'
  | 'PROGRESS_REVIEW_DUE';

export interface AttentionMemberItem {
  member: Member;
  reasons: string[]; // e.g. ["PT 잔여 4회 남음", "최근 수업 후 15일 경과"]
  reasonCodes: AttentionReasonCode[];
  remainingSessions?: number;
  daysSinceLastPt?: number;
  hasConsultation: boolean;
  activeGoalCount: number;
}

export interface DashboardMetrics {
  todayPtCount: number;
  activeMemberCount: number;
  needsAttentionCount: number;
  recentRegistrationCount: number;
}

// ==========================================
// PHASE 3: BODY MEASUREMENTS
// ==========================================

export interface BodyMeasurement {
  measurementId: string;
  centerId: string;
  memberId: string;
  trainerId: string;
  measuredAt: string; // YYYY-MM-DD
  weightKg?: number;
  skeletalMuscleMassKg?: number;
  bodyFatMassKg?: number;
  bodyFatPercentage?: number;
  waistCm?: number;
  hipCm?: number;
  chestCm?: number;
  thighCm?: number;
  armCm?: number;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 4: PROGRESS PHOTOS (체형 비교 사진)
// ==========================================

export type PhotoViewType = 'FRONT' | 'SIDE' | 'BACK' | 'OTHER';

export interface ProgressPhoto {
  photoId: string;
  centerId: string;
  memberId: string;
  trainerId: string;
  takenAt: string; // YYYY-MM-DD
  viewType: PhotoViewType;
  storagePath: string;
  photoUrl?: string; // Client resolved preview / download URL
  caption?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 4: PROGRESS REVIEWS (성과 리뷰)
// ==========================================

export type ProgressReviewType =
  | 'TEN_SESSION'
  | 'TWENTY_SESSION'
  | 'CONTRACT_END'
  | 'MANUAL';

export interface ProgressReview {
  reviewId: string;
  centerId: string;
  memberId: string;
  trainerId: string;
  contractId?: string;
  reviewType: ProgressReviewType;
  reviewDate: string; // YYYY-MM-DD
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  summary: string;
  trainerFeedback: string;
  nextGoals?: string[];
  milestoneSessionCount?: number; // 10, 20, 30, 40, etc.
  completedSessionCountAtReview?: number;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 6: EXERCISE LIBRARY (운동 라이브러리)
// ==========================================

export interface Exercise {
  repUnit?: 'reps' | 'seconds';
  exerciseId: string;
  centerId: string;
  name: string; // 운동명 (예: 바벨 백 스쿼트)
  category: string; // 카테고리 (웨이트, 유산소, 맨몸, 머신, 스트레칭 등)
  bodyPart: string; // 운동부위 (가슴, 등, 하체, 어깨, 팔, 복근, 전신 등)
  equipment: string; // 운동기구 (바벨, 덤벨, 머신, 케이블, 맨몸 등)
  description?: string; // 운동 설명 및 주의사항
  videoUrl?: string; // 영상 URL 또는 Firebase Storage 영상
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 6: PERSONAL WORKOUT PLAN (개인운동 배정)
// ==========================================

export interface PersonalWorkoutTargetSet {
  setNumber: number;
  targetWeight: number; // kg (0 for bodyweight)
  targetReps: number;
  targetRpe?: number;
}

export interface PersonalWorkoutPlanExercise {
  exerciseId: string;
  exerciseName: string;
  repUnit?: 'reps' | 'seconds'; // absent in legacy records means repetitions
  bodyPart?: string;
  equipment?: string;
  targetSets: PersonalWorkoutTargetSet[];
  guideNote?: string;
  restSeconds?: number; // 세트 간 권장 휴식 시간 (초, e.g. 30, 60, 90)
}

export type PersonalWorkoutPlanStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export interface PersonalWorkoutPlan {
  planId: string;
  memberId: string;
  memberName?: string;
  trainerId: string;
  trainerName?: string;
  centerId: string;
  date: string; // YYYY-MM-DD
  title: string; // e.g. "하체 & 코어 강화 루틴"
  exercises: PersonalWorkoutPlanExercise[];
  trainerInstructions?: string; // 트레이너 가이드 설명
  status: PersonalWorkoutPlanStatus;
  createdAt: string;
  updatedAt: string;
}

// Routine Template for reuse
export interface WorkoutTemplate {
  templateId: string;
  centerId: string;
  trainerId: string;
  title: string;
  category?: string;
  description?: string;
  exercises: PersonalWorkoutPlanExercise[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 6: PERSONAL WORKOUT LOG (개인운동 기록)
// ==========================================

export interface PersonalWorkoutActualSet {
  setNumber: number;
  weight: number; // 실제 수행 중량 (kg)
  reps: number; // 실제 수행 횟수
  completed: boolean; // 완료 여부
}

export interface PersonalWorkoutLogExercise {
  exerciseId: string;
  exerciseName: string;
  repUnit?: 'reps' | 'seconds'; // absent in legacy records means repetitions
  actualSets: PersonalWorkoutActualSet[];
  notes?: string;
}

export interface PersonalWorkoutLog {
  logId: string;
  planId?: string; // 연결된 plan ID (target과 actual 분리)
  memberId: string;
  memberName?: string;
  trainerId: string;
  trainerName?: string;
  centerId: string;
  date: string; // YYYY-MM-DD
  completedExercises: PersonalWorkoutLogExercise[];
  startTime?: string; // HH:mm or ISO
  completedAt?: string; // HH:mm or ISO
  memberMemo?: string; // 회원 메모
  trainerFeedback?: string; // 트레이너 피드백
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyActivitySummary {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (Sunday)
  ptCount: number; // PT 완료 횟수
  soloCount: number; // 개인운동 완료 횟수
  totalCount: number; // 총 운동 횟수
}

// ==========================================
// PHASE 7: AI RECORDING ASSISTANT
// ==========================================

export interface AiSessionDraft {
  exercises: ExerciseRecord[];
  memberFeedback: string;
  nextSessionGoal: string;
  internalNote: string;
}

export interface AiSessionDraftContext {
  recentPtSessions?: Array<{
    date: string;
    sessionNumber: number;
    exercises: Array<{ exerciseName: string; sets: Array<{ weight: number; reps: number }> }>;
  }>;
  recentSoloWorkouts?: Array<{
    date: string;
    exercises: Array<{ exerciseName: string; sets: Array<{ weight: number; reps: number }> }>;
    memberMemo?: string;
  }>;
  activeGoals?: Array<{
    title: string;
    targetValue?: string | number;
  }>;
}

export interface AiSessionDraftRequest {
  rawMemo: string;
  context?: AiSessionDraftContext;
}

export interface AiReviewDraft {
  summary: string;
  trainerFeedback: string;
  suggestedNextGoals: string[];
}

export interface AiReviewDraftRequest {
  reviewType: string;
  period: { start: string; end: string };
  stats: {
    completedPtCount: number;
    completedSoloCount: number;
    bodyChanges?: {
      weightChange?: string | number;
      muscleChange?: string | number;
      fatPercentageChange?: string | number;
      waistChange?: string | number;
    };
    exerciseProgress?: Array<{
      exerciseName: string;
      startWeight?: number;
      currentWeight?: number;
      maxWeightDiff?: number;
    }>;
    achievedGoals?: string[];
    inProgressGoals?: string[];
  };
  trainerNotes?: string;
}

// ==========================================
// PHASE 8A: LEAD & OT MANAGEMENT (신규문의 및 OT 관리)
// ==========================================

export type LeadStatus =
  | 'NEW'
  | 'CONSULTING'
  | 'OT_SCHEDULED'
  | 'OT_COMPLETED'
  | 'REGISTERED'
  | 'LOST';

export type LeadSource =
  | 'VISIT'
  | 'PHONE'
  | 'REFERRAL'
  | 'ONLINE'
  | 'OTHER'
  | '방문'
  | '전화'
  | '소개'
  | '온라인'
  | '기타';

export type LeadLostReason =
  | 'PRICE'
  | 'TIME'
  | 'DISTANCE'
  | 'STOP_EXERCISE'
  | 'OTHER_CENTER'
  | 'OTHER'
  | '가격'
  | '시간'
  | '거리'
  | '운동중단'
  | '타센터'
  | '기타';

export interface Lead {
  leadId: string;
  centerId: string;
  name: string;
  phone: string;
  inquiryDate: string; // YYYY-MM-DD
  source: LeadSource;
  status: LeadStatus;
  assignedTrainerId?: string | null;
  assignedTrainerName?: string | null;
  otDate?: string | null;
  otCompletedAt?: string | null;
  memo?: string;
  createdAt: string;
  updatedAt: string;

  // 미등록 시
  lostReason?: LeadLostReason | string | null;
  lostMemo?: string | null;

  // 등록 시
  convertedMemberId?: string | null;
  registeredAt?: string | null;
}

// ==========================================
// PHASE 9: PT RENEWALS (재등록 관리)
// ==========================================

export type RenewalStatus =
  | 'TARGET' // 재등록 대상
  | 'CONTACTED' // 상담예정/접촉
  | 'CONSULTING' // 상담중
  | 'RENEWED' // 재등록 완료
  | 'DECLINED' // 재등록 거절
  | 'CLOSED'; // 종료

export type RenewalDeclineReason =
  | 'PRICE'
  | 'TIME'
  | 'DISTANCE'
  | 'TRAINER'
  | 'STOP_EXERCISE'
  | 'OTHER_CENTER'
  | 'OTHER';

export interface Renewal {
  renewalId: string;
  centerId: string;
  memberId: string;
  trainerId: string;
  contractId: string;
  status: RenewalStatus;
  remainingSessionsAtStart: number;
  startedAt: string; // ISO string
  consultationDate?: string | null; // YYYY-MM-DD
  memo?: string | null;
  createdAt: string;
  updatedAt: string;

  // 재등록 거절 시
  declineReason?: RenewalDeclineReason | null;
  declineMemo?: string | null;

  // 재등록 성공 시
  renewedContractId?: string | null;
  renewedAt?: string | null;
}

export interface RenewalCandidate {
  memberId: string;
  memberName: string;
  trainerId: string;
  trainerName?: string;
  contractId: string;
  contractTitle: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  contractStatus: ContractStatus;
  expirationDate: string;
  existingRenewal?: Renewal | null;
}




