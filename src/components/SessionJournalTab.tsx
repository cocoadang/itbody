import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Edit2, Plus, Search, Trash2, X, AlertCircle, FileCheck } from 'lucide-react';
import type { ExerciseRecord, ExerciseSet, Member, MuscleGroup, PtContract, PtSession, SessionBodyRecord, SessionComment, SessionMedia, SessionStatus } from '../types';
import {
  createBodyMeasurement,
  createPtSession,
  deletePtSession,
  updateBodyMeasurement,
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
import { ALL_MUSCLES, BodyMap, musclesForExercise } from './journal/BodyMap';

interface SessionJournalTabProps {
  member: Member;
  /** Loaded by the member screen; refreshed through onSessionUpdated after a save. */
  sessions: PtSession[];
  contracts: PtContract[];
  trainerName?: string;
  onSessionUpdated?: () => Promise<void> | void;
}

// The center's exercise list rarely changes; read it once per page instead of per member.
type Library = { names: string[]; parts: Record<string, string> };
const libraryCache = new Map<string, Promise<Library>>();
function loadLibrary(centerId: string) {
  if (!libraryCache.has(centerId)) {
    libraryCache.set(centerId, getExercises(centerId)
      .then((list) => ({
        names: [...new Set([...DEFAULT_EXERCISES, ...list.map((e) => e.name)])],
        parts: Object.fromEntries(list.map((e) => [e.name, e.bodyPart || '']))
      }))
      .catch(() => { libraryCache.delete(centerId); return { names: DEFAULT_EXERCISES, parts: {} }; }));
  }
  return libraryCache.get(centerId)!;
}

const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : undefined; };

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

const BodyLine: React.FC<{ body: SessionBodyRecord }> = ({ body }) => (
  <p className="text-xs text-stone-600 bg-stone-50 rounded-lg px-3 py-1.5">
    {[body.weightKg && `체중 ${body.weightKg}kg`, body.skeletalMuscleMassKg && `골격근량 ${body.skeletalMuscleMassKg}kg`, body.bodyFatPercentage && `체지방률 ${body.bodyFatPercentage}%`].filter(Boolean).join(' · ')}
  </p>
);

