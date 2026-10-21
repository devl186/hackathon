'use client';

import { useActionState } from 'react';
import { signIn, type SignInState } from './actions';
import { Message, Spinner } from '../../components/lp';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState | undefined, FormData>(signIn, undefined);
  return (
    <form action={action} className="form-stack" noValidate>
      <input type="hidden" name="next" value={next} />
      {state?.error ? (
        <Message variant="error" title="Not signed in">
          {state.error}
        </Message>
      ) : null}
      <div className="lp-input lp-input--full-width">
        <div className="lp-input__row lp-input__row--label-top">
          <label className="lp-input__label" htmlFor="email">
            Email
          </label>
          <div className={`lp-input__field${pending ? ' lp-input__field--disabled' : ''}`}>
            <input
              className="lp-input__input"
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={pending}
            />
          </div>
        </div>
      </div>
      <div className="lp-input lp-input--full-width">
        <div className="lp-input__row lp-input__row--label-top">
          <label className="lp-input__label" htmlFor="password">
            Password
          </label>
          <div className={`lp-input__field${pending ? ' lp-input__field--disabled' : ''}`}>
            <input
              className="lp-input__input"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
            />
          </div>
        </div>
      </div>
      <button type="submit" className="lp-button lp-button--primary lp-button--md lp-button--full-width" disabled={pending}>
        {pending ? (
          <>
            <span className="lp-button__icon-left">
              <Spinner size="sm" label="Signing in" />
            </span>
            Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </button>
    </form>
  );
}
