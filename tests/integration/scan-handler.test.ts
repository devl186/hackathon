import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { ScanRecordInput } from '../../src/lib/persistence/scans';
import { handleScanUpload, sanitizeFileName, type AuthOutcome } from '../../src/lib/scan-handler';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const ADDITIONAL = join(FIXTURES, 'additional');
const URL_ = 'http://localhost/api/scan';
const RAW_VALUES = ['alex@example.test', '07700 900123', 'AB123456C', '4111 1111 1111 1111', 'email,phone'];

function upload(files: Array<{ name: string; bytes: Uint8Array<ArrayBuffer> | string }>, field = 'file'): Request {
  const form = new FormData();
  for (const f of files) form.append(field, new File([f.bytes], f.name));
  return new Request(URL_, { method: 'POST', body: form });
}

const fixtureUpload = (dir: string, name: string) => upload([{ name, bytes: new Uint8Array(readFileSync(join(dir, name))) }]);

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

let saved: ScanRecordInput[];
let save: ReturnType<typeof vi.fn<(input: ScanRecordInput) => Promise<string>>>;
const signedIn = async (): Promise<AuthOutcome> => ({ status: 'authenticated', store: { save } });
const post = (request: Request) => handleScanUpload(request, signedIn);

let consoleSpies: MockInstance[] = [];
beforeEach(() => {
  saved = [];
  save = vi.fn(async (input: ScanRecordInput) => {
    saved.push(input);
    return '00000000-0000-4000-8000-000000000001';
  });
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => {
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('authentication gate', () => {
  function lazyBodyRequest() {
    const state = { pulled: 0 };
    // highWaterMark 0: the stream only pulls when a consumer actually reads.
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          state.pulled++;
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request(URL_, {
      method: 'POST',
      body,
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      duplex: 'half',
    } as RequestInit);
    return { request, state };
  }

  it('unauthenticated → 401, body never read, nothing saved', async () => {
    const { request, state } = lazyBodyRequest();
    const res = await handleScanUpload(request, async () => ({ status: 'unauthenticated' }));
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('unauthenticated');
    expect(state.pulled).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('control: authenticated request does read the same kind of body', async () => {
    const { request, state } = lazyBodyRequest();
    await post(request);
    expect(state.pulled).toBeGreaterThan(0);
  });

  it('unauthenticated with a valid file → 401, no scan result returned', async () => {
    const res = await handleScanUpload(fixtureUpload(ADDITIONAL, '22_all_four.csv'), async () => ({ status: 'unauthenticated' }));
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).not.toContain('risk');
  });

  it('auth not configured → 503, nothing saved', async () => {
    const res = await handleScanUpload(fixtureUpload(ADDITIONAL, '03_one_email.txt'), async () => ({ status: 'unconfigured' }));
    expect(res.status).toBe(503);
    expect(await errorCode(res)).toBe('auth_unavailable');
  });
});

describe('authenticated save', () => {
  it('22_all_four.csv → 201 with scanId and sanitized aggregate; store receives masked data only', async () => {
    const res = await post(fixtureUpload(ADDITIONAL, '22_all_four.csv'));
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    const body = JSON.parse(text);
    expect(Object.keys(body).sort()).toEqual(['findings', 'risk', 'scanId', 'totalFindings']);
    expect(body).toMatchObject({ scanId: '00000000-0000-4000-8000-000000000001', risk: 'Critical', totalFindings: 4 });

    expect(save).toHaveBeenCalledTimes(1);
    expect(saved[0]).toMatchObject({ fileName: '22_all_four.csv', fileSizeBytes: 83 });
    expect(Object.keys(saved[0]!).sort()).toEqual(['fileName', 'fileSizeBytes', 'result']);
    const persisted = JSON.stringify(saved[0]);
    for (const raw of RAW_VALUES) {
      expect(text).not.toContain(raw);
      expect(persisted).not.toContain(raw);
    }
    expect(persisted).not.toMatch(/\d{5,}/);
  });

  it('clean file is saved with risk None and no findings', async () => {
    const res = await post(fixtureUpload(FIXTURES, 'sample-safe.txt'));
    expect(res.status).toBe(201);
    expect(saved[0]?.result).toEqual({ risk: 'None', totalFindings: 0, findings: [] });
  });

  it('save failure → 500 save_failed, no scan result or id leaked', async () => {
    save.mockRejectedValueOnce(new Error('db exploded with alex@example.test'));
    const res = await post(fixtureUpload(ADDITIONAL, '22_all_four.csv'));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe('save_failed');
    expect(text).not.toContain('scanId');
    expect(text).not.toContain('alex');
    expect(text).not.toContain('findings');
  });

  it('accepts an exactly 1 MiB file', async () => {
    const res = await post(upload([{ name: 'big.txt', bytes: new Uint8Array(1_048_576).fill(0x61) }]));
    expect(res.status).toBe(201);
    expect(saved[0]?.fileSizeBytes).toBe(1_048_576);
  });

  it('sanitizes control and format characters in the stored file name', () => {
    expect(sanitizeFileName(' re\u0000port\u202E.csv ')).toBe('report.csv');
    expect(Array.from(sanitizeFileName('a'.repeat(300) + '.txt'))).toHaveLength(255);
  });
});

describe('rejected uploads are never saved', () => {
  afterEach(() => expect(save).not.toHaveBeenCalled());

  it('fixture 28 (empty) → 400 empty_file', async () => {
    const res = await post(fixtureUpload(ADDITIONAL, '28_empty.txt'));
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('empty_file');
  });

  it('fixture 29 (.json) → 415 unsupported_type, contents not echoed', async () => {
    const res = await post(fixtureUpload(ADDITIONAL, '29_unsupported.json'));
    expect(res.status).toBe(415);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe('unsupported_type');
    expect(text).not.toContain('alex');
  });

  it('fixture 30 (> 1 MiB) → 413 file_too_large', async () => {
    const res = await post(fixtureUpload(ADDITIONAL, '30_oversized.txt'));
    expect(res.status).toBe(413);
    expect(await errorCode(res)).toBe('file_too_large');
  });

  it('generated binary (PNG header) → 422 binary_content', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const res = await post(upload([{ name: 'image.txt', bytes: png }]));
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('binary_content');
  });

  it('generated invalid UTF-8 → 422 invalid_utf8', async () => {
    const res = await post(upload([{ name: 'latin1.csv', bytes: new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0xff]) }]));
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('invalid_utf8');
  });

  it('no file → 400 invalid_file_count', async () => {
    const form = new FormData();
    form.append('note', 'text only');
    const res = await post(new Request(URL_, { method: 'POST', body: form }));
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('invalid_file_count');
  });

  it('two files → 400 invalid_file_count', async () => {
    const res = await post(
      upload([
        { name: 'a.txt', bytes: 'one' },
        { name: 'b.txt', bytes: 'two' },
      ]),
    );
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('invalid_file_count');
  });

  it('file in the wrong field → 400 invalid_file_count', async () => {
    const res = await post(upload([{ name: 'a.txt', bytes: 'hello' }], 'other'));
    expect(res.status).toBe(400);
  });

  it('non-multipart body → 415 unsupported_request', async () => {
    const res = await post(
      new Request(URL_, { method: 'POST', body: 'alex@example.test', headers: { 'content-type': 'text/plain' } }),
    );
    expect(res.status).toBe(415);
    expect(await errorCode(res)).toBe('unsupported_request');
  });

  it('malformed multipart → 400 malformed_request', async () => {
    const res = await post(
      new Request(URL_, {
        method: 'POST',
        body: 'not really multipart',
        headers: { 'content-type': 'multipart/form-data; boundary=xyz' },
      }),
    );
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('malformed_request');
  });

  it('oversized declared Content-Length → 413 before reading the body', async () => {
    const res = await post(
      new Request(URL_, {
        method: 'POST',
        body: 'x',
        headers: { 'content-type': 'multipart/form-data; boundary=xyz', 'content-length': String(5 * 1_048_576) },
      }),
    );
    expect(res.status).toBe(413);
  });

  it('oversized streamed body without Content-Length → 413 (stream is capped)', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024).fill(0x61);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk.byteLength;
        if (pulled > 10 * 1_048_576) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const res = await post(
      new Request(URL_, {
        method: 'POST',
        body: stream,
        headers: { 'content-type': 'multipart/form-data; boundary=xyz' },
        duplex: 'half',
      } as RequestInit),
    );
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(2 * 1_048_576);
  });
});
