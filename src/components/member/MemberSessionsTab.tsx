import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Dumbbell,
  CheckCircle2,
  CalendarClock,
  AlertCircle,
  XCircle,
  ChevronRight,
  X,
  Sparkles,
  Award
} from 'lucide-react';
import type { PtSession, SessionStatus } from '../../types';

interface MemberSessionsTabProps {
  sessions: PtSession[];
  initialSelectedSession?: PtSession | null;
}

const STATUS_LABELS: Record<SessionStatus, { label: string; color: string }> = {
  COMPLETED: { label: '완료', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  SCHEDULED: { label: '예약됨', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  CANCELLED: { label: '취소', color: 'bg-stone-100 text-stone-600 border-stone-200' }
};

export const MemberSessionsTab: React.FC<MemberSessionsTabProps> = ({
  sessions,
  initialSelectedSession = null
}) => {
  const [filter, setFilter] = useState<'ALL' | 'COMPLETED' | 'SCHEDULED'>('ALL');
  const [selectedSession, setSelectedSession] = useState<PtSession | null>(initialSelectedSession);

  const filteredSessions = sessions.filter((s) => {
    if (filter === 'COMPLETED') return s.status === 'COMPLETED';
    if (filter === 'SCHEDULED') return s.status === 'SCHEDULED';
    return true;
  });

  return (
    <div className="space-y-4 pb-6" id="member-sessions-view">
      {/* 1. Header Filter Bar */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-stone-900">
          수업 일지 ({filteredSessions.length}회차)
        </h2>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              filter === 'ALL'
                ? 'bg-white text-stone-900 shadow-2xs font-bold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => setFilter('COMPLETED')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              filter === 'COMPLETED'
                ? 'bg-white text-stone-900 shadow-2xs font-bold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            완료
          </button>
          <button
            type="button"
            onClick={() => setFilter('SCHEDULED')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              filter === 'SCHEDULED'
                ? 'bg-white text-stone-900 shadow-2xs font-bold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            예정
          </button>
        </div>
      </div>

      {/* 2. Sessions List */}
      {filteredSessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center space-y-2">
          <Clock className="w-8 h-8 text-stone-300 mx-auto" />
          <p className="text-xs text-stone-500">해당 상태의 수업 일지가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session) => {
            const statusConfig = STATUS_LABELS[session.status] || STATUS_LABELS.COMPLETED;
            const exerciseCount = session.exercises?.length || 0;

            // Compute total volume for this session
            const totalVolume = (session.exercises || []).reduce((acc, ex) => {
              const exVol = (ex.sets || []).reduce(
                (sAcc, s) => sAcc + (s.weight || 0) * (s.reps || 0),
                0
              );
              return acc + exVol;
            }, 0);

            // Member-safe feedback only
            const feedbackText = session.memberFeedback || session.trainerFeedback;

            return (
              <div
                key={session.sessionId}
                id={`session-card-${session.sessionId}`}
                onClick={() => setSelectedSession(session)}
                className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-xs hover:border-purple-300 transition-all cursor-pointer space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-stone-900">
                        {session.sessionNumber}회차 수업
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                    </div>
                    <span className="text-xs text-stone-500 flex items-center gap-1.5 mt-1 font-mono">
                      <Calendar className="w-3.5 h-3.5" />
                      {session.date} {session.time ? `• ${session.time}` : ''}
                    </span>
                  </div>

                  <span className="text-xs text-purple-700 font-semibold flex items-center gap-0.5">
                    상세보기 <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>

                {/* Exercises summary chips */}
                {session.exercises && session.exercises.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-stone-100">
                    <div className="flex items-center justify-between text-[11px] text-stone-500">
                      <span>수행 종목 ({exerciseCount}개)</span>
                      {totalVolume > 0 && (
                        <span className="font-mono">총 볼륨: {totalVolume.toLocaleString()}kg</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {session.exercises.map((ex, idx) => {
                        const maxW = Math.max(...(ex.sets || []).map((s) => s.weight || 0), 0);
                        return (
                          <span
                            key={idx}
                            className="text-[11px] bg-stone-50 text-stone-700 px-2 py-0.5 rounded-md border border-stone-200/70"
                          >
                            {ex.exerciseName} ({ex.sets?.length || 0}세트{maxW > 0 ? ` • ${maxW}kg` : ''})
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Member-visible Trainer Feedback Snippet */}
                {feedbackText && (
                  <div className="bg-purple-50/60 p-2.5 rounded-xl border border-purple-100/80 text-xs text-stone-700 flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                    <p className="line-clamp-2 leading-relaxed italic">
                      "{feedbackText}"
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Session Detail Modal */}
      {selectedSession && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-2xs"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg shadow-2xl p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            id="session-detail-modal"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-stone-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-stone-900">
                    {selectedSession.sessionNumber}회차 수업 상세
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      STATUS_LABELS[selectedSession.status]?.color || STATUS_LABELS.COMPLETED.color
                    }`}
                  >
                    {STATUS_LABELS[selectedSession.status]?.label || '완료'}
                  </span>
                </div>
                <p className="text-xs text-stone-500 font-mono mt-1">
                  일시: {selectedSession.date} {selectedSession.time || ''}
                </p>
              </div>
              <button
                type="button"
                id="btn-close-session-modal"
                onClick={() => setSelectedSession(null)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Trainer's Feedback to Member (Strictly memberFeedback / trainerFeedback only) */}
            {(selectedSession.memberFeedback || selectedSession.trainerFeedback) && (
              <div className="bg-purple-50 rounded-2xl border border-purple-200/80 p-4 space-y-1.5">
                <h4 className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  담당 트레이너 수업 피드백
                </h4>
                <p className="text-xs text-stone-800 leading-relaxed whitespace-pre-line">
                  {selectedSession.memberFeedback || selectedSession.trainerFeedback}
                </p>
              </div>
            )}

            {/* Exercises Performed */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Dumbbell className="w-4 h-4 text-stone-800" />
                수행 운동 종목 세부 기록
              </h4>

              {(!selectedSession.exercises || selectedSession.exercises.length === 0) ? (
                <p className="text-xs text-stone-400 py-3 text-center">
                  기록된 운동 세트가 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedSession.exercises.map((ex, exIdx) => {
                    const exVolume = (ex.sets || []).reduce(
                      (acc, s) => acc + (s.weight || 0) * (s.reps || 0),
                      0
                    );

                    return (
                      <div
                        key={exIdx}
                        className="bg-stone-50 rounded-xl border border-stone-200 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-stone-900">
                            {exIdx + 1}. {ex.exerciseName}
                          </span>
                          <span className="text-[11px] font-mono text-stone-500">
                            {ex.sets?.length || 0}세트 • {exVolume.toLocaleString()}kg
                          </span>
                        </div>

                        {/* Sets table */}
                        <div className="bg-white rounded-lg border border-stone-200/80 overflow-hidden">
                          <table className="w-full text-center text-xs">
                            <thead className="bg-stone-100/70 text-stone-500 font-semibold text-[11px]">
                              <tr>
                                <th className="py-1.5 px-2">세트</th>
                                <th className="py-1.5 px-2">중량(kg)</th>
                                <th className="py-1.5 px-2">반복 횟수</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100 font-mono">
                              {(ex.sets || []).map((set) => (
                                <tr key={set.setNumber} className="hover:bg-stone-50/50">
                                  <td className="py-1.5 px-2 font-bold text-stone-700">
                                    {set.setNumber}
                                  </td>
                                  <td className="py-1.5 px-2 text-stone-900 font-bold">
                                    {set.weight} kg
                                  </td>
                                  <td className="py-1.5 px-2 text-stone-800">
                                    {set.reps} 회
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {ex.memo && (
                          <p className="text-[11px] text-stone-500 italic px-1">
                            메모: {ex.memo}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="w-full py-2.5 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
