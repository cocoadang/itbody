import { createHash } from 'node:crypto';
import { getFirebaseAdmin } from './adminAccountEndpoints';
export async function consumeLimit(key: string, max: number, windowMs = 60_000) {
  const admin = getFirebaseAdmin();
  if (!admin) throw new Error('Unavailable');
  const bucket = Math.floor(Date.now() / windowMs);
  const id = createHash('sha256').update(key + ':' + bucket).digest('hex');
  const ref = admin.db.doc(`serverRateLimits/${id}`);
  return admin.db.runTransaction(async tx => {
    const count = (await tx.get(ref)).data()?.count || 0;
    if (count >= max) return false;
    tx.set(ref, { count: count + 1, expiresAt: new Date((bucket + 2) * windowMs) });
    return true;
  });
}
