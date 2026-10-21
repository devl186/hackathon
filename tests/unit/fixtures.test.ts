import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/lib/scanner/scan';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const ADDITIONAL = join(FIXTURES, 'additional');

interface Expected {
  file: string;
  expected_file_risk: string;
}

const expected: Expected[] = JSON.parse(readFileSync(join(ADDITIONAL, 'EXPECTED_RESULTS.json'), 'utf8'));
const scannable = expected.filter((e) => e.expected_file_risk !== 'Reject');
const scanFixture = (path: string) => scanText(readFileSync(path, 'utf8'));
const counts = (path: string) => Object.fromEntries(scanFixture(path).findings.map((f) => [f.type, f.count]));

describe('additional fixtures: expected file risk', () => {
  it('covers all non-reject fixtures', () => {
    expect(scannable).toHaveLength(27);
  });

  it.each(scannable.map((e) => [e.file, e.expected_file_risk]))('%s → %s', (file, risk) => {
    expect(scanFixture(join(ADDITIONAL, file)).risk).toBe(risk);
  });
});

describe('additional fixtures: aggregated counts', () => {
  it.each([
    ['04_many_emails.csv', { email: 2 }],
    ['05_repeated_email.txt', { email: 2 }],
    ['11_email_and_phone.csv', { email: 1, phone: 1 }],
    ['16_nino_and_email.csv', { nino: 1, email: 1 }],
    ['21_card_and_nino.csv', { card: 1, nino: 1 }],
    ['22_all_four.csv', { card: 1, nino: 1, phone: 1, email: 1 }],
    ['23_repeated_cards.txt', { card: 2 }],
    ['24_case_and_spacing.txt', { nino: 1, email: 1 }],
    ['25_multiline_records.csv', { phone: 1, email: 1 }],
    ['26_quoted_csv.csv', { email: 1 }],
    ['27_unicode_utf8.txt', { email: 1 }],
  ] as const)('%s', (file, expectedCounts) => {
    expect(counts(join(ADDITIONAL, file))).toEqual(expectedCounts);
  });
});

describe('starter fixtures', () => {
  it('sample-mixed.txt is Critical; Luhn-invalid card is excluded', () => {
    const r = scanFixture(join(FIXTURES, 'sample-mixed.txt'));
    expect(r.risk).toBe('Critical');
    expect(counts(join(FIXTURES, 'sample-mixed.txt'))).toEqual({ card: 1, nino: 1, phone: 1, email: 1 });
  });

  it('sample-safe.txt is None', () => {
    expect(scanFixture(join(FIXTURES, 'sample-safe.txt'))).toEqual({ risk: 'None', totalFindings: 0, findings: [] });
  });
});
