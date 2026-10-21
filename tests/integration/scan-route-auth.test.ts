import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/scan/route';
import { saveScan } from '../../src/lib/persistence/scans';
import type { SupabaseClient } from '@supabase/supabase-js';

function fileRequest(headers: Record<string, string> = {}): Request {
  const form = new FormData();
  form.append('file', new File(['Synthetic contact: alex@example.test'], 'one.txt'));
  return new Request('http://localhost/api/scan', { method: 'POST', body: form, headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/scan with real Supabase auth wiring (no hosted project)', () => {
  it('returns 503 when Supabase env is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const res = await POST(fileRequest());
    expect(res.status).toBe(503);
  });

  // Unreachable loopback URL: proves the route fails closed without any hosted project.
  it.each([
    ['no credentials', {}],
    ['garbage bearer token', { authorization: 'Bearer not-a-real-token' }],
    ['garbage session cookie', { cookie: 'sb-127-auth-token=garbage' }],
  ])('returns 401 with %s', async (_label, headers) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'placeholder-anon-key');
    const res = await POST(fileRequest(headers));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('risk');
  });
});

describe('saveScan', () => {
  const result = {
    risk: 'Low' as const,
    totalFindings: 2,
    findings: [{ type: 'email' as const, risk: 'Low' as const, count: 2, maskedExample: 'a***@e***.test' }],
  };

  it('calls the atomic RPC with masked aggregates only', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'scan-id', error: null });
    const id = await saveScan({ rpc } as unknown as SupabaseClient, { fileName: 'a.txt', fileSizeBytes: 10, result });
    expect(id).toBe('scan-id');
    expect(rpc).toHaveBeenCalledWith('create_scan_with_findings', {
      p_file_name: 'a.txt',
      p_file_size_bytes: 10,
      p_risk: 'Low',
      p_findings: [{ type: 'email', risk: 'Low', count: 2, maskedExample: 'a***@e***.test' }],
    });
  });

  it('throws a generic error without database details', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'violates constraint on alex@example.test' } });
    await expect(saveScan({ rpc } as unknown as SupabaseClient, { fileName: 'a.txt', fileSizeBytes: 10, result })).rejects.toThrow(
      /^save_failed$/,
    );
  });
});
