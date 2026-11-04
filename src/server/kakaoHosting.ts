// No SDK imports: these checks are also exercised without credentials or a database.
export function redirectUris(env: NodeJS.ProcessEnv = process.env): string[] {
  const values = [env.KAKAO_REDIRECT_URI, ...(env.KAKAO_ADDITIONAL_REDIRECT_URIS || '').split(',')];
  return [...new Set(values.filter((value): value is string => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.hash &&
        url.pathname === '/' && url.search === '?kakao_callback=1' && url.href === value;
    } catch { return false; }
  }))];
}

export function redirectForOrigin(origin: unknown, uris = redirectUris()): string | undefined {
  return typeof origin === 'string' ? uris.find(uri => new URL(uri).origin === origin) : undefined;
}

// Firebase Hosting forwards only __session. Store an opaque nonce, never a token/profile.
export function readStateCookie(header = ''): string {
  if (header.length > 8192) return '';
  const parts = header.split(';').map(value => value.trim());
  const current = parts.filter(value => value.startsWith('__session='));
  if (current.length) {
    if (current.length !== 1) return '';
    const match = /^__session=kakao1\.([A-Za-z0-9_-]{32})$/.exec(current[0]);
    return match?.[1] || '';
  }
  // Preserve already-started direct-origin logins across a rolling deployment.
  const legacy = parts.filter(value => value.startsWith('pt_kakao_state='));
  return legacy.length === 1 && /^pt_kakao_state=[A-Za-z0-9_-]{32}$/.test(legacy[0])
    ? legacy[0].slice('pt_kakao_state='.length) : '';
}

export function validStateRecord(data: any, origin: string | undefined, defaultUri: string, now = Date.now()): boolean {
  const uri = data?.redirectUri ?? defaultUri;
  return !!data && data.used === false && Number.isFinite(data.expiresAt) && data.expiresAt > now &&
    redirectForOrigin(origin) === uri;
}
