import { auth } from '../firebase/config';
import type { SessionComment, SessionMedia } from '../types';

async function journalApi<T>(path: string, body?: unknown): Promise<T> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('로그인이 필요합니다.');
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  let data: any = {};
  try { data = await response.json(); } catch { /* non-JSON error page */ }
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
  return data as T;
}

export const getSessionComments = (memberId: string) =>
  journalApi<{ comments: SessionComment[] }>(`/api/journal/comments?memberId=${encodeURIComponent(memberId)}`).then((r) => r.comments);

export const addSessionComment = (sessionId: string, text: string) =>
  journalApi<{ comment: SessionComment }>('/api/journal/comments', { sessionId, text }).then((r) => r.comment);

export const markSessionCommentsRead = (memberId: string) =>
  journalApi<{ updated: number }>('/api/journal/comments/read', { memberId });

export const getUnreadSessionComments = () =>
  journalApi<{ comments: SessionComment[] }>('/api/journal/unread').then((r) => r.comments);

export const removeSessionMedia = (sessionId: string, mediaId: string) =>
  journalApi<{ removed: boolean }>('/api/journal/media/remove', { sessionId, mediaId });

/** Shrinks large photos before upload so saving right after a lesson stays fast. */
export async function prepareImage(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function uploadSessionMedia(
  sessionId: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<SessionMedia> {
  const body = file.type.startsWith('image/') ? await prepareImage(file) : file;
  const contentType = body.type || file.type;
  const { mediaId, uploadUrl } = await journalApi<{ mediaId: string; uploadUrl: string }>('/api/journal/media/start', {
    sessionId,
    contentType,
    size: body.size
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('파일 업로드에 실패했습니다.')));
    xhr.onerror = () => reject(new Error('네트워크 오류로 파일을 올리지 못했습니다.'));
    xhr.send(body);
  });
  const { media } = await journalApi<{ media: SessionMedia }>('/api/journal/media/finish', { sessionId, mediaId, name: file.name });
  return media;
}
