import { describe, expect, it } from 'vitest';
import { csvField, neutralizeFormula, toCsv } from '../../src/lib/export/csv';
import { buildExportCsv, EXPORT_HEADER, ExportTooLargeError } from '../../src/lib/export/data';
import { fakeSupabase, opsOf, parseCsv } from '../helpers';

describe('neutralizeFormula', () => {
  it.each([
    '=HYPERLINK("http://evil.example","x")',
    '+1+1',
    '-2+3',
    '@SUM(A1)',
    '\t=1+1',
    '\r=1+1',
    '\n=1+1',
    ' =1+1',
    '  @cmd',
    '\u0000=1',
    '\u001f+1',
    '\tplain',
    '\rplain',
    '\nplain',
    '\uFF1D1+1',
    '+** **** ****23',
  ])('prefixes a quote: %j', (value) => {
    expect(neutralizeFormula(value)).toBe(`'${value}`);
  });

  it.each(['report.csv', 'a=b.csv', 'q3-results.txt', 'alex@example.test', '**** **** **** 1111', 'a***@e***.test', 'AB ** ** ** *', ''])(
    'leaves safe value unchanged: %j',
    (value) => {
      expect(neutralizeFormula(value)).toBe(value);
    },
  );
});

describe('csvField / toCsv quoting', () => {
  it('always quotes, doubles embedded quotes, keeps numbers plain', () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(42)).toBe('"42"');
    expect(csvField(-1)).toBe('"-1"');
  });

  it('round-trips commas, quotes and newlines through an independent RFC 4180 parser', () => {
    const tricky = ['a,b.csv', 'he said "x".txt', 'line1\nline2.csv', 'cr\r\nlf.txt', 'Résumé ✓.csv'];
    const csv = toCsv(['File'], tricky.map((t) => [t]));
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(parseCsv(csv)).toEqual([['File'], ...tricky.map((t) => [t])]);
  });

  it('neutralized values survive parsing as text with the leading quote', () => {
    const parsed = parseCsv(toCsv(['File'], [['=cmd|" /C calc"!A0'], ['\n@x']]));
    expect(parsed[1]).toEqual(['\'=cmd|" /C calc"!A0']);
    expect(parsed[2]).toEqual(["'\n@x"]);
  });
});

describe('buildExportCsv', () => {
  const scans = [
    { id: 's1', file_name: '=HYPERLINK("http://evil.example","x"),.csv', created_at: '2026-10-21T07:05:00Z', risk: 'Critical' },
    { id: 's2', file_name: 'clean "notes"\n2.txt', created_at: '2026-10-21T06:00:00Z', risk: 'None' },
  ];
  const findings = [
    { scan_id: 's1', type: 'email', risk: 'Low', count: 2, masked_example: 'a***@e***.test' },
    { scan_id: 's1', type: 'card', risk: 'Critical', count: 1, masked_example: '**** **** **** 1111' },
    { scan_id: 's1', type: 'phone', risk: 'Medium', count: 1, masked_example: '+** **** ****23' },
  ];

  it('exports scan metadata + masked aggregates, highest risk first, clean scans included', async () => {
    const { client, queries } = fakeSupabase({ scans: [{ data: scans, error: null }], findings: [{ data: findings, error: null }] });
    const csv = await buildExportCsv(client, { type: 'all', risk: 'all' });
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...EXPORT_HEADER]);
    expect(rows.slice(1)).toEqual([
      ['\'=HYPERLINK("http://evil.example","x"),.csv', '2026-10-21T07:05:00.000Z', 'Payment card', 'Critical', '1', '**** **** **** 1111'],
      ['\'=HYPERLINK("http://evil.example","x"),.csv', '2026-10-21T07:05:00.000Z', 'UK phone', 'Medium', '1', "'+** **** ****23"],
      ['\'=HYPERLINK("http://evil.example","x"),.csv', '2026-10-21T07:05:00.000Z', 'Email', 'Low', '2', 'a***@e***.test'],
      ['clean "notes"\n2.txt', '2026-10-21T06:00:00.000Z', '', 'None', '0', ''],
    ]);
    // Only masked columns are selected; ownership is left to RLS (no user_id filter from the app).
    expect(opsOf(queries[0]!, 'select')).toEqual([['id,file_name,created_at,risk']]);
    expect(opsOf(queries[1]!, 'select')).toEqual([['scan_id,type,risk,count,masked_example']]);
    expect(JSON.stringify(queries)).not.toContain('user_id');
    for (const raw of ['alex@example.test', '4111 1111 1111 1111', '4111111111111111', '07700 900123']) expect(csv).not.toContain(raw);
  });

  it('applies type/risk filters in the query and omits clean scans when filtered', async () => {
    const { client, queries } = fakeSupabase({
      scans: [{ data: scans, error: null }],
      findings: [{ data: [findings[1]], error: null }],
    });
    const rows = parseCsv(await buildExportCsv(client, { type: 'card', risk: 'Critical' }));
    expect(rows).toHaveLength(2);
    expect(rows[1]![2]).toBe('Payment card');
    expect(opsOf(queries[1]!, 'eq')).toEqual([
      ['type', 'card'],
      ['risk', 'Critical'],
    ]);
  });

  it('pages through results and refuses unbounded exports', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}`, file_name: 'f.txt', created_at: '2026-10-21T00:00:00Z', risk: 'None' }));
    const { client } = fakeSupabase({ scans: Array.from({ length: 20 }, () => ({ data: full, error: null })) });
    await expect(buildExportCsv(client, { type: 'all', risk: 'all' })).rejects.toBeInstanceOf(ExportTooLargeError);
  });

  it('a database error becomes a generic failure', async () => {
    const { client } = fakeSupabase({ scans: [{ data: null, error: { message: 'detail alex@example.test' } }] });
    await expect(buildExportCsv(client, { type: 'all', risk: 'all' })).rejects.toThrow(/^data_load_failed$/);
  });
});
