import type { ScanRecordInput } from './persistence/scans';
import { scanText } from './scanner/scan';
import { MAX_UPLOAD_BYTES, validateUpload } from './upload/validate';

export interface ScanStore {
  save(input: ScanRecordInput): Promise<string>;
}

export type AuthOutcome =
  | { status: 'unconfigured' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; store: ScanStore };

// Allowance for multipart boundaries and part headers around a max-size file.
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

const SECURITY_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: SECURITY_HEADERS });
}

async function readBodyWithLimit(request: Request, limit: number): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function sanitizeFileName(name: string): string {
  return Array.from(name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()).slice(0, 255).join('');
}

export async function handleScanUpload(
  request: Request,
  authenticate: (request: Request) => Promise<AuthOutcome>,
): Promise<Response> {
  // Authenticate before touching the body so unauthenticated uploads are never read or processed.
  const auth = await authenticate(request);
  if (auth.status === 'unconfigured') {
    return errorResponse(503, 'auth_unavailable', 'Authentication is not configured.');
  }
  if (auth.status === 'unauthenticated') {
    return errorResponse(401, 'unauthenticated', 'Sign in to scan files.');
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return errorResponse(415, 'unsupported_request', 'Send the file as multipart/form-data.');
  }
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) {
    return errorResponse(413, 'file_too_large', 'The file exceeds the 1 MiB limit.');
  }

  const body = await readBodyWithLimit(request, MAX_REQUEST_BYTES);
  if (!body) return errorResponse(413, 'file_too_large', 'The file exceeds the 1 MiB limit.');

  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), { headers: { 'content-type': contentType } }).formData();
  } catch {
    return errorResponse(400, 'malformed_request', 'The upload could not be read.');
  }

  const files = [...form.values()].filter((v): v is File => typeof v !== 'string');
  const file = form.get('file');
  if (files.length !== 1 || !(file instanceof File)) {
    return errorResponse(400, 'invalid_file_count', 'Upload exactly one file in the "file" field.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateUpload(file.name, bytes);
  if (!validation.ok) return errorResponse(validation.status, validation.code, validation.message);

  const result = scanText(validation.text);
  let scanId: string;
  try {
    scanId = await auth.store.save({ fileName: sanitizeFileName(file.name), fileSizeBytes: bytes.byteLength, result });
  } catch {
    return errorResponse(500, 'save_failed', 'The scan could not be saved. Nothing was stored.');
  }

  return Response.json({ scanId, ...result }, { status: 201, headers: SECURITY_HEADERS });
}
