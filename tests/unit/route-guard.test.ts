import { describe, expect, it } from 'vitest';
import { decideRoute, isProtectedPath, safeNextPath } from '../../src/lib/auth/route-guard';

describe('decideRoute', () => {
  it.each(['/dashboard', '/findings', '/findings/x', '/'])('redirects anonymous users away from %s', (path) => {
    const d = decideRoute(path, '', false);
    expect(d.action).toBe('redirect');
    expect(d.action === 'redirect' && d.to.startsWith('/login?next=')).toBe(true);
  });

  it('preserves an in-app next path including filters', () => {
    expect(decideRoute('/findings', '?risk=High&type=nino', false)).toEqual({
      action: 'redirect',
      to: `/login?next=${encodeURIComponent('/findings?risk=High&type=nino')}`,
    });
  });

  it('lets authenticated users through and sends / to the dashboard', () => {
    expect(decideRoute('/dashboard', '', true)).toEqual({ action: 'next' });
    expect(decideRoute('/findings', '?risk=Low', true)).toEqual({ action: 'next' });
    expect(decideRoute('/', '', true)).toEqual({ action: 'redirect', to: '/dashboard' });
  });

  it('shows /login to anonymous users and bounces signed-in users to the dashboard', () => {
    expect(decideRoute('/login', '', false)).toEqual({ action: 'next' });
    expect(decideRoute('/login', '', true)).toEqual({ action: 'redirect', to: '/dashboard' });
  });

  it('does not treat look-alike prefixes as protected', () => {
    expect(isProtectedPath('/dashboards')).toBe(false);
    expect(isProtectedPath('/findingsX')).toBe(false);
  });
});

describe('safeNextPath (open-redirect guard)', () => {
  it.each([
    ['/findings?risk=High', '/findings?risk=High'],
    ['/dashboard', '/dashboard'],
    ['https://evil.example', '/dashboard'],
    ['//evil.example/dashboard', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    ['/login', '/dashboard'],
    ['/api/scan', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    [undefined, '/dashboard'],
    [42, '/dashboard'],
  ])('%s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
