import React, { useEffect, useState } from 'react';
import { MessageCircle, ChevronRight } from 'lucide-react';
import type { SessionComment } from '../../types';
import { getUnreadSessionComments } from '../../services/journalService';
import { formatCommentTime } from './JournalParts';

/** New member comments on session journals, so trainers can prepare the next lesson. */
export const UnreadCommentsCard: React.FC<{ onSelectMember: (memberId: string) => void }> = ({ onSelectMember }) => {
  const [comments, setComments] = useState<SessionComment[]>([]);

  useEffect(() => {
    getUnreadSessionComments().then(setComments).catch(() => setComments([]));
  }, []);

  if (comments.length === 0) return null;

  const byMember = new Map<string, SessionComment[]>();
  comments.forEach((c) => byMember.set(c.memberId, [...(byMember.get(c.memberId) || []), c]));

  return (
    <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
      <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-amber-700" /> 새 회원 댓글 {comments.length}개
      </h2>
      <ul className="divide-y divide-amber-200/70">
        {[...byMember.entries()].slice(0, 10).map(([memberId, list]) => {
          const latest = list[0];
          return (
            <li key={memberId}>
              <button type="button" onClick={() => onSelectMember(memberId)} className="w-full flex items-center gap-3 py-2 text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-900">
                    <span className="font-semibold">{latest.memberName || latest.authorName}</span>
                    <span className="text-xs text-stone-500 ml-2">{latest.sessionNumber}회차 · {formatCommentTime(latest.createdAt)}{list.length > 1 ? ` 외 ${list.length - 1}개` : ''}</span>
                  </p>
                  <p className="text-sm text-stone-700 truncate">{latest.text}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
