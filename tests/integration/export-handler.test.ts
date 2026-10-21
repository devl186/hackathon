import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { GET } from '../../src/app/api/export/route';
import { buildExportCsv, ExportTooLargeError } from '../../src/lib/export/data';
import { handleExport, type ExportAuthOutcome } from '../../src/lib/export-handler';
import { fakeSupabase, parseCsv } from '../helpers';

const NOW = new Date('2026-10-21T08:30:00Z');
const url = (query = '') => new Request(`http://localhost/api/export${query}`);

// Two users, each with their own RLS-scoped client (simulated): the route must only ever use the session's client.
function userClient(owner: 'A' | 'B') {
  return fakeSupabase({
    scans: [{ data: [{ id: `${owner}-scan`, file_name: `${owner}-secret-file.csv`, created_at: '2026-10-21T07:00:00Z', risk: 'Low' }], error: null }],
    findings: [{ data: [{ scan_id: `${owner}-scan`, type: 'email', risk: 'Low', count: 1, masked_example: 'a***@e***.test' }], error: null }],
  });
}
const signedInAs = (client: SupabaseClient) => async (): Promise<ExportAuthOutcome> => ({
  status: 'authenticated',
  buildCsv: (filters) => buildExportCsv(client, filters),
});

let consoleSpies: MockInstance[] = [];
beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => {
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('GET /api/export handler', () => {
  it('unauthenticated → 401 JSON, no CSV', async () => {
    const res = await handleExport(url(), async () => ({ status: 'unauthenticated' }), NOW);
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toBeNull();
  });

  it('auth not configured → 503', async () => {
    expect((await handleExport(url(), async () => ({ status: 'unconfigured' }), NOW)).status).toBe(503);
  });

  it('authenticated → CSV attachment with safe headers and parseable body', async () => {
    const res = await handleExport(url(), signedInAs(userClient('A').client), NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="minidsp-findings-2026-10-21.csv"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const rows = parseCsv(new TextDecoder().decode(bytes));
    expect(rows[1]).toEqual(['A-secret-file.csv', '2026-10-21T07:00:00.000Z', 'Email', 'Low', '1', 'a***@e***.test']);
  });

  it('User B cannot export User A data: owner hints in the query are ignored; only the session client is used', async () => {
    const a = userClient('A');
    const b = userClient('B');
    const res = await handleExport(url('?user_id=A&owner=A&scan_id=A-scan&type=all'), signedInAs(b.client), NOW);
    const text = await res.text();
    expect(text).toContain('B-secret-file.csv');
    expect(text).not.toContain('A-secret-file.csv');
    expect(a.queries).toHaveLength(0);
    expect(JSON.stringify(b.queries)).not.toMatch(/user_id|A-scan/);
  });

  it('passes whitelisted filters only', async () => {
    const buildCsv = vi.fn(async () => 'x\r\n');
    await handleExport(url('?type=card&risk=Critical'), async () => ({ status: 'authenticated', buildCsv }), NOW);
    await handleExport(url("?type=card'--&risk=None"), async () => ({ status: 'authenticated', buildCsv }), NOW);
    expect(buildCsv.mock.calls).toEqual([[{ type: 'card', risk: 'Critical' }], [{ type: 'all', risk: 'all' }]]);
  });

  it('loader failure → generic 500 without details; too large → 413', async () => {
    const failing = await handleExport(
      url(),
      async () => ({ status: 'authenticated', buildCsv: async () => Promise.reject(new Error('db said alex@example.test')) }),
      NOW,
    );
    expect(failing.status).toBe(500);
    expect(await failing.text()).not.toContain('alex');
    const big = await handleExport(
      url(),
      async () => ({ status: 'authenticated', buildCsv: async () => Promise.reject(new ExportTooLargeError()) }),
      NOW,
    );
    expect(big.status).toBe(413);
  });
});

describe('GET /api/export real route wiring (no hosted project)', () => {
  it.each([
    ['no credentials', {}],
    ['garbage bearer', { authorization: 'Bearer nope' }],
    ['garbage cookie', { cookie: 'sb-127-auth-token=garbage' }],
  ])('%s → 401', async (_label, headers) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'placeholder-anon-key');
    const res = await GET(new Request('http://localhost/api/export', { headers }));
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).not.toContain('text/csv');
  });

  it('missing env → 503', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect((await GET(url())).status).toBe(503);
  });
});
