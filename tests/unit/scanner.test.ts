import { describe, expect, it } from 'vitest';
import { maskDigits, passesLuhn } from '../../src/lib/scanner/detectors';
import { scanText } from '../../src/lib/scanner/scan';

// Independent check-digit helper so length-boundary tests use genuinely Luhn-valid numbers.
function withLuhnCheckDigit(body: string): string {
  for (let d = 0; d <= 9; d++) {
    const digits = body + d;
    let sum = 0;
    [...digits].reverse().forEach((ch, i) => {
      let n = Number(ch);
      if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
      sum += n;
    });
    if (sum % 10 === 0) return digits;
  }
  throw new Error('unreachable');
}

const typesOf = (text: string) => scanText(text).findings.map((f) => f.type);
const findingOf = (text: string, type: string) => scanText(text).findings.find((f) => f.type === type);

describe('email (Low)', () => {
  it('detects and masks a plausible email', () => {
    const r = scanText('Contact alex@example.test today');
    expect(r.risk).toBe('Low');
    expect(r.findings).toEqual([{ type: 'email', risk: 'Low', count: 1, maskedExample: 'a***@e***.test' }]);
  });

  it.each([
    'alex@@example.test',
    'alex at example dot test',
    'alex@example',
    'alex@.example.test',
    '.alex@example.test',
    'alex..b@example.test',
    'alex@example.t',
    'x@alex@example.test',
  ])('ignores malformed %s', (text) => {
    expect(scanText(text).risk).toBe('None');
  });

  it('is case-insensitive and stops at sentence punctuation', () => {
    expect(findingOf('EMAIL: SAM@EXAMPLE.TEST.', 'email')).toMatchObject({ count: 1, maskedExample: 'S***@E***.TEST' });
  });
});

describe('UK phone (Medium)', () => {
  it.each(['07700 900123', '+44 7700 900123', '07700900123', '07700-900-123', '+447700900123', '020 7946 0123', '0113 496 0000'])(
    'detects %s',
    (phone) => {
      const r = scanText(`Call ${phone} now`);
      expect(r.risk).toBe('Medium');
      expect(r.findings[0]).toMatchObject({ type: 'phone', count: 1 });
    },
  );

  it('masks all but the last two digits', () => {
    expect(findingOf('07700 900123', 'phone')?.maskedExample).toBe('***** ****23');
    expect(findingOf('+44 7700 900123', 'phone')?.maskedExample).toBe('+** **** ****23');
  });

  it.each([
    '12345',
    '0770 090',
    '077009001234', // too long
    '107700900123', // embedded in a longer number
    '07700 900123 4', // digit run continues
    'ID07700900123',
    '+44 07700 900123',
    '07000 900123', // 070 personal number, not mobile
    '05555 123456',
  ])('ignores %s', (text) => {
    expect(scanText(text).findings.filter((f) => f.type === 'phone')).toEqual([]);
  });
});

describe('UK NINO format (High)', () => {
  it.each(['AB 12 34 56 C', 'AB123456C', 'ab123456c', 'ab 12 34 56 c', 'AB123456'])('detects %s', (nino) => {
    const r = scanText(`NINO: ${nino}.`);
    expect(r.risk).toBe('High');
    expect(r.findings[0]?.type).toBe('nino');
  });

  it('masks digits and suffix', () => {
    expect(findingOf('AB 12 34 56 C', 'nino')?.maskedExample).toBe('AB ** ** ** *');
    expect(findingOf('ab123456', 'nino')?.maskedExample).toBe('AB ** ** **');
  });

  it.each([
    'QQ123456C', // Q not permitted first
    'DA123456C', // D not permitted first
    'AO123456C', // O not permitted second
    'BG123456C', // banned prefix
    'GB123456C',
    'ZZ123456C',
    'AB123456E', // suffix outside A-D
    'AB12345C', // five digits
    'XAB123456C', // embedded in a word
    'AB1234567',
    'AB 12 34 56 7',
  ])('ignores malformed %s', (text) => {
    expect(scanText(text).findings.filter((f) => f.type === 'nino')).toEqual([]);
  });
});

