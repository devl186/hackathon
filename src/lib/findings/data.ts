import type { SupabaseClient } from '@supabase/supabase-js';
import type { DetectorType, RiskLevel } from '../scanner/types';
import type { FindingFilters } from './presentation';

export interface ScanRow {
  id: string;
  file_name: string;
  file_size_bytes: number;
  risk: RiskLevel;
  total_findings: number;
  created_at: string;
}

export interface FindingRow {
  id: string;
  scanId: string;
  fileName: string;
  scannedAt: string;
  type: DetectorType;
  risk: Exclude<RiskLevel, 'None'>;
  count: number;
  maskedExample: string;
}

export interface DashboardSummary {
  filesScanned: number;
  totalFindings: number;
  highRiskFiles: number;
  criticalRiskFiles: number;
  distribution: Record<RiskLevel, number>;
}

export const RECENT_SCANS_LIMIT = 5;
export const FINDINGS_LIMIT = 500;
const PAGE_SIZE = 1000;
const MAX_SUMMARY_PAGES = 20;
const SCAN_ID_CHUNK = 100;

export class DataLoadError extends Error {
  constructor() {
    super('data_load_failed');
  }
}

export function summarizeScans(rows: Pick<ScanRow, 'risk' | 'total_findings'>[]): DashboardSummary {
  const distribution: Record<RiskLevel, number> = { None: 0, Low: 0, Medium: 0, High: 0, Critical: 0 };
  let totalFindings = 0;
  for (const row of rows) {
    if (row.risk in distribution) distribution[row.risk]++;
    totalFindings += row.total_findings;
  }
  return {
    filesScanned: rows.length,
    totalFindings,
    highRiskFiles: distribution.High,
    criticalRiskFiles: distribution.Critical,
    distribution,
  };
}

/** All queries go through the caller's RLS-bound client; no owner filter is trusted from the client. */
export async function loadDashboard(
  client: SupabaseClient,
): Promise<{ summary: DashboardSummary; recent: ScanRow[]; truncated: boolean }> {
  const rows: Pick<ScanRow, 'risk' | 'total_findings'>[] = [];
  let truncated = true;
  for (let page = 0; page < MAX_SUMMARY_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client
      .from('scans')
      .select('risk,total_findings')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data) throw new DataLoadError();
    rows.push(...(data as Pick<ScanRow, 'risk' | 'total_findings'>[]));
    if (data.length < PAGE_SIZE) {
      truncated = false;
      break;
    }
  }

  const recent = await client
    .from('scans')
    .select('id,file_name,file_size_bytes,risk,total_findings,created_at')
    .order('created_at', { ascending: false })
    .limit(RECENT_SCANS_LIMIT);
  if (recent.error || !recent.data) throw new DataLoadError();

  return { summary: summarizeScans(rows), recent: recent.data as ScanRow[], truncated };
}

export async function listFindings(
  client: SupabaseClient,
  filters: FindingFilters,
): Promise<{ rows: FindingRow[]; truncated: boolean }> {
  let query = client
    .from('findings')
    .select('id,scan_id,type,risk,count,masked_example,created_at')
    .order('created_at', { ascending: false })
    .limit(FINDINGS_LIMIT);
  if (filters.type !== 'all') query = query.eq('type', filters.type);
  if (filters.risk !== 'all') query = query.eq('risk', filters.risk);

  const findings = await query;
  if (findings.error || !findings.data) throw new DataLoadError();
  const data = findings.data as Array<{
    id: string;
    scan_id: string;
    type: DetectorType;
    risk: FindingRow['risk'];
    count: number;
    masked_example: string;
  }>;
  if (data.length === 0) return { rows: [], truncated: false };

  const scanIds = [...new Set(data.map((f) => f.scan_id))];
  const byId = new Map<string, Pick<ScanRow, 'id' | 'file_name' | 'created_at'>>();
  // Chunked to keep the PostgREST query string short.
  for (let i = 0; i < scanIds.length; i += SCAN_ID_CHUNK) {
    const scans = await client.from('scans').select('id,file_name,created_at').in('id', scanIds.slice(i, i + SCAN_ID_CHUNK));
    if (scans.error || !scans.data) throw new DataLoadError();
    for (const s of scans.data as Pick<ScanRow, 'id' | 'file_name' | 'created_at'>[]) byId.set(s.id, s);
  }

  const rows = data.flatMap((f): FindingRow[] => {
    const scan = byId.get(f.scan_id);
    if (!scan) return [];
    return [
      {
        id: f.id,
        scanId: f.scan_id,
        fileName: scan.file_name,
        scannedAt: scan.created_at,
        type: f.type,
        risk: f.risk,
        count: f.count,
        maskedExample: f.masked_example,
      },
    ];
  });
  return { rows, truncated: data.length === FINDINGS_LIMIT };
}
