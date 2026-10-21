import { NextResponse } from 'next/server';
import { saveScan } from '../../../lib/persistence/scans';
import { handleScanUpload, type AuthOutcome } from '../../../lib/scan-handler';
import { authenticateRequest, type CookieToSet } from '../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let refreshedCookies: CookieToSet[] = [];
  const authenticate = async (req: Request): Promise<AuthOutcome> => {
    const auth = await authenticateRequest(req);
    if (auth.status !== 'authenticated') return auth;
    refreshedCookies = auth.cookiesToSet;
    return { status: 'authenticated', store: { save: (input) => saveScan(auth.client, input) } };
  };

  const result = await handleScanUpload(request, authenticate);
  if (refreshedCookies.length === 0) return result;

  const response = new NextResponse(result.body, { status: result.status, headers: result.headers });
  for (const { name, value, options } of refreshedCookies) response.cookies.set(name, value, options);
  return response;
}
