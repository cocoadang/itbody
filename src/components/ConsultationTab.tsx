import React, { useState, useEffect } from 'react';
import {
  FileText,
  Edit3,
  Save,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  HeartPulse,
  Activity,
  Calendar
} from 'lucide-react';
import type { Consultation, ExercisePurpose, Member } from '../types';
import { getConsultationByMemberId, saveConsultation } from '../services/dataService';
import { useAuth } from '../context/AuthContext';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import { localToday } from '../utils/dateInputUtils';

interface ConsultationTabProps {
  member: Member;
  trainerName?: string;
  onConsultationSaved?: () => void;
}

const PURPOSE_OPTIONS: { value: ExercisePurpose; label: string; icon: string }[] = [
  { value: 'WEIGHT_LOSS', label: '체중 감량 (다이어트)', icon: '🔥' },
  { value: 'MUSCLE_GAIN', label: '근비대 (근육량 증가)', icon: '💪' },
  { value: 'BODY_SHAPE', label: '체형 교정 (자세 개선)', icon: '🧘' },
  { value: 'PAIN_MANAGEMENT', label: '통증 관리 (재활 운동)', icon: '🩺' },
  { value: 'FITNESS', label: '기초 체력 (지구력 향상)', icon: '⚡' },
  { value: 'HABIT', label: '운동 습관 형성', icon: '🌱' },
  { value: 'OTHER', label: '기타 개인 목적', icon: '🎯' }
];

