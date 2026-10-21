export const MAX_UPLOAD_BYTES = 1_048_576;
const ALLOWED_EXTENSIONS = new Set(['.csv', '.txt']);

export type UploadErrorCode =
  | 'unsupported_type'
  | 'empty_file'
  | 'file_too_large'
  | 'binary_content'
  | 'invalid_utf8';

export type UploadValidation =
  | { ok: true; text: string }
  | { ok: false; status: 400 | 413 | 415 | 422; code: UploadErrorCode; message: string };

// C0 controls other than TAB, LF, FF, CR, plus DEL. Bytes < 0x80 are always ASCII in UTF-8, so this is safe pre-decode.
function hasBinaryBytes(bytes: Uint8Array): boolean {
  for (const b of bytes) {
    if ((b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0c && b !== 0x0d) || b === 0x7f) return true;
  }
  return false;
}

/** Server-side validation of an uploaded file. Error messages never echo file name or content. */
export function validateUpload(fileName: string, bytes: Uint8Array): UploadValidation {
  const dot = fileName.lastIndexOf('.');
  const extension = dot === -1 ? '' : fileName.slice(dot).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, status: 415, code: 'unsupported_type', message: 'Only .csv and .txt files are supported.' };
  }
  if (bytes.byteLength === 0) {
    return { ok: false, status: 400, code: 'empty_file', message: 'The file is empty.' };
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, code: 'file_too_large', message: 'The file exceeds the 1 MiB limit.' };
  }
  if (hasBinaryBytes(bytes)) {
    return { ok: false, status: 422, code: 'binary_content', message: 'The file appears to be binary, not text.' };
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, status: 422, code: 'invalid_utf8', message: 'The file is not valid UTF-8 text.' };
  }
}
