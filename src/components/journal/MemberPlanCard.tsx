import React, { useEffect, useState } from 'react';
import { ClipboardList, Edit2 } from 'lucide-react';
import type { MemberPlan } from '../../types';
import { getMemberPlan, saveMemberPlan } from '../../services/journalService';

const DAYS: Array<[keyof MemberPlan['weekly'], string]> = [
  ['mon', '월'], ['tue', '화'], ['wed', '수'], ['thu', '목'], ['fri', '금'], ['sat', '토'], ['sun', '일']
];
const SPLITS = ['', '밀기', '당기기', '하체', '상체', '전신', '복습', '유산소', '휴식'];
const EMPTY_WEEK: MemberPlan['weekly'] = { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' };

type Draft = Pick<MemberPlan, 'goals' | 'weekly' | 'proteinPerKg' | 'cardio' | 'notes'>;
const emptyDraft = (): Draft => ({ goals: '', weekly: { ...EMPTY_WEEK }, proteinPerKg: null, cardio: '', notes: '' });

function proteinLine(weightKg: number | undefined, perKg: number | null) {
  if (!perKg) return null;
  if (!weightKg) return `체중 1kg당 단백질 ${perKg}g`;
  return `하루 단백질 ${Math.round(weightKg * perKg)}g 이상 (체중 ${weightKg}kg × ${perKg}g)`;
}

const PlanView: React.FC<{ plan: Draft; weightKg?: number }> = ({ plan, weightKg }) => {
  const hasWeek = DAYS.some(([d]) => plan.weekly[d]);
  const protein = proteinLine(weightKg, plan.proteinPerKg);
  return (
    <div className="space-y-3 text-sm text-stone-800">
      {plan.goals && (
        <div>
          <p className="text-xs font-semibold text-stone-500 mb-0.5">목표</p>
          <p className="whitespace-pre-wrap">{plan.goals}</p>
        </div>
      )}
      {hasWeek && (
        <div>
          <p className="text-xs font-semibold text-stone-500 mb-1">주간 운동 계획</p>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DAYS.map(([d, label]) => (
              <div key={d} className={`rounded-lg py-1.5 ${plan.weekly[d] === '휴식' || !plan.weekly[d] ? 'bg-stone-50 text-stone-400' : 'bg-stone-900 text-white'}`}>
                <div className="text-[11px]">{label}</div>
                <div className="text-[11px] font-semibold leading-tight min-h-[14px]">{plan.weekly[d] || '-'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {protein && (
        <div>
          <p className="text-xs font-semibold text-stone-500 mb-0.5">영양</p>
          <p>{protein}</p>
        </div>
      )}
      {plan.cardio && (
        <div>
          <p className="text-xs font-semibold text-stone-500 mb-0.5">유산소</p>
          <p className="whitespace-pre-wrap">{plan.cardio}</p>
        </div>
      )}
      {plan.notes && (
        <div>
          <p className="text-xs font-semibold text-stone-500 mb-0.5">바디 컨설팅 메모</p>
          <p className="whitespace-pre-wrap">{plan.notes}</p>
        </div>
      )}
    </div>
  );
};

const isEmpty = (p: Draft) => !p.goals && !p.cardio && !p.notes && !p.proteinPerKg && !DAYS.some(([d]) => p.weekly[d]);

/** Member home: read-only "나의 관리 계획". Hidden until the trainer writes one. */
export const MemberPlanSummary: React.FC<{ memberId: string; weightKg?: number }> = ({ memberId, weightKg }) => {
  const [plan, setPlan] = useState<MemberPlan | null>(null);
  useEffect(() => {
    getMemberPlan(memberId).then(setPlan).catch(() => setPlan(null));
  }, [memberId]);
  if (!plan || isEmpty(plan)) return null;
  return (
    <section className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> 나의 관리 계획</h3>
      <PlanView plan={plan} weightKg={weightKg} />
    </section>
  );
};

/** Trainer: view and edit the member's plan. */
export const MemberPlanEditor: React.FC<{ memberId: string; canEdit: boolean; weightKg?: number }> = ({ memberId, canEdit, weightKg }) => {
  const [plan, setPlan] = useState<MemberPlan | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getMemberPlan(memberId)
      .then((p) => { setPlan(p); setError(''); })
      .catch((err) => setError(err?.message || '관리 계획을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [memberId]);

  const startEdit = () => {
    setDraft(plan ? { goals: plan.goals, weekly: { ...EMPTY_WEEK, ...plan.weekly }, proteinPerKg: plan.proteinPerKg, cardio: plan.cardio, notes: plan.notes } : emptyDraft());
    setError('');
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      setPlan(await saveMemberPlan(memberId, draft));
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-stone-500 py-6 text-center">불러오는 중...</p>;

  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-stone-900">관리 계획</h3>
            <p className="text-xs text-stone-500">목표 · 주간 계획 · 영양 · 유산소 — 회원 홈에 보입니다{plan?.updatedAt ? ` · ${plan.updatedAt.slice(0, 10)} ${plan.updatedByName || ''} 수정` : ''}</p>
          </div>
          {canEdit && (
            <button type="button" onClick={startEdit} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-stone-900 rounded-xl">
              <Edit2 className="w-4 h-4" /> {plan && !isEmpty(plan) ? '수정' : '작성'}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {plan && !isEmpty(plan) ? (
          <div className="bg-white border border-stone-200 rounded-xl p-4"><PlanView plan={plan} weightKg={weightKg} /></div>
        ) : (
          <p className="bg-white border border-dashed border-stone-300 rounded-xl p-8 text-center text-sm text-stone-500">
            아직 관리 계획이 없습니다. OT나 상담 때 정한 목표와 주간 운동·영양 계획을 남겨주세요.
          </p>
        )}
      </div>
    );
  }

  const field = 'mt-1 w-full p-3 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-800';
  return (
    <form onSubmit={save} className="space-y-4">
      <h3 className="text-lg font-bold text-stone-900">관리 계획 {plan ? '수정' : '작성'}</h3>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <label className="block text-sm font-semibold text-stone-900">
        목표
        <textarea rows={3} value={draft.goals} maxLength={1000} onChange={(e) => setDraft({ ...draft, goals: e.target.value })} placeholder="예: 근력운동 주 3회 이상, 수면 7시간 이상, 클린식 하루 2~3끼" className={field} />
      </label>
      <div>
        <p className="text-sm font-semibold text-stone-900 mb-1">주간 운동 계획</p>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map(([d, label]) => (
            <label key={d} className="text-center text-xs text-stone-600">
              {label}
              <select value={draft.weekly[d]} onChange={(e) => setDraft({ ...draft, weekly: { ...draft.weekly, [d]: e.target.value } })} className="mt-1 w-full px-0.5 py-2 text-xs border border-stone-300 rounded-lg bg-white">
                {SPLITS.map((s) => <option key={s} value={s}>{s || '-'}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>
      <label className="block text-sm font-semibold text-stone-900">
        단백질 (체중 1kg당 g)
        <div className="flex items-center gap-2 mt-1">
          <input
            inputMode="decimal"
            value={draft.proteinPerKg ?? ''}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setDraft({ ...draft, proteinPerKg: v ? Number(v) : null }); }}
            placeholder="예: 1.5"
            className="w-24 px-3 py-2 text-sm border border-stone-300 rounded-xl"
          />
          <span className="text-xs text-stone-500 font-normal">{proteinLine(weightKg, draft.proteinPerKg) || (weightKg ? `최근 체중 ${weightKg}kg 기준으로 계산됩니다` : '체중을 기록하면 하루 목표량이 계산됩니다')}</span>
        </div>
      </label>
      <label className="block text-sm font-semibold text-stone-900">
        유산소
        <textarea rows={2} value={draft.cardio} maxLength={500} onChange={(e) => setDraft({ ...draft, cardio: e.target.value })} placeholder="예: 웨이트 후 런닝머신 속도 4~5, 경사 6~16, 25~40분 (점진적으로 늘림)" className={field} />
      </label>
      <label className="block text-sm font-semibold text-stone-900">
        바디 컨설팅 메모
        <textarea rows={4} value={draft.notes} maxLength={2000} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="분할 방법, 주의할 점 등 자유롭게" className={field} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(false)} className="px-4 py-2.5 text-sm border border-stone-300 rounded-xl">취소</button>
        <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-semibold text-white bg-stone-900 rounded-xl disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
      </div>
    </form>
  );
};
