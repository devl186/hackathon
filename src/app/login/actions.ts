'use server';

import { redirect } from 'next/navigation';
import { safeNextPath } from '../../lib/auth/route-guard';
import { createSupabaseServerClient } from '../../lib/supabase/server-component';

export interface SignInState {
  error?: string;
}

const GENERIC_ERROR = 'Sign-in failed. Check your email and password and try again.';

export async function signIn(_prev: SignInState | undefined, formData: FormData): Promise<SignInState> {
  const email = formData.get('email');
  const password = formData.get('password');
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return { error: 'Enter your email and password.' };
  }
  if (email.length > 254 || password.length > 256) return { error: GENERIC_ERROR };

  let ok = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    ok = !error;
  } catch {
    return { error: 'Sign-in is unavailable right now. Try again later.' };
  }
  // One generic message: never reveal whether the account exists.
  if (!ok) return { error: GENERIC_ERROR };
  redirect(safeNextPath(formData.get('next')));
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Cookies are cleared by signOut when reachable; the proxy re-checks on the next request either way.
  }
  redirect('/login');
}
