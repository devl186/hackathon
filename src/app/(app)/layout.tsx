import type { ReactNode } from 'react';
import { AppSidebar } from '../../components/app-sidebar';
import { requireUser } from '../../lib/supabase/server-component';
import { signOut } from '../login/actions';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="product-shell app-frame">
      <AppSidebar />
      <div className="app-main">
        <header className="top-bar">
          <span className="top-bar__user">Signed in as {user.email}</span>
          <form action={signOut}>
            <button type="submit" className="lp-button lp-button--secondary lp-button--sm">
              Sign out
            </button>
          </form>
        </header>
        {children}
      </div>
    </div>
  );
}
