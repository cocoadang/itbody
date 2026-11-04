import React from 'react';
import {
  Target,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Sparkles,
  Heart,
  Award
} from 'lucide-react';
import type { MemberGoal, Consultation } from '../../types';

interface MemberGoalsTabProps {
  goals: MemberGoal[];
  consultation: Consultation | null;
}

export const MemberGoalsTab: React.FC<MemberGoalsTabProps> = ({ goals, consultation }) => {
  const activeGoals = goals.filter((g) => g.status === 'ACTIVE');
  const achievedGoals = goals.filter((g) => g.status === 'ACHIEVED');

  return (
    <div className="space-y-4 pb-6" id="member-goals-view">
      {/* 1. Consultation Motivation Card */}
      {consultation && (
        <div className="bg-gradient-to-br from-purple-50/80 via-white to-purple-50/40 rounded-2xl border border-purple-200/90 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-purple-900">
            <Heart className="w-4 h-4 text-purple-600 fill-purple-200" />
            <h3 className="text-xs font-bold">내가 처음 PT를 시작한 이유</h3>
          </div>

          <div className="space-y-2 text-xs">
            {consultation.exercisePurposes && consultation.exercisePurposes.length > 0 && (
              <div>
                <span className="text-stone-500 text-[11px] block">상담 시 주요 운동 목적</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {consultation.exercisePurposes.map((p, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold text-[11px]"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {consultation.motivationInterview?.biggestReason && (
              <div className="pt-1">
                <span className="text-stone-500 text-[11px] block">결심하게 된 가장 큰 계기</span>
                <p className="mt-1 p-3 bg-white rounded-xl border border-purple-100 text-stone-800 italic leading-relaxed">
                  "{consultation.motivationInterview.biggestReason}"
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Goals Progress Summary */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-stone-900">
          운동 목표 관리 ({goals.length}개)
        </h2>
        <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
          달성률 {goals.length > 0 ? Math.round((achievedGoals.length / goals.length) * 100) : 0}%
        </span>
      </div>

      {/* 3. In Progress Goals */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-stone-700 flex items-center gap-1.5 px-1">
          <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
          현재 진행 중인 목표 ({activeGoals.length}개)
        </h3>

        {activeGoals.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 text-center text-xs text-stone-400">
            현재 진행 중인 목표가 없습니다.
          </div>
        ) : (
          <div className="space-y-2.5">
            {activeGoals.map((goal) => (
              <div
                key={goal.goalId}
                className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-sm font-bold text-stone-900 block">{goal.title}</span>
                    {goal.targetDate && (
                      <span className="text-[11px] text-stone-400 flex items-center gap-1 mt-0.5 font-mono">
                        <Calendar className="w-3 h-3" />
                        목표 기한: {goal.targetDate}
                      </span>
                    )}
                  </div>
                  {goal.targetValue && (
                    <span className="text-xs font-mono font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200 shrink-0">
                      목표 {goal.targetValue} {goal.targetUnit}
                    </span>
                  )}
                </div>

                {goal.description && (
                  <p className="text-xs text-stone-600 pt-1 border-t border-stone-100">
                    {goal.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Achieved Goals */}
      <div className="space-y-2.5 pt-2">
        <h3 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 px-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          멋지게 달성한 목표 ({achievedGoals.length}개)
        </h3>

        {achievedGoals.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 text-center text-xs text-stone-400">
            아직 달성 완료된 목표가 없습니다.
          </div>
        ) : (
          <div className="space-y-2.5">
            {achievedGoals.map((goal) => (
              <div
                key={goal.goalId}
                className="bg-emerald-50/50 rounded-2xl border border-emerald-200/80 p-4 shadow-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-sm font-bold text-stone-900 block">{goal.title}</span>
                      {goal.targetDate && (
                        <span className="text-[11px] text-stone-400 font-mono">
                          기한: {goal.targetDate}
                        </span>
                      )}
                    </div>
                  </div>
                  {goal.targetValue && (
                    <span className="text-xs font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                      {goal.targetValue} {goal.targetUnit}
                    </span>
                  )}
                </div>
                {goal.description && (
                  <p className="text-xs text-stone-600 pl-6">{goal.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
