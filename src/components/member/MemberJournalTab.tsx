import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { PtSession, SessionComment } from '../../types';
import { addSessionComment, getSessionComments } from '../../services/journalService';
import { CommentCount, CommentThread, ExerciseList, MediaGrid, formatSessionDate, matchesSearch, sessionNote } from '../journal/JournalParts';

interface MemberJournalTabProps {
  memberId: string;
  sessions: PtSession[];
  focusSessionId?: string | null;
  /** Staff previewing the member screen can read but not post as the member. */
  readOnly?: boolean;
}

export const MemberJournalTab: React.FC<MemberJournalTabProps> = ({ memberId, sessions, focusSessionId, readOnly }) => {
  const [comments, setComments] = useState<SessionComment[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    getSessionComments(memberId)
      .then((list) => { setComments(list); setCommentError(null); })
      .catch((err) => setCommentError(err?.message || '댓글을 불러오지 못했습니다.'));
  }, [memberId]);

  useEffect(() => {
    if (focusSessionId) document.getElementById(`journal-${focusSessionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusSessionId]);

  const bySession = useMemo(() => {
    const map: Record<string, SessionComment[]> = {};
    comments.forEach((c) => (map[c.sessionId] ||= []).push(c));
    return map;
  }, [comments]);

  const list = sessions
    .filter((s) => s.status !== 'CANCELLED')
    .sort((a, b) => b.sessionNumber - a.sessionNumber || b.date.localeCompare(a.date))
    .filter((s) => matchesSearch(s, bySession[s.sessionId] || [], query));

  const submit = async (sessionId: string, text: string) => {
    const c = await addSessionComment(sessionId, text);
    setComments((prev) => [...prev, c]);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-stone-900">수업 일지</h2>
      {sessions.length > 0 && (
        <label className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-300 rounded-xl">
          <Search className="w-4 h-4 text-stone-400" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="운동명, 메모, 회차로 찾기" className="flex-1 text-sm bg-transparent focus:outline-none" />
        </label>
      )}
      {sessions.length === 0 && (
        <p className="bg-white rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-500">아직 기록된 수업이 없습니다.</p>
      )}
      {sessions.length > 0 && list.length === 0 && <p className="text-sm text-center text-stone-500 py-6">찾는 회차가 없습니다.</p>}
      {list.map((s) => {
        const sc = bySession[s.sessionId] || [];
        const note = sessionNote(s);
        return (
          <article id={`journal-${s.sessionId}`} key={s.sessionId} className={`bg-white rounded-2xl border p-4 space-y-3 scroll-mt-4 ${focusSessionId === s.sessionId ? 'border-stone-900' : 'border-stone-200'}`}>
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white bg-stone-900 px-2.5 py-0.5 rounded-lg">{s.sessionNumber}회차</span>
                <span className="text-sm text-stone-600">{formatSessionDate(s.date)}</span>
                {s.status === 'SCHEDULED' && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">예정</span>}
              </div>
              <CommentCount count={sc.length} />
            </header>
            {note && <p className="text-sm text-stone-900 whitespace-pre-wrap">{note}</p>}
            <ExerciseList exercises={s.exercises} />
            <MediaGrid media={s.media} />
            <div className="border-t border-stone-100 pt-3">
              <CommentThread
                comments={sc}
                viewer="MEMBER"
                onSubmit={readOnly || commentError ? undefined : (text) => submit(s.sessionId, text)}
                disabledReason={readOnly ? '미리보기에서는 댓글을 남길 수 없습니다.' : commentError}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
};
