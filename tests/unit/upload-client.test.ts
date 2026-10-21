import { describe, expect, it, vi } from 'vitest';
import { checkFileClientSide, messageForUploadError, submitUpload } from '../../src/lib/upload/client';

const file = (name: string, size: number) => new File([new Uint8Array(size).fill(0x61)], name);

describe('checkFileClientSide (usability only; server re-validates)', () => {
  it.each([
    [null, 'Choose a CSV or TXT file to scan.'],
    [file('a.json', 5), 'Only .csv and .txt files can be scanned.'],
    [file('a.txt', 0), 'The file is empty. Choose a file with content.'],
    [file('a.csv', 1_048_577), 'The file is larger than 1 MiB. Choose a smaller file.'],
  ])('%s → message', (f, message) => {
    expect(checkFileClientSide(f as File | null)).toBe(message);
  });

  it('accepts 1 byte .TXT and exactly 1 MiB .csv', () => {
    expect(checkFileClientSide(file('A.TXT', 1))).toBeNull();
    expect(checkFileClientSide(file('a.csv', 1_048_576))).toBeNull();
  });
});

describe('submitUpload', () => {
  const ok = { scanId: 'id-1', risk: 'Critical', totalFindings: 1, findings: [{ type: 'card', risk: 'Critical', count: 1, maskedExample: '**** **** **** 1111' }] };

  it('posts multipart to /api/scan same-origin and maps 201 to success', async () => {
    const fetchFn = vi.fn(async () => Response.json(ok, { status: 201 }));
    const state = await submitUpload(file('a.csv', 3), fetchFn as unknown as typeof fetch);
    expect(state).toEqual({ status: 'success', fileName: 'a.csv', result: ok });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/scan');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it.each([
    [401, { error: { code: 'unauthenticated' } }, 'Your session has ended. Sign in again to scan files.', true],
    [413, { error: { code: 'file_too_large' } }, 'The file is larger than 1 MiB. Choose a smaller file.', false],
    [422, { error: { code: 'invalid_utf8' } }, 'The file is not valid UTF-8 text. Save it as UTF-8 and try again.', false],
    [500, { error: { code: 'save_failed' } }, 'The scan could not be saved. Nothing was stored. Try again.', false],
    [502, null, 'The scan failed. Try again.', false],
  ])('HTTP %i → error state', async (status, body, message, signInAgain) => {
    const fetchFn = vi.fn(async () => (body ? Response.json(body, { status }) : new Response('<html>', { status })));
    expect(await submitUpload(file('a.csv', 3), fetchFn as unknown as typeof fetch)).toEqual({ status: 'error', message, signInAgain });
  });

  it('network failure → error state', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await submitUpload(file('a.csv', 3), fetchFn as unknown as typeof fetch)).toMatchObject({ status: 'error', signInAgain: false });
  });

  it('unknown error codes get a generic message (server detail never shown)', () => {
    expect(messageForUploadError('weird<script>')).toBe('The scan failed. Try again.');
    expect(messageForUploadError(undefined)).toBe('The scan failed. Try again.');
  });
});
