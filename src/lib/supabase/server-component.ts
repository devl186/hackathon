import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseConfig } from './server';

/** User-scoped client for Server Components and Server Actions (anon key + session cookie; RLS applies). */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const config = getSupabaseConfig();
  if (!config) throw new Error('supabase_unconfigured');
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write cookies; the proxy refreshes sessions on each request.
        }
      },
    },
  });
}

/** Defence in depth behind the proxy: every protected page re-validates the user server-side. */
export async function requireUser(): Promise<{ client: SupabaseClient; user: User }> {
  let client: SupabaseClient;
  try {
    client = await createSupabaseServerClient();
  } catch {
    redirect('/login');
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect('/login');
  return { client, user: data.user };
}
