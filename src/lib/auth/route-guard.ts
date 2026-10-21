const PROTECTED_PREFIXES = ['/dashboard', '/findings'] as const;
const LOGIN_PATH = '/login';
const DEFAULT_AFTER_LOGIN = '/dashboard';

export type RouteDecision = { action: 'next' } | { action: 'redirect'; to: string };

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return pathname === '/' || PROTECTED_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

/** Only allow redirects back to known in-app pages (prevents open redirects via ?next=). */
export function safeNextPath(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return DEFAULT_AFTER_LOGIN;
  }
  const pathname = next.split(/[?#]/, 1)[0] ?? '';
  return PROTECTED_PREFIXES.some((p) => matchesPrefix(pathname, p)) ? next : DEFAULT_AFTER_LOGIN;
}

export function decideRoute(pathname: string, search: string, isAuthenticated: boolean): RouteDecision {
  if (matchesPrefix(pathname, LOGIN_PATH)) {
    return isAuthenticated ? { action: 'redirect', to: DEFAULT_AFTER_LOGIN } : { action: 'next' };
  }
  if (!isProtectedPath(pathname)) return { action: 'next' };
  if (isAuthenticated) {
    return pathname === '/' ? { action: 'redirect', to: DEFAULT_AFTER_LOGIN } : { action: 'next' };
  }
  const next = safeNextPath(pathname + search);
  return { action: 'redirect', to: `${LOGIN_PATH}?next=${encodeURIComponent(next)}` };
}
