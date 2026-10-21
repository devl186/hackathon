import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from '../../src/proxy';

const req = (path: string, headers: Record<string, string> = {}) => new NextRequest(new URL(path, 'http://localhost:3000'), { headers });

afterEach(() => {
  vi.unstubAllEnvs();
});

function useUnreachableSupabase() {
  // Loopback port 9 refuses connections: proves the proxy fails closed without a hosted project.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'placeholder-anon-key');
}

describe('proxy: protected routes', () => {
  it.each([
    ['/dashboard', '/login?next=%2Fdashboard'],
    ['/findings?type=card&risk=Critical', `/login?next=${encodeURIComponent('/findings?type=card&risk=Critical')}`],
    ['/', '/login?next=%2Fdashboard'],
  ])('anonymous %s → 307 %s', async (path, location) => {
    useUnreachableSupabase();
    const res = await proxy(req(path));
    expect(res.status).toBe(307);
    const target = new URL(res.headers.get('location') ?? '');
    expect(target.pathname + target.search).toBe(location);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('a garbage session cookie is not accepted', async () => {
    useUnreachableSupabase();
    const res = await proxy(req('/dashboard', { cookie: 'sb-127-auth-token=garbage' }));
    expect(res.status).toBe(307);
  });

  it('fails closed when Supabase env is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const res = await proxy(req('/findings'));
    expect(res.status).toBe(307);
  });

  it('anonymous /login passes through', async () => {
    useUnreachableSupabase();
    const res = await proxy(req('/login'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('matcher excludes API routes and static assets', () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test('/dashboard')).toBe(true);
    expect(pattern.test('/findings')).toBe(true);
    expect(pattern.test('/api/scan')).toBe(false);
    expect(pattern.test('/_next/static/chunk.js')).toBe(false);
    expect(pattern.test('/logo.svg')).toBe(false);
  });
});
