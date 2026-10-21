import { parseFindingFilters, type FindingFilters } from './findings/presentation';
import { ExportTooLargeError } from './export/data';

export type ExportAuthOutcome =
  | { status: 'unconfigured' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; buildCsv: (filters: FindingFilters) => Promise<string> };

const BASE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: BASE_HEADERS });
}

export async function handleExport(
  request: Request,
  authenticate: (request: Request) => Promise<ExportAuthOutcome>,
  now: Date = new Date(),
): Promise<Response> {
  const auth = await authenticate(request);
  if (auth.status === 'unconfigured') return errorResponse(503, 'auth_unavailable', 'Authentication is not configured.');
  if (auth.status === 'unauthenticated') return errorResponse(401, 'unauthenticated', 'Sign in to export findings.');

  // Only type/risk are read from the query; ownership comes solely from the session (RLS).
  const params = new URL(request.url).searchParams;
  const filters = parseFindingFilters({ type: params.get('type') ?? undefined, risk: params.get('risk') ?? undefined });

  let csv: string;
  try {
    csv = await auth.buildCsv(filters);
  } catch (error) {
    if (error instanceof ExportTooLargeError) {
      return errorResponse(413, 'export_too_large', 'Too many records to export at once. Apply a type or risk filter.');
    }
    return errorResponse(500, 'export_failed', 'The export could not be created. Try again.');
  }

  const stamp = now.toISOString().slice(0, 10);
  // BOM so spreadsheet apps read UTF-8 file names correctly.
  return new Response(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="minidsp-findings-${stamp}.csv"`,
    },
  });
}