export const SessionJournalTab: React.FC<SessionJournalTabProps> = ({ member, sessions: sessionsProp, contracts, trainerName = '담당 트레이너', onSessionUpdated }) => {
  const { currentUser } = useAuth();
  // Local copy so media removals show immediately; replaced whenever the parent reloads.
  const [sessions, setSessions] = useState<PtSession[]>(sessionsProp);
  useEffect(() => setSessions(sessionsProp), [sessionsProp]);
  const [comments, setComments] = useState<SessionComment[]>([]);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [library, setLibrary] = useState<string[]>(DEFAULT_EXERCISES);
  const [bodyParts, setBodyParts] = useState<Record<string, string>>({});
  // Body composition (paper journal header) and worked areas (body diagram).
  const [bodyWeight, setBodyWeight] = useState('');
  const [bodyMuscle, setBodyMuscle] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [showBody, setShowBody] = useState(false);
  const [muscleOverride, setMuscleOverride] = useState<Partial<Record<MuscleGroup, boolean>>>({});
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
  const [removedMedia, setRemovedMedia] = useState<SessionMedia[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [listError, setListError] = useState('');
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

  const reload = async () => {
    await onSessionUpdated?.();
  };

  useEffect(() => {
    loadComments();
    loadLibrary(member.centerId).then((lib) => { setLibrary(lib.names); setBodyParts(lib.parts); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.memberId, member.centerId]);

  const commentsBySession = useMemo(() => {
    const map: Record<string, SessionComment[]> = {};
    comments.forEach((c) => (map[c.sessionId] ||= []).push(c));
    return map;
  }, [comments]);

  const autoMuscles = (names: string[]) => {
    const set = new Set<MuscleGroup>();
    names.forEach((n) => musclesForExercise(n, bodyParts[n]).forEach((m) => set.add(m)));
    return set;
  };
  const autoSet = autoMuscles(exercises.map((e) => e.name));
  const finalMuscles = ALL_MUSCLES.filter((m) => (muscleOverride[m] ?? autoSet.has(m)));
  const toggleMuscle = (m: MuscleGroup) => setMuscleOverride((prev) => ({ ...prev, [m]: !(prev[m] ?? autoSet.has(m)) }));

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
    setMuscleOverride({});
    setBodyWeight(''); setBodyMuscle(''); setBodyFat(''); setShowBody(false);
    setFiles([]);
    setExistingMedia([]);
    setRemovedMedia([]);
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
    // Keep exactly the areas saved before, even where they differ from the automatic guess.
    const auto = autoMuscles((s.exercises || []).map((e) => e.exerciseName));
    const saved = new Set(s.muscles || []);
    setMuscleOverride(s.muscles ? Object.fromEntries(ALL_MUSCLES.filter((m) => saved.has(m) !== auto.has(m)).map((m) => [m, saved.has(m)])) : {});
    setBodyWeight(s.body?.weightKg?.toString() || '');
    setBodyMuscle(s.body?.skeletalMuscleMassKg?.toString() || '');
    setBodyFat(s.body?.bodyFatPercentage?.toString() || '');
    setShowBody(false);
    setFiles([]);
    setExistingMedia(s.media || []);
    setRemovedMedia([]);
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
    setFiles((prev) => [...prev, ...accepted].slice(0, MAX_FILES - existingMedia.length + removedMedia.length));
    if (fileInput.current) fileInput.current.value = '';
  };

  // Browser confirm() dialogs are blocked in some in-app browsers (KakaoTalk, the Claude app),
  // which silently cancelled deletes. Removal is marked here and applied when the form is saved.
  const handleRemoveExistingMedia = (item: SessionMedia) => {
    setRemovedMedia((prev) => [...prev, item]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !canEdit) return;
    if (!date || !isValidDate(date)) return setError('수업 날짜를 확인해주세요.');
    if (!contractId) return setError('등록된 PT 이용권이 없습니다. [회원 정보]에서 이용권을 먼저 등록해주세요.');
    setError('');
    setSaving(true);
    // Body composition goes to the body-change graph as well as to this session.
    let body: SessionBodyRecord | undefined;
    const values = { weightKg: num(bodyWeight), skeletalMuscleMassKg: num(bodyMuscle), bodyFatPercentage: num(bodyFat) };
    const hasBody = Object.values(values).some((v) => v !== undefined);
    try {
      const prevId = editing?.body?.measurementId;
      if (hasBody) {
        const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Partial<SessionBodyRecord>;
        if (prevId) {
          await updateBodyMeasurement(member.centerId, prevId, { ...values, measuredAt: date }, currentUser.role, currentUser.trainerId);
          body = { ...clean, measurementId: prevId };
        } else {
          const m = await createBodyMeasurement(
            { centerId: member.centerId, memberId: member.memberId, trainerId: member.trainerId, measuredAt: date, ...clean, memo: `${sessionNumber}회차 수업 기록` },
            currentUser.role,
            currentUser.trainerId
          );
          body = { ...clean, measurementId: m.measurementId };
        }
      } else if (prevId) {
        body = { measurementId: prevId }; // values cleared here; the measurement itself stays in 신체 변화
      }
    } catch (err: any) {
      setSaving(false);
      return setError(`체성분 기록을 저장하지 못했습니다: ${err?.message || ''}`);
    }
    const fields = {
      sessionNumber,
      date,
      status,
      contractId,
      trainerFeedback: memo.trim(),
      nextSessionGoal: '',
      exercises: exercises.filter((x) => x.name.trim()).map(fromDraft),
      muscles: finalMuscles,
      ...(body ? { body } : {})
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
      for (const m of removedMedia) {
        try {
          await removeSessionMedia(sessionId!, m.mediaId);
        } catch (err: any) {
          failed.push(`${m.name || '파일'} 삭제: ${err?.message || '실패'}`);
        }
      }
      setRemovedMedia([]);
      for (let i = 0; i < files.length; i++) {
        try {
          await uploadSessionMedia(sessionId!, files[i], (f) => setProgress(`사진·영상 올리는 중 ${i + 1}/${files.length} (${Math.round(f * 100)}%)`));
        } catch (err: any) {
          failed.push(`${files[i].name}: ${err?.message || '업로드 실패'}`);
        }
      }
      setProgress('');
      await reload();
      if (failed.length) {
        // The journal is saved; keep the form open on the saved record so files can be retried.
        setFiles([]);
        setError(`수업 일지는 저장했지만 일부 파일을 처리하지 못했습니다.\n${failed.join('\n')}`);
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
    setConfirmDeleteId(null);
    setListError('');
    try {
      for (const m of s.media || []) await removeSessionMedia(s.sessionId, m.mediaId).catch(() => undefined);
      await deletePtSession(member.centerId, s.sessionId, currentUser.role, currentUser.trainerId);
      await reload();
    } catch (err: any) {
      setListError(err?.message || '삭제하지 못했습니다.');
    }
  };

  const handleComment = async (sessionId: string, text: string) => {
    const c = await addSessionComment(sessionId, text);
    setComments((prev) => [...prev, c]);
  };

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
      {listError && <p className="text-sm text-rose-600">{listError}</p>}

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
                      <button type="button" onClick={() => setConfirmDeleteId(s.sessionId)} className="p-2 text-stone-400 hover:text-rose-600 rounded-lg" aria-label="삭제"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </header>
                {confirmDeleteId === s.sessionId && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-900">
                    <span>{s.sessionNumber}회차를 삭제할까요? 사진·영상과 함께 지워지고, 완료된 수업이면 PT 잔여 횟수가 복구됩니다.</span>
                    <span className="flex gap-2">
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white">취소</button>
                      <button type="button" onClick={() => handleDelete(s)} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold">삭제</button>
                    </span>
                  </div>
                )}
                {note && <p className="text-sm text-stone-900 whitespace-pre-wrap">{note}</p>}
                {s.body && (s.body.weightKg || s.body.skeletalMuscleMassKg || s.body.bodyFatPercentage) && <BodyLine body={s.body} />}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1"><ExerciseList exercises={s.exercises} /></div>
                  {s.muscles && s.muscles.length > 0 && <BodyMap selected={s.muscles} className="w-40 shrink-0" />}
                </div>
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

              {/* Body composition is optional: hidden behind a button unless already filled. */}
              {showBody || bodyWeight || bodyMuscle || bodyFat ? (
                <div>
                  <span className="text-sm font-semibold text-stone-900">체성분</span>
                  <span className="text-xs text-stone-500 ml-2">신체 변화 그래프에도 저장됩니다</span>
                  <div className="grid grid-cols-3 gap-2 mt-1.5">
                    {([['체중(kg)', bodyWeight, setBodyWeight], ['골격근량(kg)', bodyMuscle, setBodyMuscle], ['체지방률(%)', bodyFat, setBodyFat]] as const).map(([label, value, set]) => (
                      <label key={label} className="text-[11px] text-stone-500">
                        {label}
                        <input inputMode="decimal" value={value} onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ''))} className="mt-0.5 w-full px-2 py-2 text-sm border border-stone-300 rounded-lg" />
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setShowBody(true)} className="text-sm text-stone-600 underline">+ 체중·체성분 기록</button>
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

              <div className="space-y-1">
                <span className="text-sm font-semibold text-stone-900">운동 부위</span>
                <span className="text-xs text-stone-500 ml-2">운동을 고르면 자동으로 표시 · 그림을 눌러 고칠 수 있어요</span>
                <BodyMap selected={finalMuscles} onToggle={toggleMuscle} className="max-w-xs" />
              </div>

              <div className="space-y-2">
                <span className="text-sm font-semibold text-stone-900">사진 · 영상</span>
                {editing && (
                  <MediaGrid media={existingMedia.filter((m) => !removedMedia.some((r) => r.mediaId === m.mediaId))} onRemove={handleRemoveExistingMedia} />
                )}
                {removedMedia.length > 0 && (
                  <p className="text-xs text-rose-700 flex items-center justify-between bg-rose-50 rounded-lg px-3 py-2">
                    <span>{removedMedia.length}개 파일을 [저장]하면 삭제합니다.</span>
                    <button type="button" onClick={() => setRemovedMedia([])} className="underline">되돌리기</button>
                  </p>
                )}
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
                {existingMedia.length - removedMedia.length + files.length < MAX_FILES && (
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
