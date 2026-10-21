import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '../../src/app/api/scan/route';

// Runs only against a hosted Supabase project configured in .env.local (values are never printed).
const envFile = join(import.meta.dirname, '..', '..', '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'MINIDSP_TEST_USER_A_EMAIL',
  'MINIDSP_TEST_USER_A_PASSWORD',
  'MINIDSP_TEST_USER_B_EMAIL',
  'MINIDSP_TEST_USER_B_PASSWORD',
] as const;
const missing = REQUIRED.filter((k) => !process.env[k]);
const env = (k: (typeof REQUIRED)[number]) => process.env[k] as string;

const RAW_VALUES = ['alex@example.test', '07700 900123', 'AB123456C', '4111 1111 1111 1111', '4111111111111111'];
const marker = `rls-test-${Date.now()}`;

function newClient(): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signIn(prefix: 'A' | 'B') {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: env(`MINIDSP_TEST_USER_${prefix}_EMAIL`),
    password: env(`MINIDSP_TEST_USER_${prefix}_PASSWORD`),
  });
  if (error || !data.session) throw new Error(`User ${prefix} sign-in failed`);
  return { client, userId: data.user.id, token: data.session.access_token };
}

function uploadRequest(name: string, headers: Record<string, string>): Request {
  const bytes = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'additional', '22_all_four.csv'));
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], name));
  return new Request('http://localhost/api/scan', { method: 'POST', body: form, headers });
}

const validFinding = { type: 'email', risk: 'Low', count: 1, maskedExample: 'a***@e***.test' };

