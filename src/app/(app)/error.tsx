'use client';

import { Message } from '../../components/lp';

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="page-body">
      <Message
        variant="error"
        title="Something went wrong"
        actions={
          <button type="button" className="lp-button lp-button--primary lp-button--sm" onClick={reset}>
            Try again
          </button>
        }
      >
        The page could not be displayed. Try again, or sign out and sign in again.
      </Message>
    </main>
  );
}
