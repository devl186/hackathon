import type { ScanResult } from '../scanner/types';
import { MAX_UPLOAD_BYTES } from './validate';

export type UploadState =
  | { status: 'idle' }
  | { status: 'invalid'; message: string }
  | { status: 'uploading'; fileName: string }
  | { status: 'success'; fileName: string; result: ScanResult & { scanId: string } }
  | { status: 'error'; message: string; signInAgain: boolean };

/** Usability pre-check only — the server re-validates everything. */
export function checkFileClientSide(file: File | null | undefined): string | null {
  if (!file) return 'Choose a CSV or TXT file to scan.';
  if (!/\.(csv|txt)$/i.test(file.name)) return 'Only .csv and .txt files can be scanned.';
  if (file.size === 0) return 'The file is empty. Choose a file with content.';
  if (file.size > MAX_UPLOAD_BYTES) return 'The file is larger than 1 MiB. Choose a smaller file.';
  return null;
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: 'Your session has ended. Sign in again to scan files.',
  empty_file: 'The file is empty. Choose a file with content.',
  file_too_large: 'The file is larger than 1 MiB. Choose a smaller file.',
  unsupported_type: 'Only .csv and .txt files can be scanned.',
  binary_content: 'The file looks binary, not text. Upload a plain CSV or TXT file.',
  invalid_utf8: 'The file is not valid UTF-8 text. Save it as UTF-8 and try again.',
  invalid_file_count: 'Upload exactly one file.',
  malformed_request: 'The upload could not be read. Try again.',
  save_failed: 'The scan could not be saved. Nothing was stored. Try again.',
  auth_unavailable: 'Scanning is unavailable right now. Try again later.',
};

export function messageForUploadError(code: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || 'The scan failed. Try again.';
}

/** Posts the file to the authenticated scan route and maps the response to a UI state. */
export async function submitUpload(file: File, fetchFn: typeof fetch = fetch): Promise<UploadState> {
  const body = new FormData();
  body.append('file', file);
  let response: Response;
  try {
    response = await fetchFn('/api/scan', { method: 'POST', body, credentials: 'same-origin' });
  } catch {
    return { status: 'error', message: 'The server could not be reached. Check your connection and try again.', signInAgain: false };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 201 && payload && typeof payload === 'object' && 'scanId' in payload) {
    return { status: 'success', fileName: file.name, result: payload as ScanResult & { scanId: string } };
  }
  const code = (payload as { error?: { code?: string } } | null)?.error?.code;
  return {
    status: 'error',
    message: messageForUploadError(response.status === 401 ? 'unauthenticated' : code),
    signInAgain: response.status === 401,
  };
}