describe.skipIf(missing.length > 0)('hosted Supabase: auth, atomic save and two-user RLS', () => {
  let a: Awaited<ReturnType<typeof signIn>>;
  let b: Awaited<ReturnType<typeof signIn>>;
  let scanA: string;

  beforeAll(async () => {
    a = await signIn('A');
    b = await signIn('B');
    expect(a.userId).not.toBe(b.userId);
  });

  afterAll(async () => {
    await a?.client.from('scans').delete().like('file_name', `${marker}%`);
    await b?.client.from('scans').delete().like('file_name', `${marker}%`);
  });

  const countMine = async (client: SupabaseClient, name: string) =>
    (await client.from('scans').select('id', { count: 'exact', head: true }).eq('file_name', name)).count;

  it('unauthenticated POST → 401 and nothing written', async () => {
    const name = `${marker}-unauth.csv`;
    const res = await POST(uploadRequest(name, {}));
    expect(res.status).toBe(401);
    expect(await countMine(a.client, name)).toBe(0);
  });

  it('User A authenticated POST → 201; scan + 4 masked findings stored, no raw values', async () => {
    const name = `${marker}-a.csv`;
    const res = await POST(uploadRequest(name, { authorization: `Bearer ${a.token}` }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { scanId: string; risk: string };
    expect(body.risk).toBe('Critical');
    scanA = body.scanId;

    const scans = await a.client.from('scans').select('*').eq('id', scanA);
    expect(scans.error).toBeNull();
    expect(scans.data).toHaveLength(1);
    expect(scans.data?.[0]).toMatchObject({ user_id: a.userId, file_name: name, risk: 'Critical', total_findings: 4 });

    const findings = await a.client.from('findings').select('*').eq('scan_id', scanA);
    expect(findings.data).toHaveLength(4);
    const stored = JSON.stringify([scans.data, findings.data]);
    for (const raw of RAW_VALUES) expect(stored).not.toContain(raw);
  });

  it('User B cannot read User A scan or findings', async () => {
    expect((await b.client.from('scans').select('*').eq('id', scanA)).data).toEqual([]);
    expect((await b.client.from('findings').select('*').eq('scan_id', scanA)).data).toEqual([]);
  });

  it('User B cannot update or delete User A scan', async () => {
    await b.client.from('scans').update({ file_name: 'hijacked.csv' }).eq('id', scanA);
    await b.client.from('scans').delete().eq('id', scanA);
    const still = await a.client.from('scans').select('file_name').eq('id', scanA);
    expect(still.data).toEqual([{ file_name: `${marker}-a.csv` }]);
  });

  it.each([
    ['as self', () => ({ user_id: b.userId })],
    ['impersonating A', () => ({ user_id: a.userId })],
    ['with default owner', () => ({})],
  ])('User B cannot attach findings to User A scan (%s)', async (_label, owner) => {
    const res = await b.client
      .from('findings')
      .insert({ scan_id: scanA, type: 'phone', risk: 'Medium', count: 1, masked_example: '***** ****23', ...owner() });
    expect(res.error).not.toBeNull();
    expect((await a.client.from('findings').select('id').eq('scan_id', scanA)).data).toHaveLength(4);
  });

  it('User B cannot create a scan owned by User A', async () => {
    const name = `${marker}-forged.csv`;
    const res = await b.client
      .from('scans')
      .insert({ user_id: a.userId, file_name: name, file_size_bytes: 1, risk: 'None', total_findings: 0 });
    expect(res.error).not.toBeNull();
    expect(await countMine(a.client, name)).toBe(0);
  });

  it('User B own scan is invisible to User A', async () => {
    const name = `${marker}-b.csv`;
    const { data: scanB, error } = await b.client.rpc('create_scan_with_findings', {
      p_file_name: name,
      p_file_size_bytes: 10,
      p_risk: 'Low',
      p_findings: [validFinding],
    });
    expect(error).toBeNull();
    expect(await countMine(b.client, name)).toBe(1);
    expect((await a.client.from('scans').select('id').eq('id', scanB)).data).toEqual([]);
  });

  it('anon role cannot read, insert or call the save RPC', async () => {
    const anon = newClient();
    expect((await anon.from('scans').select('id').eq('id', scanA)).data ?? []).toEqual([]);
    expect((await anon.from('findings').select('id').eq('scan_id', scanA)).data ?? []).toEqual([]);
    const name = `${marker}-anon.csv`;
    expect((await anon.from('scans').insert({ file_name: name, file_size_bytes: 1, risk: 'None', total_findings: 0 })).error).not.toBeNull();
    expect(
      (await anon.rpc('create_scan_with_findings', { p_file_name: name, p_file_size_bytes: 1, p_risk: 'None', p_findings: [] })).error,
    ).not.toBeNull();
  });

  it('atomic: an invalid second finding rolls back the whole scan', async () => {
    const name = `${marker}-rollback.csv`;
    const res = await a.client.rpc('create_scan_with_findings', {
      p_file_name: name,
      p_file_size_bytes: 10,
      p_risk: 'Medium',
      p_findings: [validFinding, { type: 'phone', risk: 'Medium', count: 0, maskedExample: '***** ****23' }],
    });
    expect(res.error).not.toBeNull();
    expect(await countMine(a.client, name)).toBe(0);
  });

  it('database rejects an unmasked example and writes nothing', async () => {
    const name = `${marker}-raw.csv`;
    const res = await a.client.rpc('create_scan_with_findings', {
      p_file_name: name,
      p_file_size_bytes: 10,
      p_risk: 'Critical',
      p_findings: [{ type: 'card', risk: 'Critical', count: 1, maskedExample: '4111 1111 1111 1111' }],
    });
    expect(res.error).not.toBeNull();
    expect(await countMine(a.client, name)).toBe(0);
  });

  it('database rejects a scan risk that does not match its findings', async () => {
    const name = `${marker}-mismatch.csv`;
    const res = await a.client.rpc('create_scan_with_findings', {
      p_file_name: name,
      p_file_size_bytes: 10,
      p_risk: 'None',
      p_findings: [validFinding],
    });
    expect(res.error).not.toBeNull();
    expect(await countMine(a.client, name)).toBe(0);
  });
});

describe.runIf(missing.length > 0)('hosted Supabase prerequisites', () => {
  it.skip(`NOT CONFIGURED — missing env vars: ${missing.join(', ')}`, () => {});
});
