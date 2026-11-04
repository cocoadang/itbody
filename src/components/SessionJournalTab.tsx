import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Edit2, Plus, Search, Trash2, X, AlertCircle, FileCheck } from 'lucide-react';
import type { ExerciseRecord, ExerciseSet, Member, PtContract, PtSession, SessionComment, SessionMedia, SessionStatus } from '../types';
import {
  createPtSession,
  deletePtSession,
  getContractsByMember,
  getExercises,
  getPriorityContract,
  getSessionsByMember,
  updatePtSession
} from '../services/dataService';
import {
  addSessionComment,
  getSessionComments,
  markSessionCommentsRead,
  removeSessionMedia,
  uploadSessionMedia
} from '../services/journalService';
import { useAuth } from '../context/AuthContext';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import {
  CommentCount,
  CommentThread,
  ExerciseList,
  MediaGrid,
  formatSessionDate,
  matchesSearch,
  sessionNote,
  summarizeSets
} from './journal/JournalParts';

interface SessionJournalTabProps {
  member: Member;
  trainerName?: string;
  onSessionUpdated?: () => void;
}

const DEFAULT_EXERCISES = ['스쿼트', '데드리프트', '벤치프레스', '랫풀다운', '레그프레스', '숄더프레스', '시티드 로우', '런지', '힙쓰러스트', '플랭크'];
const MAX_FILES = 12;

