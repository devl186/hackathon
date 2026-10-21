import { safeNextPath } from '../../lib/auth/route-guard';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in — MiniDSP' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);
  return (
    <main className="product-shell login-shell">
      <div className="login-panel">
        <div className="lp-card lp-card--elevated lp-card--borderless">
          <div className="lp-card__header">
            <div className="lp-card__title">Sign in to MiniDSP</div>
          </div>
          <div className="lp-card__body">
            <div className="form-stack">
              <p className="body-copy">Training-only data discovery. Use synthetic files and your test account.</p>
              <LoginForm next={next} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
