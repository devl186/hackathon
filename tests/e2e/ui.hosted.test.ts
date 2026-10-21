import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Hosted UI smoke: needs `next start -H 127.0.0.1` running and MINIDSP_SMOKE_BASE_URL pointing at it.
const envFile = join(import.meta.dirname, '..', '..', '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const REQUIRED = [
  'MINIDSP_SMOKE_BASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'MINIDSP_TEST_USER_A_EMAIL',
  'MINIDSP_TEST_USER_A_PASSWORD',
  'MINIDSP_TEST_USER_B_EMAIL',
  'MINIDSP_TEST_USER_B_PASSWORD',
] as const;
const env = (k: (typeof REQUIRED)[number]) => process.env[k] ?? '';
const missing = REQUIRED.filter((k) => !process.env[k]);
// Human requirement: test accounts must use distinct, long synthetic passwords before hosted login smoke tests.
const weakPasswords =
  env('MINIDSP_TEST_USER_A_PASSWORD') === env('MINIDSP_TEST_USER_B_PASSWORD') ||
  env('MINIDSP_TEST_USER_A_PASSWORD').length < 16 ||
  env('MINIDSP_TEST_USER_B_PASSWORD').length < 16;
const base = env('MINIDSP_SMOKE_BASE_URL').replace(/\/$/, '');
const loopbackOnly = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base);
const marker = `ui-smoke-${Date.now()}`;

type Jar = Map<string, string>;

async function sessionCookies(user: 'A' | 'B') {
  const jar: Jar = new Map();
  const supabase = createServerClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) value ? jar.set(name, value) : jar.delete(name);
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: env(`MINIDSP_TEST_USER_${user}_EMAIL`),
    password: env(`MINIDSP_TEST_USER_${user}_PASSWORD`),
  });
  if (error) throw new Error(`User ${user} sign-in failed (${error.name}, status=${error.status})`);
  return { supabase, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join('; ') };
}

const get = (path: string, cookie?: string) =>
  fetch(`${base}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });

describe.skipIf(missing.length > 0 || weakPasswords || !loopbackOnly)('hosted UI smoke (loopback server)', { timeout: 30_000 }, () => {
  let a: Awaited<ReturnType<typeof sessionCookies>>;
  let b: Awaited<ReturnType<typeof sessionCookies>>;

  beforeAll(async () => {
    a = await sessionCookies('A');
    b = await sessionCookies('B');
  }, 30_000);

  afterAll(async () => {
    await a?.supabase.from('scans').delete().like('file_name', 'ui-smoke-%');
  }, 30_000);

  it('anonymous /dashboard redirects to /login', async () => {
    const res = await get('/dashboard');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?next=%2Fdashboard');
  });

  it('signed-in A sees the dashboard shell', async () => {
    const res = await get('/dashboard', a.cookie);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('lp-sidebar');
    expect(html).toContain('Files scanned');
  });

  it('A uploads via the cookie session; findings filter shows masked card only', async () => {
    const form = new FormData();
    const bytes = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'additional', '22_all_four.csv'));
    form.append('file', new File([new Uint8Array(bytes)], `${marker}.csv`));
    const upload = await fetch(`${base}/api/scan`, { method: 'POST', body: form, headers: { cookie: a.cookie } });
    expect(upload.status).toBe(201);

    const cards = await (await get('/findings?type=card&risk=Critical', a.cookie)).text();
    expect(cards).toContain(`${marker}.csv`);
    expect(cards).toContain('**** **** **** 1111');
    expect(cards).not.toContain('4111 1111 1111 1111');

    const emails = await (await get('/findings?type=email', a.cookie)).text();
    expect(emails).toContain('a***@e***.test');
    expect(emails).not.toContain('**** **** **** 1111');
    expect(emails).not.toContain('alex@example.test');
  });

  it('B cannot see A’s scan in the UI', async () => {
    const html = await (await get('/findings', b.cookie)).text();
    expect(html).not.toContain(marker);
    const dash = await (await get('/dashboard', b.cookie)).text();
    expect(dash).not.toContain(marker);
  });
});

if (missing.length > 0 || weakPasswords || !loopbackOnly) {
  describe('hosted UI smoke prerequisites', () => {
    it.skip(
      `NOT RUN — missing: ${missing.join(', ') || 'none'}; weak/shared passwords: ${weakPasswords}; loopback base URL: ${loopbackOnly}`,
      () => {},
    );
  });
}
