import type { SupabaseClient } from '@supabase/supabase-js';

export type FakeResult = { data: unknown; error: unknown };
export type RecordedQuery = { table: string; ops: Array<[string, unknown[]]> };

/** Minimal chainable fake of the Supabase query builder; each awaited query pops the next result for its table. */
export function fakeSupabase(queues: Record<string, FakeResult[]>) {
  const queries: RecordedQuery[] = [];
  const client = {
    from(table: string) {
      const entry: RecordedQuery = { table, ops: [] };
      queries.push(entry);
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              const next = queues[table]?.shift() ?? { data: null, error: { message: 'unexpected query' } };
              return (resolve: (r: FakeResult) => unknown) => resolve(next);
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

export const opsOf = (q: RecordedQuery, name: string) => q.ops.filter(([op]) => op === name).map(([, a]) => a);

/** Independent RFC 4180 parser used to verify our CSV output (CRLF records, quoted fields, doubled quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else {
      field += c;
    }
  }
  if (inQuotes) throw new Error('unterminated quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
