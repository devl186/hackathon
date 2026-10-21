'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { checkFileClientSide, submitUpload, type UploadState } from '../lib/upload/client';
import { Spinner } from './lp';
import { UploadStatus } from './upload-status';

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const uploading = state.status === 'uploading';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    const problem = checkFileClientSide(file);
    if (problem || !file) {
      setState({ status: 'invalid', message: problem ?? 'Choose a CSV or TXT file to scan.' });
      return;
    }
    setState({ status: 'uploading', fileName: file.name });
    const next = await submitUpload(file);
    setState(next);
    if (next.status === 'success') {
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    }
  }

  const invalid = state.status === 'invalid';
  return (
    <div className="lp-card">
      <div className="lp-card__header">
        <div className="lp-card__title">Scan a file</div>
      </div>
      <div className="lp-card__body">
      <form className="form-stack" onSubmit={onSubmit} noValidate>
        <div className="lp-input lp-input--full-width">
          <div className="lp-input__row lp-input__row--label-top">
            <label className="lp-input__label" htmlFor="scan-file">
              CSV or TXT file
            </label>
            <div className={`lp-input__field${invalid ? ' lp-input__field--error' : ''}`}>
              <input
                ref={inputRef}
                className="lp-input__input"
                id="scan-file"
                name="file"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                aria-describedby="scan-file-hint"
                aria-invalid={invalid || undefined}
                disabled={uploading}
                onChange={() => state.status !== 'idle' && !uploading && setState({ status: 'idle' })}
              />
            </div>
          </div>
          <div className="lp-input__message" id="scan-file-hint">
            Up to 1 MiB, UTF-8 text. Use synthetic data only. Only masked results are saved; the file itself is not stored.
          </div>
        </div>
        <div className="footer-actions">
          <button type="submit" className="lp-button lp-button--primary lp-button--md" disabled={uploading}>
            {uploading ? (
              <>
                <span className="lp-button__icon-left">
                  <Spinner size="sm" label="Scanning" />
                </span>
                Scanning…
              </>
            ) : (
              'Scan file'
            )}
          </button>
        </div>
        <div aria-live="polite">
          <UploadStatus state={state} />
        </div>
      </form>
      </div>
    </div>
  );
}
