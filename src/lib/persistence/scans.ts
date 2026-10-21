import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScanResult } from '../scanner/scan';

export interface ScanRecordInput {
  fileName: string;
  fileSizeBytes: number;
  result: ScanResult;
}

/** Saves scan metadata + masked aggregates in one transaction via the RLS-bound RPC. Returns the scan id. */
export async function saveScan(client: SupabaseClient, input: ScanRecordInput): Promise<string> {
  const { data, error } = await client.rpc('create_scan_with_findings', {
    p_file_name: input.fileName,
    p_file_size_bytes: input.fileSizeBytes,
    p_risk: input.result.risk,
    p_findings: input.result.findings.map(({ type, risk, count, maskedExample }) => ({ type, risk, count, maskedExample })),
  });
  // Deliberately drop database error details so nothing upstream can log or return them.
  if (error || typeof data !== 'string') throw new Error('save_failed');
  return data;
}
