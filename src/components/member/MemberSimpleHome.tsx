import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { BodyMeasurement, Member, PtContract, PtSession } from '../../types';
import { getPriorityContract } from '../../services/dataService';
import { formatSessionDate, sessionNote } from '../journal/JournalParts';

interface Props {
  member: Member;
  contracts: PtContract[];
  sessions: PtSession[];
  measurements: BodyMeasurement[];
  onOpenSession: (s: PtSession | null) => void;
  onOpenBody: () => void;
}

export const MemberSimpleHome: React.FC<Props> = ({ member, contracts, sessions, measurements, onOpenSession, onOpenBody }) => {
  const contract = getPriorityContract(contracts);
  const remaining = contract ? contract.totalSessions - contract.usedSessions : null;
  const done = sessions.filter((s) => s.status === 'COMPLETED');
  const latest = [...done].sort((a, b) => b.sessionNumber - a.sessionNumber)[0];
  const upcoming = sessions.filter((s) => s.status === 'SCHEDULED').sort((a, b) => a.date.localeCompare(b.date))[0];
  const lastBody = [...measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-stone-900">{member.name}님, 안녕하세요</h2>

      <section className="bg-stone-900 text-white rounded-2xl p-4">
        <p className="text-xs text-stone-300">{contract ? contract.title : 'PT 이용권'}</p>
        {contract ? (
          <p className="mt-1 text-2xl font-bold">
            {contract.usedSessions}<span className="text-base font-medium text-stone-300"> / {contract.totalSessions}회 진행</span>
            <span className="ml-2 text-sm font-semibold text-amber-300">잔여 {remaining}회</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-stone-300">등록된 이용권이 없습니다.</p>
        )}
        {upcoming && <p className="mt-2 text-xs text-stone-300">다음 수업 예정: {formatSessionDate(upcoming.date)} {upcoming.time}</p>}
      </section>

      <button type="button" onClick={() => onOpenSession(latest || null)} className="w-full text-left bg-white rounded-2xl border border-stone-200 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-stone-900">최근 수업 일지</span>
          <ChevronRight className="w-4 h-4 text-stone-400" />
        </div>
        {latest ? (
          <>
            <p className="text-xs text-stone-500 mt-1">{latest.sessionNumber}회차 · {formatSessionDate(latest.date)}</p>
            <p className="text-sm text-stone-800 mt-1.5 line-clamp-3 whitespace-pre-wrap">{sessionNote(latest) || (latest.exercises || []).map((e) => e.exerciseName).join(', ') || '기록을 확인해보세요.'}</p>
            <p className="text-xs text-amber-700 mt-2">수업 후 느낀 점이나 불편한 곳이 있으면 일지에 댓글로 남겨주세요.</p>
          </>
        ) : (
          <p className="text-sm text-stone-500 mt-1">아직 기록된 수업이 없습니다.</p>
        )}
      </button>

      <button type="button" onClick={onOpenBody} className="w-full text-left bg-white rounded-2xl border border-stone-200 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-stone-900">몸 변화</span>
          <ChevronRight className="w-4 h-4 text-stone-400" />
        </div>
        {lastBody ? (
          <p className="text-sm text-stone-700 mt-1.5">
            {lastBody.measuredAt} 측정 · {[
              lastBody.weightKg !== undefined && `체중 ${lastBody.weightKg}kg`,
              lastBody.skeletalMuscleMassKg !== undefined && `골격근 ${lastBody.skeletalMuscleMassKg}kg`,
              lastBody.bodyFatPercentage !== undefined && `체지방 ${lastBody.bodyFatPercentage}%`
            ].filter(Boolean).join(' · ')}
          </p>
        ) : (
          <p className="text-sm text-stone-500 mt-1">아직 측정 기록이 없습니다.</p>
        )}
      </button>
    </div>
  );
};
