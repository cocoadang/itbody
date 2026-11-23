import type { User } from 'firebase/auth';
import { auth } from '../firebase/config';

export async function trainerRegistrationApi(path: string, body?: unknown, user: User | null = auth?.currentUser) {
  if (!user) throw new Error('로그인이 필요합니다.');
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken(true)}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청을 완료하지 못했습니다.');
  return data;
}
