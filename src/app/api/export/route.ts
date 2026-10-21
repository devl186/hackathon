import { NextResponse } from 'next/server';
import { buildExportCsv } from '../../../lib/export/data';
import { handleExport, type ExportAuthOutcome } from '../../../lib/export-handler';
import { authenticateRequest, type CookieToSet } from '../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  let refreshedCookies: CookieToSet[] = [];
  const authenticate = async (req: Request): Promise<ExportAuthOutcome> => {
    const auth = await authenticateRequest(req);
    if (auth.status !== 'authenticated') return auth;
    refreshedCookies = auth.cookiesToSet;
    return { status: 'authenticated', buildCsv: (filters) => buildExportCsv(auth.client, filters) };
  };

  const result = await handleExport(request, authenticate);
  if (refreshedCookies.length === 0) return result;

  const response = new NextResponse(result.body, { status: result.status, headers: result.headers });
  for (const { name, value, options } of refreshedCookies) response.cookies.set(name, value, options);
  return response;
}
