import React, { useState } from 'react';
import { MessageCircle, Play, Send, X } from 'lucide-react';
import type { ExerciseRecord, SessionComment, SessionMedia } from '../../types';

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatSessionDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

export function formatCommentTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "50kg × 10회 × 3세트" when every set is the same, otherwise the sets one by one. */
export function summarizeSets(ex: Pick<ExerciseRecord, 'sets'>): string {
  const sets = ex.sets || [];
  if (sets.length === 0) return '';
  const w = (n: number) => (n > 0 ? `${n}kg` : '맨몸');
  const same = sets.every((s) => s.weight === sets[0].weight && s.reps === sets[0].reps);
  if (same) return `${w(sets[0].weight)} × ${sets[0].reps}회 × ${sets.length}세트`;
  return sets.map((s) => `${w(s.weight)}×${s.reps}`).join(', ');
}

export const ExerciseList: React.FC<{ exercises: ExerciseRecord[] }> = ({ exercises }) => {
  if (!exercises || exercises.length === 0) return null;
  return (
    <ul className="space-y-1">
      {exercises.map((ex, i) => {
        const summary = summarizeSets(ex);
        return (
          <li key={i} className="text-sm text-stone-800 flex flex-wrap gap-x-2">
            <span className="font-semibold">{ex.exerciseName || '운동'}</span>
            {summary && <span className="text-stone-500">{summary}</span>}
            {ex.memo && <span className="text-stone-500">· {ex.memo}</span>}
          </li>
        );
      })}
    </ul>
  );
};

export const MediaGrid: React.FC<{
  media?: SessionMedia[];
  onRemove?: (item: SessionMedia) => void;
}> = ({ media, onRemove }) => {
  const [open, setOpen] = useState<SessionMedia | null>(null);
  if (!media || media.length === 0) return null;
  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {media.map((m) => (
          <div key={m.mediaId} className="relative aspect-square rounded-lg overflow-hidden bg-stone-100 border border-stone-200">
            <button type="button" onClick={() => setOpen(m)} className="w-full h-full" aria-label={m.kind === 'video' ? '영상 보기' : '사진 보기'}>
              {m.kind === 'image' ? (
                <img src={m.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <>
                  <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center"><Play className="w-4 h-4" /></span>
                  </span>
                </>
              )}
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(m)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                aria-label="삭제"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-3" onClick={() => setOpen(null)}>
          <button type="button" className="absolute top-3 right-3 text-white p-2" aria-label="닫기"><X className="w-6 h-6" /></button>
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            {open.kind === 'image' ? (
              <img src={open.url} alt="" className="w-full max-h-[85vh] object-contain" />
            ) : (
              <video src={open.url} controls autoPlay playsInline className="w-full max-h-[85vh]" />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export const CommentThread: React.FC<{
  comments: SessionComment[];
  viewer: 'STAFF' | 'MEMBER';
  onSubmit?: (text: string) => Promise<void>;
  disabledReason?: string | null;
}> = ({ comments, viewer, onSubmit, disabledReason }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit || !text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(text.trim());
      setText('');
    } catch (err: any) {
      setError(err?.message || '댓글을 남기지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((c) => {
            const mine = c.authorRole === viewer;
            return (
              <li key={c.commentId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${c.authorRole === 'MEMBER' ? 'bg-amber-50 border border-amber-200 text-stone-900' : 'bg-stone-100 text-stone-900'}`}>
                  <div className="text-[11px] text-stone-500 mb-0.5 flex items-center gap-1.5">
                    <span className="font-semibold text-stone-700">{c.authorRole === 'MEMBER' ? `${c.authorName || '회원'} (회원)` : c.authorName || '트레이너'}</span>
                    <span>{formatCommentTime(c.createdAt)}</span>
                    {viewer === 'STAFF' && c.authorRole === 'MEMBER' && !c.readByStaffAt && (
                      <span className="text-[10px] font-bold text-white bg-rose-500 rounded px-1">새 댓글</span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{c.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {onSubmit && !disabledReason && (
        <form onSubmit={submit} className="flex items-end gap-2">
          <textarea
            rows={1}
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            placeholder={viewer === 'MEMBER' ? '수업 소감이나 운동 후 불편했던 점을 남겨주세요' : '회원에게 답글 남기기'}
            className="flex-1 min-h-[40px] max-h-32 px-3 py-2 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-800 resize-y"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="h-10 px-3 rounded-xl bg-stone-900 text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1"
          >
            <Send className="w-4 h-4" />
            <span className="sr-only sm:not-sr-only">{busy ? '등록 중' : '등록'}</span>
          </button>
        </form>
      )}
      {disabledReason && <p className="text-xs text-stone-500">{disabledReason}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
};

export const CommentCount: React.FC<{ count: number; unread?: number }> = ({ count, unread = 0 }) => (
  <span className="inline-flex items-center gap-1 text-xs text-stone-500">
    <MessageCircle className="w-3.5 h-3.5" />
    {count}
    {unread > 0 && <span className="text-[10px] font-bold text-white bg-rose-500 rounded px-1">새 {unread}</span>}
  </span>
);

/** Older journals used several fields; show whatever they hold as one note. */
export function sessionNote(s: { trainerFeedback?: string; memberFeedback?: string; nextSessionGoal?: string }): string {
  const main = (s.trainerFeedback || s.memberFeedback || '').trim();
  const next = (s.nextSessionGoal || '').trim();
  return [main, next && `다음 수업: ${next}`].filter(Boolean).join('\n');
}

export function matchesSearch(
  s: { sessionNumber: number; exercises?: ExerciseRecord[]; trainerFeedback?: string; memberFeedback?: string; nextSessionGoal?: string; date: string },
  comments: SessionComment[],
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    `${s.sessionNumber}회차`,
    s.date,
    sessionNote(s),
    ...(s.exercises || []).map((e) => `${e.exerciseName} ${e.memo || ''}`),
    ...comments.map((c) => c.text)
  ].join(' ').toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}