export const ConsultationTab: React.FC<ConsultationTabProps> = ({
  member,
  trainerName = '담당 트레이너',
  onConsultationSaved
}) => {
  const { currentUser } = useAuth();
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [consultationDate, setConsultationDate] = useState(
    localToday()
  );
  const [exercisePurposes, setExercisePurposes] = useState<ExercisePurpose[]>(['FITNESS']);
  const [hasExperience, setHasExperience] = useState(false);
  const [preferredExercises, setPreferredExercises] = useState('');
  const [difficultExercises, setDifficultExercises] = useState('');
  const [pastDuration, setPastDuration] = useState('');
  const [reasonForStop, setReasonForStop] = useState('');

  const [sleepHoursPerDay, setSleepHoursPerDay] = useState<number | string>(7);
  const [workoutDaysPerWeek, setWorkoutDaysPerWeek] = useState<number | string>(3);
  const [availableTimeSlots, setAvailableTimeSlots] = useState('');
  const [jobActivityLevel, setJobActivityLevel] = useState('SEDENTARY');

  const [memberPrecautions, setMemberPrecautions] = useState('');
  const [trainerObservations, setTrainerObservations] = useState('');
  const [initialExercisePlan, setInitialExercisePlan] = useState('');

  // Motivation Interview Questions
  const [biggestReason, setBiggestReason] = useState('');
  const [goalAchievedWish, setGoalAchievedWish] = useState('');
  const [biggestConcern, setBiggestConcern] = useState('');
  const [pastObstacle, setPastObstacle] = useState('');
  const [threeMonthsVision, setThreeMonthsVision] = useState('');

  useEffect(() => {
    loadConsultation();
  }, [member.memberId, member.centerId]);

  const loadConsultation = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const data = await getConsultationByMemberId(
        member.centerId,
        member.memberId,
        currentUser.role,
        currentUser.trainerId
      );
      if (data) {
        setConsultation(data);
        populateForm(data);
        setIsEditing(false);
      } else {
        setConsultation(null);
        setIsEditing(true); // Open directly in editor if empty
      }
    } catch (err) {
      console.error('Failed to load consultation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const populateForm = (data: Consultation) => {
    setConsultationDate(data.consultationDate || data.createdAt.split('T')[0]);
    setExercisePurposes(data.exercisePurposes || []);
    setHasExperience(data.exerciseExperience?.hasExperience || false);
    setPreferredExercises(data.exerciseExperience?.preferredExercises || '');
    setDifficultExercises(data.exerciseExperience?.difficultExercises || '');
    setPastDuration(data.exerciseExperience?.pastDuration || '');
    setReasonForStop(data.exerciseExperience?.reasonForStop || '');

    setSleepHoursPerDay(data.lifestyle?.sleepHoursPerDay ?? 7);
    setWorkoutDaysPerWeek(data.lifestyle?.workoutDaysPerWeek ?? 3);
    setAvailableTimeSlots(data.lifestyle?.availableTimeSlots || '');
    setJobActivityLevel(data.lifestyle?.jobActivityLevel || 'SEDENTARY');

    setMemberPrecautions(data.memberPrecautions || data.precautions || '');
    setTrainerObservations(data.trainerObservations || '');
    setInitialExercisePlan(data.initialExercisePlan || '');

    setBiggestReason(data.motivationInterview?.biggestReason || '');
    setGoalAchievedWish(data.motivationInterview?.goalAchievedWish || '');
    setBiggestConcern(data.motivationInterview?.biggestConcern || '');
    setPastObstacle(data.motivationInterview?.pastObstacle || '');
    setThreeMonthsVision(data.motivationInterview?.threeMonthsVision || '');
  };

  const togglePurpose = (val: ExercisePurpose) => {
    if (exercisePurposes.includes(val)) {
      if (exercisePurposes.length > 1) {
        setExercisePurposes(exercisePurposes.filter((p) => p !== val));
      }
    } else {
      setExercisePurposes([...exercisePurposes, val]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!consultationDate || !isValidDate(consultationDate)) {
      alert('유효한 상담 진행 일자를 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    setIsSaving(true);

    try {
      const saved = await saveConsultation({
        consultationId: consultation?.consultationId,
        centerId: member.centerId,
        memberId: member.memberId,
        trainerId: member.trainerId,
        trainerName: trainerName,
        consultationDate,
        exercisePurposes,
        exerciseExperience: {
          hasExperience,
          preferredExercises,
          difficultExercises,
          pastDuration,
          reasonForStop
        },
        lifestyle: {
          sleepHoursPerDay,
          workoutDaysPerWeek,
          availableTimeSlots,
          jobActivityLevel
        },
        memberPrecautions,
        trainerObservations,
        initialExercisePlan,
        precautions: memberPrecautions, // backward compatibility
        motivationInterview: {
          biggestReason,
          goalAchievedWish,
          biggestConcern,
          pastObstacle,
          threeMonthsVision
        }
      });

      setConsultation(saved);
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (onConsultationSaved) onConsultationSaved();
    } catch (err) {
      console.error('Failed to save consultation:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-stone-500">
        <div className="w-6 h-6 border-2 border-stone-800 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        상담 기록을 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-stone-900">최초 상담 일지</h3>
            {consultation && (
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-medium border border-emerald-200">
                작성 완료
              </span>
            )}
            {!consultation && (
              <span className="text-xs bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full font-medium border border-amber-200">
                상담 미작성
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-1">
            회원의 신체 상황, 생활 습관, 운동 동기를 파악하여 개별화된 트레이닝 계획을 수립합니다.
          </p>
        </div>

        {consultation && !isEditing && (
          <button
            id="btn-edit-consultation"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            상담 내용 수정
          </button>
        )}
      </div>

      {saveSuccess && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          상담 기록이 성공적으로 저장되었습니다.
        </div>
      )}

      {/* VIEW MODE: Rich Card Display */}
      {consultation && !isEditing && (
        <div className="space-y-5">
          {/* Summary Banner */}
          <div className="bg-stone-900 text-white p-6 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-400 mb-4 pb-3 border-b border-stone-800">
              <span className="flex items-center gap-1.5 text-stone-300">
                <Calendar className="w-4 h-4 text-stone-400" />
                상담일자: {consultation.consultationDate}
              </span>
              <span>담당 트레이너: {consultation.trainerName || trainerName}</span>
            </div>

            <div>
              <span className="text-xs font-semibold text-stone-400 block mb-2">설정된 주요 운동 목적</span>
              <div className="flex flex-wrap gap-2">
                {consultation.exercisePurposes.map((p) => {
                  const opt = PURPOSE_OPTIONS.find((o) => o.value === p);
                  return (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-800 text-stone-200 rounded-full text-xs font-medium border border-stone-700"
                    >
                      <span>{opt?.icon}</span>
                      <span>{opt?.label || p}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. 회원이 알려준 운동 시 주의사항 */}
            <div className="bg-amber-50/70 border border-amber-200/80 p-5 rounded-xl">
              <div className="flex items-center gap-2 text-amber-900 font-medium text-sm mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                회원이 알려준 운동 시 주의사항
              </div>
              <p className="text-xs text-amber-950 whitespace-pre-wrap leading-relaxed">
                {consultation.memberPrecautions || consultation.precautions || '기록된 주의사항이 없습니다.'}
              </p>
            </div>

            {/* 2. 트레이너 관찰사항 */}
            <div className="bg-stone-50 border border-stone-200 p-5 rounded-xl">
              <div className="flex items-center gap-2 text-stone-900 font-medium text-sm mb-2">
                <Activity className="w-4 h-4 text-stone-700" />
                트레이너 관찰사항
              </div>
              <p className="text-xs text-stone-700 whitespace-pre-wrap leading-relaxed">
                {consultation.trainerObservations || '기록된 움직임/자세 관찰사항이 없습니다.'}
              </p>
            </div>

            {/* 3. 초기 운동 계획 */}
            <div className="bg-emerald-50/70 border border-emerald-200/80 p-5 rounded-xl">
              <div className="flex items-center gap-2 text-emerald-900 font-medium text-sm mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                초기 운동 계획
              </div>
              <p className="text-xs text-emerald-950 whitespace-pre-wrap leading-relaxed">
                {consultation.initialExercisePlan || '수립된 초기 운동 계획이 없습니다.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Exercise Experience */}
            <div className="bg-white border border-stone-200 p-5 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-stone-900 font-medium text-sm border-b border-stone-100 pb-2">
                <Activity className="w-4 h-4 text-stone-700" />
                운동 경험 및 선호도
              </div>
              <div className="text-xs space-y-2 text-stone-600">
                <div>
                  <span className="font-semibold text-stone-800">과거 경험 유무: </span>
                  {consultation.exerciseExperience.hasExperience ? '유경험자' : '완전 초보자 (경험 없음)'}
                </div>
                {consultation.exerciseExperience.hasExperience && (
                  <>
                    <div>
                      <span className="font-semibold text-stone-800">과거 지속 기간: </span>
                      {consultation.exerciseExperience.pastDuration || '미기재'}
                    </div>
                    <div>
                      <span className="font-semibold text-stone-800">선호하는 운동: </span>
                      {consultation.exerciseExperience.preferredExercises || '미기재'}
                    </div>
                    <div>
                      <span className="font-semibold text-stone-800">어려웠거나 피하고 싶은 운동: </span>
                      {consultation.exerciseExperience.difficultExercises || '미기재'}
                    </div>
                    <div>
                      <span className="font-semibold text-stone-800">과거 중단 사유: </span>
                      {consultation.exerciseExperience.reasonForStop || '미기재'}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Lifestyle */}
            <div className="bg-white border border-stone-200 p-5 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-stone-900 font-medium text-sm border-b border-stone-100 pb-2">
                <Clock className="w-4 h-4 text-stone-700" />
                생활 패턴 및 활동량
              </div>
              <div className="text-xs space-y-2 text-stone-600">
                <div>
                  <span className="font-semibold text-stone-800">하루 평균 수면: </span>
                  {consultation.lifestyle.sleepHoursPerDay || 7}시간
                </div>
                <div>
                  <span className="font-semibold text-stone-800">주당 운동 가능 일수: </span>
                  주 {consultation.lifestyle.workoutDaysPerWeek || 3}일
                </div>
                <div>
                  <span className="font-semibold text-stone-800">희망 운동 시간대: </span>
                  {consultation.lifestyle.availableTimeSlots || '미지정'}
                </div>
                <div>
                  <span className="font-semibold text-stone-800">평소 활동량: </span>
                  {consultation.lifestyle.jobActivityLevel === 'SEDENTARY'
                    ? '좌식 위주 (사무직/앉아서 근무)'
                    : consultation.lifestyle.jobActivityLevel === 'LIGHTLY_ACTIVE'
                    ? '가벼운 활동 (서서 일하거나 이동)'
                    : '활동량 많음'}
                </div>
              </div>
            </div>

            {/* Motivation Interview */}
            <div className="bg-white border border-stone-200 p-5 rounded-xl md:col-span-2 space-y-4">
              <div className="flex items-center gap-2 text-stone-900 font-medium text-sm border-b border-stone-100 pb-2">
                <Sparkles className="w-4 h-4 text-stone-700" />
                동기 및 목표 비전 인터뷰
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-stone-50 rounded-lg">
                  <span className="font-semibold text-stone-800 block mb-1">
                    운동을 결심하게 된 가장 큰 계기
                  </span>
                  <p className="text-stone-600">
                    {consultation.motivationInterview.biggestReason || '기록 없음'}
                  </p>
                </div>

                <div className="p-3 bg-stone-50 rounded-lg">
                  <span className="font-semibold text-stone-800 block mb-1">
                    목표를 달성하면 가장 하고 싶은 것
                  </span>
                  <p className="text-stone-600">
                    {consultation.motivationInterview.goalAchievedWish || '기록 없음'}
                  </p>
                </div>

                <div className="p-3 bg-stone-50 rounded-lg">
                  <span className="font-semibold text-stone-800 block mb-1">
                    운동을 시작하며 가장 걱정되는 점
                  </span>
                  <p className="text-stone-600">
                    {consultation.motivationInterview.biggestConcern || '기록 없음'}
                  </p>
                </div>

                <div className="p-3 bg-stone-50 rounded-lg">
                  <span className="font-semibold text-stone-800 block mb-1">
                    3개월 후 기대하는 나의 모습
                  </span>
                  <p className="text-stone-600 font-medium text-stone-900">
                    {consultation.motivationInterview.threeMonthsVision || '기록 없음'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT / CREATE FORM */}
      {isEditing && (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-6">
            {/* Consultation Date */}
            <div>
              <label htmlFor="input-consultation-date" className="block text-xs font-semibold text-stone-700 mb-1">
                상담 진행 일자
              </label>
              <div className="w-full sm:w-64">
                <DateInputField
                  id="input-consultation-date"
                  required
                  value={consultationDate}
                  onChange={setConsultationDate}
                  className="!text-xs"
                />
              </div>
            </div>

            {/* Exercise Purpose (Multi-select) */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-2">
                운동 목적 (다중 선택 가능)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {PURPOSE_OPTIONS.map((opt) => {
                  const isSelected = exercisePurposes.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => togglePurpose(opt.value)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium border text-left transition-all ${
                        isSelected
                          ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                          : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 1. 회원이 알려준 운동 시 주의사항 */}
            <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-amber-900">
                1. 회원이 알려준 운동 시 주의사항 (비진단성 자발적 공유)
              </label>
              <p className="text-[11px] text-amber-800">
                회원이 운동 중 주의를 요청하거나 과거 불편했던 부위 및 평소 컨디션 특이사항을 기록합니다.
              </p>
              <textarea
                id="input-member-precautions"
                rows={2}
                placeholder="예: 오래 앉아 일하면 허리가 뻐근함, 무거운 짐을 들 때 어깨가 뻐근하게 굳는 느낌 등"
                value={memberPrecautions}
                onChange={(e) => setMemberPrecautions(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* 2. 트레이너 관찰사항 */}
            <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-stone-900">
                2. 트레이너 관찰사항 (비의료적 움직임/자세 관찰)
              </label>
              <p className="text-[11px] text-stone-600">
                기초 체력 및 기본 동작 확인 시 트레이너가 관찰한 움직임 가동범위나 자세 특이점을 기록합니다.
              </p>
              <textarea
                id="input-trainer-observations"
                rows={2}
                placeholder="예: 맨몸 스쿼트 시 발목 가동성 다소 타이트함, 힙힌지 동작 시 고관절 접힘 및 골반 중립 유지 관찰 등"
                value={trainerObservations}
                onChange={(e) => setTrainerObservations(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
              />
            </div>

            {/* 3. 초기 운동 계획 */}
            <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-emerald-900">
                3. 초기 운동 계획 (비의료적 지도 방향성)
              </label>
              <p className="text-[11px] text-emerald-800">
                상담 결과와 운동 목적을 반영하여 향후 2~4주간 진행할 점진적 운동 지도 방향을 수립합니다.
              </p>
              <textarea
                id="input-initial-plan"
                rows={2}
                placeholder="예: 초기 2주간 올바른 복식 호흡과 코어 안정화 선행 후 점진적 하체/등 대근육 분할 루틴 도입"
                value={initialExercisePlan}
                onChange={(e) => setInitialExercisePlan(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Exercise Experience */}
            <div className="border-t border-stone-100 pt-5 space-y-4">
              <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                운동 경험 및 선호도
              </h4>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={!hasExperience}
                    onChange={() => setHasExperience(false)}
                    name="hasExperience"
                    className="text-stone-900 focus:ring-stone-800"
                  />
                  운동 완전 처음 (초보)
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={hasExperience}
                    onChange={() => setHasExperience(true)}
                    name="hasExperience"
                    className="text-stone-900 focus:ring-stone-800"
                  />
                  운동 경험 있음
                </label>
              </div>

              {hasExperience && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      과거 운동 지속 기간
                    </label>
                    <input
                      type="text"
                      placeholder="예: 헬스장 6개월, 필라테스 3개월"
                      value={pastDuration}
                      onChange={(e) => setPastDuration(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      과거 중단 사유
                    </label>
                    <input
                      type="text"
                      placeholder="예: 부상, 동기 부족, 이사 등"
                      value={reasonForStop}
                      onChange={(e) => setReasonForStop(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      선호하거나 재미있던 운동
                    </label>
                    <input
                      type="text"
                      placeholder="예: 스쿼트, 유산소 러닝, 맨몸 운동"
                      value={preferredExercises}
                      onChange={(e) => setPreferredExercises(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      어렵거나 피하고 싶은 운동
                    </label>
                    <input
                      type="text"
                      placeholder="예: 데드리프트, 무릎 부담되는 런지"
                      value={difficultExercises}
                      onChange={(e) => setDifficultExercises(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Lifestyle */}
            <div className="border-t border-stone-100 pt-5 space-y-4">
              <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                생활 습관 및 환경
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    수면 시간 (일평균)
                  </label>
                  <input
                    type="number"
                    min="3"
                    max="15"
                    value={sleepHoursPerDay}
                    onChange={(e) => setSleepHoursPerDay(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    주당 운동 가능 일수
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={workoutDaysPerWeek}
                    onChange={(e) => setWorkoutDaysPerWeek(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    일상 활동량 (직업 특성)
                  </label>
                  <select
                    value={jobActivityLevel}
                    onChange={(e) => setJobActivityLevel(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 bg-white"
                  >
                    <option value="SEDENTARY">좌식 위주 (대부분 앉아서 근무)</option>
                    <option value="LIGHTLY_ACTIVE">가벼운 활동 (서서 일하거나 이동)</option>
                    <option value="MODERATELY_ACTIVE">활동량 많음 (육체 노동 또는 현장직)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  선호 또는 가능한 운동 시간대
                </label>
                <input
                  type="text"
                  placeholder="예: 화/목 저녁 19시, 토요일 오전 10시"
                  value={availableTimeSlots}
                  onChange={(e) => setAvailableTimeSlots(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                />
              </div>
            </div>

            {/* Motivation Interview */}
            <div className="border-t border-stone-100 pt-5 space-y-4">
              <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                동기 및 목표 인터뷰 (지속성 설계를 위한 문진)
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    1. 운동을 시작하게 된 가장 큰 이유는 무엇인가요?
                  </label>
                  <input
                    type="text"
                    placeholder="예: 체력 저하로 인한 피로감 개선, 건강검진 결과 경고"
                    value={biggestReason}
                    onChange={(e) => setBiggestReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    2. 이 목표를 이루면 가장 하고 싶은 것은 무엇인가요?
                  </label>
                  <input
                    type="text"
                    placeholder="예: 주말에 지치지 않고 야외 활동 즐기기, 자신감 있는 옷차림"
                    value={goalAchievedWish}
                    onChange={(e) => setGoalAchievedWish(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    3. 운동하면서 가장 걱정되는 점은 무엇인가요?
                  </label>
                  <input
                    type="text"
                    placeholder="예: 잦은 야근으로 결석할까 봐, 부상에 대한 두려움"
                    value={biggestConcern}
                    onChange={(e) => setBiggestConcern(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    4. 3개월 후 어떤 모습이었으면 좋겠습니까?
                  </label>
                  <input
                    type="text"
                    placeholder="예: 허리 통증 없이 바른 자세로 70kg 스쿼트 수행"
                    value={threeMonthsVision}
                    onChange={(e) => setThreeMonthsVision(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3">
            {consultation && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg bg-white"
              >
                취소
              </button>
            )}
            <button
              id="btn-save-consultation"
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? '저장 중...' : '상담 내용 저장'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
