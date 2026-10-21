import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { DataLoadError, listFindings, loadDashboard, summarizeScans } from '../../src/lib/findings/data';
import { formatScanDate, parseFindingFilters } from '../../src/lib/findings/presentation';

type Result = { data: unknown; error: unknown };

/** Minimal chainable fake of the Supabase query builder; records every call per query. */
function fakeClient(queues: Record<string, Result[]>) {
  const queries: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  const client = {
    from(table: string) {
      const entry = { table, ops: [] as Array<[string, unknown[]]> };
      queries.push(entry);
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              const next = queues[table]?.shift() ?? { data: null, error: { message: 'unexpected query' } };
              return (resolve: (r: Result) => unknown) => resolve(next);
            }
            return (...args: unknown[]) => {
              entry.ops.push([prop, args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const opsOf = (q: { ops: Array<[string, unknown[]]> }, name: string) => q.ops.filter(([op]) => op === name).map(([, a]) => a);

describe('parseFindingFilters', () => {
  it('accepts whitelisted values', () => {
    expect(parseFindingFilters({ type: 'card', risk: 'Critical' })).toEqual({ type: 'card', risk: 'Critical' });
  });

  it('falls back to "all" for missing, unknown or injection-like values', () => {
    expect(parseFindingFilters({})).toEqual({ type: 'all', risk: 'all' });
    expect(parseFindingFilters({ type: "card' or 1=1", risk: 'critical' })).toEqual({ type: 'all', risk: 'all' });
  });

  it('rejects unknown values exactly', () => {
    expect(parseFindingFilters({ type: 'ssn', risk: 'None' })).toEqual({ type: 'all', risk: 'all' });
    expect(parseFindingFilters({ type: ['phone', 'card'], risk: ['High'] })).toEqual({ type: 'phone', risk: 'High' });
  });
});

describe('summarizeScans', () => {
  it('computes totals, high/critical counts and distribution', () => {
    const s = summarizeScans([
      { risk: 'Critical', total_findings: 4 },
      { risk: 'Critical', total_findings: 2 },
      { risk: 'High', total_findings: 1 },
      { risk: 'None', total_findings: 0 },
      { risk: 'Low', total_findings: 3 },
    ]);
    expect(s).toEqual({
      filesScanned: 5,
      totalFindings: 10,
      highRiskFiles: 1,
      criticalRiskFiles: 2,
      distribution: { None: 1, Low: 1, Medium: 0, High: 1, Critical: 2 },
    });
  });

  it('is all zeros for no scans', () => {
    expect(summarizeScans([]).filesScanned).toBe(0);
    expect(summarizeScans([]).totalFindings).toBe(0);
  });
});

describe('listFindings', () => {
  const findings = [
    { id: 'f1', scan_id: 's1', type: 'card', risk: 'Critical', count: 2, masked_example: '**** **** **** 1111' },
    { id: 'f2', scan_id: 's2', type: 'card', risk: 'Critical', count: 1, masked_example: '****-****-****-1111' },
  ];
  const scans = [
    { id: 's1', file_name: 'a.csv', created_at: '2026-10-21T07:00:00Z' },
    { id: 's2', file_name: 'b.txt', created_at: '2026-10-21T06:00:00Z' },
  ];

  it('applies type and risk filters in the query and joins file names', async () => {
    const { client, queries } = fakeClient({ findings: [{ data: findings, error: null }], scans: [{ data: scans, error: null }] });
    const { rows, truncated } = await listFindings(client, { type: 'card', risk: 'Critical' });
    const q = queries[0]!;
    expect(q.table).toBe('findings');
    expect(opsOf(q, 'eq')).toEqual([
      ['type', 'card'],
      ['risk', 'Critical'],
    ]);
    expect(rows.map((r) => [r.fileName, r.maskedExample, r.count])).toEqual([
      ['a.csv', '**** **** **** 1111', 2],
      ['b.txt', '****-****-****-1111', 1],
    ]);
    expect(truncated).toBe(false);
    expect(opsOf(queries[1]!, 'in')).toEqual([['id', ['s1', 's2']]]);
  });

  it('adds no filter for "all" and never filters by user id client-side (RLS is authoritative)', async () => {
    const { client, queries } = fakeClient({ findings: [{ data: [], error: null }] });
    expect(await listFindings(client, { type: 'all', risk: 'all' })).toEqual({ rows: [], truncated: false });
    expect(opsOf(queries[0]!, 'eq')).toEqual([]);
    expect(JSON.stringify(queries)).not.toContain('user_id');
  });

  it('only applies the risk filter when type is all', async () => {
    const { client, queries } = fakeClient({ findings: [{ data: [], error: null }] });
    await listFindings(client, { type: 'all', risk: 'High' });
    expect(opsOf(queries[0]!, 'eq')).toEqual([['risk', 'High']]);
  });

  it('throws a generic DataLoadError on query failure', async () => {
    const { client } = fakeClient({ findings: [{ data: null, error: { message: 'boom alex@example.test' } }] });
    await expect(listFindings(client, { type: 'all', risk: 'all' })).rejects.toBeInstanceOf(DataLoadError);
    await expect(
      listFindings(fakeClient({ findings: [{ data: null, error: {} }] }).client, { type: 'all', risk: 'all' }),
    ).rejects.toThrow(/^data_load_failed$/);
  });
});

describe('loadDashboard', () => {
  it('summarizes all pages and returns recent scans', async () => {
    const page1 = Array.from({ length: 1000 }, () => ({ risk: 'Low', total_findings: 1 }));
    const page2 = [{ risk: 'Critical', total_findings: 4 }];
    const recent = [{ id: 's1', file_name: 'a.csv', file_size_bytes: 10, risk: 'Critical', total_findings: 4, created_at: '2026-10-21T07:00:00Z' }];
    const { client, queries } = fakeClient({
      scans: [
        { data: page1, error: null },
        { data: page2, error: null },
        { data: recent, error: null },
      ],
    });
    const d = await loadDashboard(client);
    expect(d.summary.filesScanned).toBe(1001);
    expect(d.summary.totalFindings).toBe(1004);
    expect(d.summary.criticalRiskFiles).toBe(1);
    expect(d.truncated).toBe(false);
    expect(d.recent).toEqual(recent);
    expect(opsOf(queries[1]!, 'range')).toEqual([[1000, 1999]]);
    expect(opsOf(queries[2]!, 'limit')).toEqual([[5]]);
  });

  it('throws DataLoadError on failure', async () => {
    const { client } = fakeClient({ scans: [{ data: null, error: { message: 'x' } }] });
    await expect(loadDashboard(client)).rejects.toBeInstanceOf(DataLoadError);
  });
});

describe('formatScanDate', () => {
  it('formats in UTC and handles bad input', () => {
    expect(formatScanDate('2026-10-21T07:05:00Z')).toBe('21 Oct 2026, 07:05 UTC');
    expect(formatScanDate('not a date')).toBe('-');
  });
});
