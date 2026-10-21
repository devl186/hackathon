import type { UploadState } from '../lib/upload/client';
import { TYPE_LABELS } from '../lib/findings/presentation';
import { Message, Spinner } from './lp';

export function UploadStatus({ state }: { state: UploadState }) {
  switch (state.status) {
    case 'idle':
      return null;
    case 'uploading':
      return (
        <p className="inline-status">
          <Spinner size="sm" label="Scanning file" />
          Scanning {state.fileName}…
        </p>
      );
    case 'invalid':
      return (
        <Message variant="warning" title="Check the file">
          {state.message}
        </Message>
      );
    case 'error':
      return (
        <Message
          variant="error"
          title="Scan failed"
          actions={
            state.signInAgain ? (
              <a className="lp-link lp-link--standalone" href="/login">
                Sign in again
              </a>
            ) : undefined
          }
        >
          {state.message}
        </Message>
      );
    case 'success': {
      const { result } = state;
      const summary =
        result.totalFindings === 0
          ? 'No sensitive data patterns were found.'
          : result.findings.map((f) => `${TYPE_LABELS[f.type]}: ${f.count}`).join(' · ');
      return (
        <Message
          variant="success"
          title="Scan saved"
          actions={
            <a className="lp-link lp-link--standalone" href="/findings">
              View findings
            </a>
          }
        >
          {state.fileName} — risk {result.risk}, {result.totalFindings} {result.totalFindings === 1 ? 'finding' : 'findings'}.{' '}
          {summary}
        </Message>
      );
    }
  }
}
