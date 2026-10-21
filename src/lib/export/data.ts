import type { SupabaseClient } from '@supabase/supabase-js';
import type { DetectorType, RiskLevel } from '../scanner/types';
import { RISK_LEVELS } from '../scanner/types';
import { DataLoadError } from '../findings/data';
import { TYPE_LABELS, type FindingFilters } from '../findings/presentation';
import { toCsv } from './csv';

export const EXPORT_HEADER = ['File name', 'Scanned at (UTC)', 'Type', 'Risk', 'Count', 'Masked example'] as const;

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

export class ExportTooLargeError extends Error {
  constructor() {
    super('export_too_large');
  }
}

interface ScanMeta {
  id: string;
  file_name: string;
  created_at: string;
  risk: RiskLevel;
}

interface FindingAgg {
  scan_id: string;
  type: DetectorType;
  risk: Exclude<RiskLevel, 'None'>;
  count: number;
  masked_example: string;
}

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) throw new DataLoadError();
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) return rows;
  }
  throw new ExportTooLargeError();
}

/**
 * Builds the export from the caller's RLS-bound client only: scan metadata + masked aggregates.
 * Uploaded content and raw matches are never stored, so they cannot be exported.
 */
export async function buildExportCsv(client: SupabaseClient, filters: FindingFilters): Promise<string> {
  const scans = await fetchAll<ScanMeta>((from, to) =>
    client.from('scans').select('id,file_name,created_at,risk').order('created_at', { ascending: false }).order('id').range(from, to),
  );
  const findings = await fetchAll<FindingAgg>((from, to) => {
    let q = client.from('findings').select('scan_id,type,risk,count,masked_example').order('id');
    if (filters.type !== 'all') q = q.eq('type', filters.type);
    if (filters.risk !== 'all') q = q.eq('risk', filters.risk);
    return q.range(from, to);
  });

  const byScan = new Map<string, FindingAgg[]>();
  for (const f of findings) byScan.set(f.scan_id, [...(byScan.get(f.scan_id) ?? []), f]);
  const filtered = filters.type !== 'all' || filters.risk !== 'all';
  const severity = (r: RiskLevel) => RISK_LEVELS.indexOf(r);

  const rows: Array<Array<string | number>> = [];
  for (const scan of scans) {
    const scannedAt = new Date(scan.created_at).toISOString();
    const scanFindings = (byScan.get(scan.id) ?? []).sort((a, b) => severity(b.risk) - severity(a.risk));
    if (scanFindings.length === 0) {
      // Clean scans are still exported as metadata, unless the user filtered by type/risk.
      if (!filtered) rows.push([scan.file_name, scannedAt, '', scan.risk, 0, '']);
      continue;
    }
    for (const f of scanFindings) {
      rows.push([scan.file_name, scannedAt, TYPE_LABELS[f.type] ?? f.type, f.risk, f.count, f.masked_example]);
    }
  }
  return toCsv(EXPORT_HEADER, rows);
}
