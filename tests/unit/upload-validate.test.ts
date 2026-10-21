import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, validateUpload } from '../../src/lib/upload/validate';

const ADDITIONAL = join(import.meta.dirname, '..', 'fixtures', 'additional');
const fixture = (name: string) => new Uint8Array(readFileSync(join(ADDITIONAL, name)));
const utf8 = (s: string) => new TextEncoder().encode(s);

describe('validateUpload', () => {
  it('rejects fixture 28 (empty)', () => {
    expect(validateUpload('28_empty.txt', fixture('28_empty.txt'))).toMatchObject({ ok: false, status: 400, code: 'empty_file' });
  });

  it('rejects fixture 29 (unsupported .json) despite text content', () => {
    expect(validateUpload('29_unsupported.json', fixture('29_unsupported.json'))).toMatchObject({
      ok: false,
      status: 415,
      code: 'unsupported_type',
    });
  });

  it('rejects fixture 30 (> 1 MiB)', () => {
    const bytes = fixture('30_oversized.txt');
    expect(bytes.byteLength).toBeGreaterThan(MAX_UPLOAD_BYTES);
    expect(validateUpload('30_oversized.txt', bytes)).toMatchObject({ ok: false, status: 413, code: 'file_too_large' });
  });

  it('accepts exactly 1 MiB and 1 byte; rejects 1 MiB + 1', () => {
    expect(validateUpload('a.txt', new Uint8Array(MAX_UPLOAD_BYTES).fill(0x61)).ok).toBe(true);
    expect(validateUpload('a.txt', utf8('a')).ok).toBe(true);
    expect(validateUpload('a.txt', new Uint8Array(MAX_UPLOAD_BYTES + 1).fill(0x61))).toMatchObject({ code: 'file_too_large' });
  });

  it.each(['notes.txt', 'DATA.CSV', 'report.Txt', 'a.b.csv'])('accepts extension of %s', (name) => {
    expect(validateUpload(name, utf8('hello')).ok).toBe(true);
  });

  it.each(['data.json', 'notes.txt.exe', 'noextension', 'image.png', 'sheet.xlsx', '.txt.pdf'])('rejects %s', (name) => {
    expect(validateUpload(name, utf8('hello'))).toMatchObject({ ok: false, code: 'unsupported_type' });
  });

  it.each([
    ['PNG header with NUL', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]],
    ['NUL inside text', [...utf8('abc'), 0x00, ...utf8('def')]],
    ['UTF-16LE text', [0xff, 0xfe, 0x61, 0x00, 0x62, 0x00]],
    ['ESC control byte', [...utf8('abc'), 0x1b, ...utf8('def')]],
    ['DEL byte', [...utf8('abc'), 0x7f]],
  ])('rejects binary: %s', (_label, bytes) => {
    expect(validateUpload('file.txt', new Uint8Array(bytes))).toMatchObject({ ok: false, status: 422, code: 'binary_content' });
  });

  it.each([
    ['lone 0xFF', [...utf8('abc'), 0xff]],
    ['truncated 2-byte sequence', [...utf8('caf'), 0xc3]],
    ['invalid continuation', [0xc3, 0x28]],
    ['overlong encoding', [0xc0, 0xaf]],
    ['UTF-16 surrogate encoded as UTF-8', [0xed, 0xa0, 0x80]],
    ['Latin-1 encoded é', [...utf8('Caf'), 0xe9]],
  ])('rejects invalid UTF-8: %s', (_label, bytes) => {
    expect(validateUpload('file.csv', new Uint8Array(bytes))).toMatchObject({ ok: false, status: 422, code: 'invalid_utf8' });
  });

  it('accepts valid UTF-8 (fixture 27), tabs/CRLF and strips a BOM', () => {
    expect(validateUpload('27_unicode_utf8.txt', fixture('27_unicode_utf8.txt'))).toMatchObject({ ok: true });
    expect(validateUpload('a.csv', utf8('a\tb\r\nc,d\f'))).toEqual({ ok: true, text: 'a\tb\r\nc,d\f' });
    expect(validateUpload('a.txt', new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('hi')]))).toEqual({ ok: true, text: 'hi' });
  });

  it('error messages never echo the file name', () => {
    const r = validateUpload('secret-name.json', utf8('x'));
    expect(JSON.stringify(r)).not.toContain('secret-name');
  });
});
