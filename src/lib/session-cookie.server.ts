const COOKIE_NAME = '__Host-access_portal_refresh';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function readRefreshCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0 || entry.slice(0, separator).trim() !== COOKIE_NAME) continue;
    try { return decodeURIComponent(entry.slice(separator + 1).trim()) || null; } catch { return null; }
  }
  return null;
}

export function refreshCookie(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearRefreshCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function rejectCrossSiteRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return true;
  return request.headers.get('sec-fetch-site') === 'cross-site';
}

export function publicSession(session: { access_token: string; expires_in: number; token_type?: string }) {
  return { access_token: session.access_token, expires_in: session.expires_in, token_type: session.token_type || 'bearer' };
}