describe('card candidates (Critical)', () => {
  it('Luhn helper matches known values', () => {
    expect(passesLuhn('4111111111111111')).toBe(true);
    expect(passesLuhn('4111111111111112')).toBe(false);
  });

  it.each(['4111 1111 1111 1111', '4111-1111-1111-1111', '4111111111111111', '4222222222222', '5500 0000 0000 0004'])(
    'detects Luhn-valid %s',
    (card) => {
      const r = scanText(`Card: ${card}.`);
      expect(r.risk).toBe('Critical');
      expect(r.findings).toHaveLength(1);
      expect(r.findings[0]).toMatchObject({ type: 'card', count: 1 });
    },
  );

  it('masks all but the last four digits', () => {
    expect(findingOf('4111 1111 1111 1111', 'card')?.maskedExample).toBe('**** **** **** 1111');
    expect(findingOf('4111-1111-1111-1111', 'card')?.maskedExample).toBe('****-****-****-1111');
  });

  it('accepts 13 and 19 digit Luhn-valid numbers', () => {
    expect(typesOf(withLuhnCheckDigit('411111111111'))).toEqual(['card']);
    expect(typesOf(withLuhnCheckDigit('411111111111111111'))).toEqual(['card']);
  });

  it('rejects 12 and 20 digit Luhn-valid numbers (no partial match)', () => {
    expect(typesOf(withLuhnCheckDigit('41111111111'))).toEqual([]);
    expect(typesOf(withLuhnCheckDigit('4111111111111111111'))).toEqual([]);
  });

  it.each([
    '4111 1111 1111 1112', // Luhn failure
    '4111 1111 1111', // too short
    '0000 0000 0000 0000', // repeated digit placeholder
    'X4111111111111111',
    '4111  1111 1111 1111', // double space breaks the candidate
  ])('ignores %s', (text) => {
    expect(scanText(text).findings.filter((f) => f.type === 'card')).toEqual([]);
  });
});

describe('classification and aggregation', () => {
  it('clean text is None with no findings', () => {
    expect(scanText('Project status: green. Meeting at noon.')).toEqual({ risk: 'None', totalFindings: 0, findings: [] });
    expect(scanText('')).toEqual({ risk: 'None', totalFindings: 0, findings: [] });
  });

  it('highest risk wins and findings are ordered by risk', () => {
    const r = scanText('alex@example.test, 07700 900123, AB123456C, 4111 1111 1111 1111');
    expect(r.risk).toBe('Critical');
    expect(r.findings.map((f) => f.type)).toEqual(['card', 'nino', 'phone', 'email']);
    expect(r.totalFindings).toBe(4);
  });

  it('counts repeated non-overlapping matches per type with the first masked example', () => {
    const r = scanText('alex@example.test, ALEX@EXAMPLE.TEST and sam@example.test; 07700 900123 / 07700 900124');
    expect(r.findings).toEqual([
      { type: 'phone', risk: 'Medium', count: 2, maskedExample: '***** ****23' },
      { type: 'email', risk: 'Low', count: 3, maskedExample: 'a***@e***.test' },
    ]);
    expect(r.totalFindings).toBe(5);
  });

  it('a card is not also counted as a phone', () => {
    expect(typesOf('5500 0000 0000 0004')).toEqual(['card']);
  });

  it('handles CRLF and quoted multiline CSV records', () => {
    const r = scanText('id,notes\r\n1,"Contact alex@example.test\r\nPhone 07700 900123"\r\n');
    expect(r.risk).toBe('Medium');
    expect(r.totalFindings).toBe(2);
  });

  it('never returns raw matched values', () => {
    const raw = ['alex@example.test', '07700 900123', '07700900123', 'AB 12 34 56 C', 'AB123456C', '4111 1111 1111 1111', '4111111111111111'];
    const json = JSON.stringify(scanText(raw.join('\n')));
    for (const value of raw) expect(json).not.toContain(value);
    expect(json).not.toMatch(/\d{5,}/);
    expect(json).not.toContain('alex');
  });

  it('only exposes the sanitized aggregate fields', () => {
    const r = scanText('alex@example.test 4111 1111 1111 1111');
    expect(Object.keys(r).sort()).toEqual(['findings', 'risk', 'totalFindings']);
    for (const f of r.findings) expect(Object.keys(f).sort()).toEqual(['count', 'maskedExample', 'risk', 'type']);
  });

  it('maskDigits preserves separators', () => {
    expect(maskDigits('12-34 56', 2)).toBe('**-** 56');
  });

  it('scans ~1 MiB of dense matches quickly', () => {
    const line = 'alex@example.test,07700 900123,AB123456C,4111 1111 1111 1111\n';
    const text = line.repeat(Math.floor(1_048_576 / line.length));
    const started = performance.now();
    const r = scanText(text);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(r.findings.every((f) => f.count === Math.floor(1_048_576 / line.length))).toBe(true);
  });
});