interface DraftExercise {
  name: string;
  weight: string;
  reps: string;
  sets: string;
  memo?: string;
  original?: ExerciseSet[]; // keeps uneven set records from older journals untouched
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function toDraft(ex: ExerciseRecord): DraftExercise {
  const sets = ex.sets || [];
  const uniform = sets.length > 0 && sets.every((s) => s.weight === sets[0].weight && s.reps === sets[0].reps);
  if (sets.length === 0) return { name: ex.exerciseName, weight: '', reps: '', sets: '', memo: ex.memo };
  if (uniform) return { name: ex.exerciseName, weight: String(sets[0].weight), reps: String(sets[0].reps), sets: String(sets.length), memo: ex.memo };
  return { name: ex.exerciseName, weight: '', reps: '', sets: '', memo: ex.memo, original: sets };
}

function fromDraft(d: DraftExercise): ExerciseRecord {
  const weight = parseFloat(d.weight);
  const reps = parseInt(d.reps, 10);
  const count = Math.min(20, parseInt(d.sets, 10) || (d.weight || d.reps ? 1 : 0));
  let sets: ExerciseSet[] = [];
  if (d.weight || d.reps || d.sets) {
    sets = Array.from({ length: count }, (_, i) => ({ setNumber: i + 1, weight: Number.isFinite(weight) ? weight : 0, reps: Number.isFinite(reps) ? reps : 0 }));
  } else if (d.original) {
    sets = d.original;
  }
  return { exerciseName: d.name.trim(), sets, ...(d.memo ? { memo: d.memo } : {}) };
}

export const SessionJournalTab: React.FC<SessionJournalTabProps> = ({ member, trainerName = '담당 트레이너', onSessionUpdated }) => {
  const { currentUser } = useAuth();
  const [sessions, setSessions] = useState<PtSession[]>([]);
  const [contracts, setContracts] = useState<PtContract[]>([]);
  const [comments, setComments] = useState<SessionComment[]>([]);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [library, setLibrary] = useState<string[]>(DEFAULT_EXERCISES);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  // Form
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<PtSession | null>(null);
  const [sessionNumber, setSessionNumber] = useState(1);
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState<SessionStatus>('COMPLETED');
  const [contractId, setContractId] = useState('');
  const [memo, setMemo] = useState('');
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [customExercise, setCustomExercise] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [existingMedia, setExistingMedia] = useState<SessionMedia[]>([]);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const canEdit =
    !!currentUser &&
    (currentUser.role === 'CENTER_ADMIN' || (currentUser.role === 'TRAINER' && !!currentUser.trainerId && member.trainerId === currentUser.trainerId));

  const loadComments = async () => {
    try {
      const list = await getSessionComments(member.memberId);
      setComments(list);
      setCommentsError(null);
      if (list.some((c) => c.authorRole === 'MEMBER' && !c.readByStaffAt)) {
        markSessionCommentsRead(member.memberId).catch(() => undefined);
      }
    } catch (err: any) {
      setCommentsError(err?.message || '댓글을 불러오지 못했습니다.');
    }
  };

  const loadData = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const [sessionList, contractList] = await Promise.all([
        getSessionsByMember(member.centerId, member.memberId, currentUser.role, currentUser.trainerId),
        getContractsByMember(member.centerId, member.memberId, currentUser.role, currentUser.trainerId)
      ]);
      setSessions(sessionList);
      setContracts(contractList);
    } catch (err) {
      console.error('Failed to load journal:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadComments();
    getExercises(member.centerId)
      .then((list) => {
        const names = [...new Set([...DEFAULT_EXERCISES, ...list.map((e) => e.name)])];
        setLibrary(names);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.memberId, member.centerId]);

  const commentsBySession = useMemo(() => {
    const map: Record<string, SessionComment[]> = {};
    comments.forEach((c) => (map[c.sessionId] ||= []).push(c));
    return map;
  }, [comments]);

  const activeContract = getPriorityContract(contracts);
  const remaining = activeContract ? activeContract.totalSessions - activeContract.usedSessions : null;
  const visibleSessions = sessions.filter((s) => matchesSearch(s, commentsBySession[s.sessionId] || [], query));

  // Last time this exercise was done, plus the member's comments on that session.
  const previousFor = (name: string) => {
    const key = name.trim();
    if (!key) return null;
    const prev = sessions
      .filter((s) => s.sessionId !== editing?.sessionId && s.status === 'COMPLETED')
      .sort((a, b) => b.sessionNumber - a.sessionNumber)
      .find((s) => (s.exercises || []).some((e) => e.exerciseName.trim() === key));
    if (!prev) return null;
    const ex = prev.exercises.find((e) => e.exerciseName.trim() === key)!;
    const memberComments = (commentsBySession[prev.sessionId] || []).filter((c) => c.authorRole === 'MEMBER');
    return { session: prev, summary: summarizeSets(ex), memberComments };
  };

  const openNew = () => {
    setEditing(null);
    setSessionNumber(sessions.length > 0 ? Math.max(...sessions.map((s) => s.sessionNumber)) + 1 : 1);
    setDate(today());
    setStatus('COMPLETED');
    setContractId(activeContract?.contractId || contracts[0]?.contractId || '');
    setMemo('');
    setExercises([]);
    setFiles([]);
    setExistingMedia([]);
    setError('');
    setProgress('');
    setIsOpen(true);
  };

  const openEdit = (s: PtSession) => {
    setEditing(s);
    setSessionNumber(s.sessionNumber);
    setDate(s.date);
    setStatus(s.status);
    setContractId(s.contractId || activeContract?.contractId || '');
    setMemo(sessionNote(s));
    setExercises((s.exercises || []).map(toDraft));
    setFiles([]);
    setExistingMedia(s.media || []);
    setError('');
    setProgress('');
    setIsOpen(true);
  };

  const toggleExercise = (name: string) => {
    setExercises((prev) => (prev.some((e) => e.name === name) ? prev.filter((e) => e.name !== name) : [...prev, { name, weight: '', reps: '', sets: '' }]));
  };

  const addCustomExercise = () => {
    const name = customExercise.trim();
    if (!name) return;
    if (!exercises.some((e) => e.name === name)) setExercises((prev) => [...prev, { name, weight: '', reps: '', sets: '' }]);
    setCustomExercise('');
  };

  const updateExercise = (index: number, field: 'weight' | 'reps' | 'sets', value: string) => {
    setExercises((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value.replace(/[^0-9.]/g, '') } : e)));
  };

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted = Array.from(list).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    setFiles((prev) => [...prev, ...accepted].slice(0, MAX_FILES - existingMedia.length));
    if (fileInput.current) fileInput.current.value = '';
  };

  const handleRemoveExistingMedia = async (item: SessionMedia) => {
    if (!editing || !window.confirm('이 파일을 삭제할까요?')) return;
    try {
      await removeSessionMedia(editing.sessionId, item.mediaId);
      setExistingMedia((prev) => prev.filter((m) => m.mediaId !== item.mediaId));
      setSessions((prev) => prev.map((s) => (s.sessionId === editing.sessionId ? { ...s, media: (s.media || []).filter((m) => m.mediaId !== item.mediaId) } : s)));
    } catch (err: any) {
      setError(err?.message || '파일을 삭제하지 못했습니다.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !canEdit) return;
    if (!date || !isValidDate(date)) return setError('수업 날짜를 확인해주세요.');
    if (!contractId) return setError('등록된 PT 이용권이 없습니다. [회원 정보]에서 이용권을 먼저 등록해주세요.');
    setError('');
    setSaving(true);
    const fields = {
      sessionNumber,
      date,
      status,
      contractId,
      trainerFeedback: memo.trim(),
      nextSessionGoal: '',
      exercises: exercises.filter((x) => x.name.trim()).map(fromDraft)
    };
    try {
      let sessionId = editing?.sessionId;
      if (editing) {
        await updatePtSession(member.centerId, editing.sessionId, fields, currentUser.role, currentUser.trainerId);
      } else {
        const created = await createPtSession(
          { ...fields, centerId: member.centerId, trainerId: member.trainerId, trainerName, memberId: member.memberId, memberName: member.name, time: nowTime() },
          currentUser.role,
          currentUser.trainerId
        );
        sessionId = created.sessionId;
      }
      const failed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        try {
          await uploadSessionMedia(sessionId!, files[i], (f) => setProgress(`사진·영상 올리는 중 ${i + 1}/${files.length} (${Math.round(f * 100)}%)`));
        } catch (err: any) {
          failed.push(`${files[i].name}: ${err?.message || '업로드 실패'}`);
        }
      }
      setProgress('');
      await loadData();
      onSessionUpdated?.();
      if (failed.length) {
        // The journal is saved; keep the form open on the saved record so files can be retried.
        setFiles([]);
        setError(`수업 일지는 저장했지만 일부 파일을 올리지 못했습니다.\n${failed.join('\n')}`);
        const saved = (await getSessionsByMember(member.centerId, member.memberId, currentUser.role, currentUser.trainerId)).find((s) => s.sessionId === sessionId);
        if (saved) { setEditing(saved); setExistingMedia(saved.media || []); }
      } else {
        setIsOpen(false);
      }
    } catch (err: any) {
      setError(err?.message || '수업 일지를 저장하지 못했습니다.');
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  const handleDelete = async (s: PtSession) => {
    if (!currentUser || !canEdit) return;
    if (!window.confirm(`${s.sessionNumber}회차 수업 일지를 삭제할까요? 완료된 수업이면 PT 잔여 횟수가 복구됩니다.`)) return;
    try {
      for (const m of s.media || []) await removeSessionMedia(s.sessionId, m.mediaId).catch(() => undefined);
      await deletePtSession(member.centerId, s.sessionId, currentUser.role, currentUser.trainerId);
      await loadData();
      onSessionUpdated?.();
    } catch (err: any) {
      alert(err?.message || '삭제하지 못했습니다.');
    }
  };

  const handleComment = async (sessionId: string, text: string) => {
    const c = await addSessionComment(sessionId, text);
    setComments((prev) => [...prev, c]);
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-stone-500 text-sm">
        <div className="w-6 h-6 border-2 border-stone-800 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        수업 일지를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-stone-900">수업 일지 <span className="text-sm font-medium text-stone-500">총 {sessions.length}회차</span></h3>
          <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5" />
            {activeContract ? (
              <>
                {activeContract.title} · {activeContract.usedSessions}/{activeContract.totalSessions}회 ·{' '}
                <span className={remaining !== null && remaining <= 5 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>잔여 {remaining}회</span>
              </>
            ) : (
              <span className="text-amber-700">등록된 PT 이용권이 없습니다. [회원 정보]에서 먼저 등록해주세요.</span>
            )}
          </p>
        </div>
        {canEdit && (
          <button type="button" id="btn-add-session" onClick={openNew} className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl">
            <Plus className="w-4 h-4" /> 오늘 수업 기록
          </button>
        )}
      </div>

      {sessions.length > 0 && (
        <label className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-300 rounded-xl">
          <Search className="w-4 h-4 text-stone-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="운동명, 메모, 댓글, 회차로 찾기 (예: 스쿼트, 무릎, 5회차)"
            className="flex-1 text-sm bg-transparent focus:outline-none"
          />
        </label>
      )}
      {commentsError && <p className="text-xs text-stone-500">회원 댓글: {commentsError}</p>}

      {/* Sessions */}
      {sessions.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-xl p-10 text-center text-sm text-stone-500">
          아직 수업 일지가 없습니다. 수업이 끝나면 [오늘 수업 기록]으로 바로 남겨보세요.
        </div>
      ) : visibleSessions.length === 0 ? (
        <p className="text-sm text-stone-500 text-center py-6">‘{query}’에 해당하는 회차가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {visibleSessions.map((s) => {
            const sc = commentsBySession[s.sessionId] || [];
            const unread = sc.filter((c) => c.authorRole === 'MEMBER' && !c.readByStaffAt).length;
            const note = sessionNote(s);
            return (
              <article key={s.sessionId} className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
                <header className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-white bg-stone-900 px-2.5 py-0.5 rounded-lg">{s.sessionNumber}회차</span>
                    <span className="text-sm text-stone-600">{formatSessionDate(s.date)}</span>
                    {s.status !== 'COMPLETED' && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>
                        {s.status === 'CANCELLED' ? '취소' : '예정'}
                      </span>
                    )}
                    <CommentCount count={sc.length} unread={unread} />
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => openEdit(s)} className="p-2 text-stone-400 hover:text-stone-800 rounded-lg" aria-label="수정"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(s)} className="p-2 text-stone-400 hover:text-rose-600 rounded-lg" aria-label="삭제"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </header>
                {note && <p className="text-sm text-stone-900 whitespace-pre-wrap">{note}</p>}
                <ExerciseList exercises={s.exercises} />
                <MediaGrid media={s.media} />
                {(s.internalNote || s.sessionNotes) && (
                  <p className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2 whitespace-pre-wrap">이전 내부 메모: {s.internalNote || s.sessionNotes}</p>
                )}
                <div className="border-t border-stone-100 pt-3">
                  <CommentThread
                    comments={sc}
                    viewer="STAFF"
                    onSubmit={commentsError ? undefined : (text) => handleComment(s.sessionId, text)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Write / edit sheet */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4">
          <form onSubmit={handleSave} className="bg-white w-full sm:max-w-2xl max-h-[95vh] sm:rounded-2xl rounded-t-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-900">{editing ? `${sessionNumber}회차 수정` : '오늘 수업 기록'}</h3>
                <p className="text-xs text-stone-500">{member.name} 회원</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="p-2 text-stone-500" aria-label="닫기"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {error && (
                <div className="flex gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm whitespace-pre-wrap">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-stone-600">
                  회차
                  <input type="number" min={1} value={sessionNumber} onChange={(e) => setSessionNumber(parseInt(e.target.value, 10) || 1)} className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
                </label>
                <div className="text-xs text-stone-600">
                  <label htmlFor="journal-date">날짜</label>
                  <DateInputField id="journal-date" required value={date} onChange={setDate} className="!text-sm !py-2 mt-1" />
                </div>
                <label className="text-xs text-stone-600">
                  상태
                  <select value={status} onChange={(e) => setStatus(e.target.value as SessionStatus)} className="mt-1 w-full px-2 py-2 text-sm border border-stone-300 rounded-lg bg-white">
                    <option value="COMPLETED">완료</option>
                    <option value="SCHEDULED">예정</option>
                    <option value="CANCELLED">취소</option>
                  </select>
                </label>
              </div>
              {contracts.length > 1 && (
                <label className="block text-xs text-stone-600">
                  차감할 이용권
                  <select value={contractId} onChange={(e) => setContractId(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white">
                    {contracts.map((c) => (
                      <option key={c.contractId} value={c.contractId}>{c.title} (잔여 {c.totalSessions - c.usedSessions}회)</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-sm font-semibold text-stone-900">수업 메모</span>
                <span className="text-xs text-stone-500 ml-2">회원에게 보입니다</span>
                <textarea
                  rows={5}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="오늘 한 내용, 자세 피드백, 다음 수업 계획 등을 자유롭게 적어주세요."
                  className="mt-1.5 w-full p-3 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-800"
                />
              </label>

              <div className="space-y-2">
                <span className="text-sm font-semibold text-stone-900">운동</span>
                <div className="flex flex-wrap gap-1.5">
                  {library.slice(0, 24).map((name) => {
                    const on = exercises.some((e) => e.name === name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleExercise(name)}
                        className={`px-3 py-1.5 text-sm rounded-full border ${on ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-300'}`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input
                    value={customExercise}
                    onChange={(e) => setCustomExercise(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomExercise(); } }}
                    placeholder="다른 운동 직접 입력"
                    className="flex-1 px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                  <button type="button" onClick={addCustomExercise} className="px-3 py-2 text-sm rounded-lg bg-stone-100 text-stone-800">추가</button>
                </div>
                {exercises.length > 0 && (
                  <ul className="space-y-2 pt-1">
                    {exercises.map((ex, i) => {
                      const prev = previousFor(ex.name);
                      return (
                        <li key={ex.name + i} className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-stone-900">{ex.name}</span>
                            <button type="button" onClick={() => setExercises((p) => p.filter((_, j) => j !== i))} className="text-stone-400 p-1" aria-label="빼기"><X className="w-4 h-4" /></button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {(['weight', 'reps', 'sets'] as const).map((f) => (
                              <label key={f} className="text-[11px] text-stone-500">
                                {f === 'weight' ? '무게(kg)' : f === 'reps' ? '횟수' : '세트'}
                                <input inputMode="decimal" value={ex[f]} onChange={(e) => updateExercise(i, f, e.target.value)} placeholder="선택" className="mt-0.5 w-full px-2 py-1.5 text-sm border border-stone-300 rounded-lg bg-white" />
                              </label>
                            ))}
                          </div>
                          {ex.original && !ex.weight && !ex.reps && !ex.sets && (
                            <p className="text-[11px] text-stone-500">기존 기록 유지: {summarizeSets({ sets: ex.original })}</p>
                          )}
                          {prev && (
                            <div className="text-[11px] text-blue-900 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5 space-y-0.5">
                              <p>지난번 {prev.session.sessionNumber}회차{prev.summary ? `: ${prev.summary}` : ''}</p>
                              {prev.memberComments.slice(-2).map((c) => (
                                <p key={c.commentId} className="text-amber-800">회원 댓글: {c.text}</p>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-sm font-semibold text-stone-900">사진 · 영상</span>
                {editing && <MediaGrid media={existingMedia} onRemove={handleRemoveExistingMedia} />}
                {files.length > 0 && (
                  <ul className="text-xs text-stone-600 space-y-1">
                    {files.map((f, i) => (
                      <li key={f.name + i} className="flex items-center justify-between bg-stone-50 rounded-lg px-3 py-1.5">
                        <span className="truncate">{f.type.startsWith('video/') ? '🎬' : '🖼️'} {f.name}</span>
                        <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-stone-400 p-1" aria-label="빼기"><X className="w-3.5 h-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                )}
                {existingMedia.length + files.length < MAX_FILES && (
                  <button type="button" onClick={() => fileInput.current?.click()} className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-stone-300 rounded-xl text-sm text-stone-700">
                    <Camera className="w-4 h-4" /> 사진 · 영상 추가
                  </button>
                )}
                <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => pickFiles(e.target.files)} />
                <p className="text-[11px] text-stone-400">운동 자세, 설명 그림, 영상 등. 사진 15MB · 영상 300MB 이하, 회차당 최대 {MAX_FILES}개. 회원에게 보입니다.</p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-stone-200 flex items-center justify-between gap-3">
              <span className="text-xs text-stone-500 truncate">{progress}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2.5 text-sm text-stone-700 border border-stone-300 rounded-xl">닫기</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-semibold text-white bg-stone-900 rounded-xl disabled:opacity-50">
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
