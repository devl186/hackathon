import { saveScan } from '../../../lib/persistence/scans';
import { handleScanUpload, type AuthOutcome } from '../../../lib/scan-handler';
import { authenticateRequest } from '../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authenticate(request: Request): Promise<AuthOutcome> {
  const auth = await authenticateRequest(request);
  if (auth.status !== 'authenticated') return auth;
  return { status: 'authenticated', store: { save: (input) => saveScan(auth.client, input) } };
}

export async function POST(request: Request): Promise<Response> {
  return handleScanUpload(request, authenticate);
}
