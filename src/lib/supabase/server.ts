import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AuthResult =
  | { status: 'unconfigured' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; userId: string; client: SupabaseClient };

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/**
 * Validates the caller with Supabase Auth (Bearer token or SSR session cookies) and returns a
 * user-scoped client (anon key + caller's JWT) so every query is subject to RLS.
 */
export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const config = getSupabaseConfig();
  if (!config) return { status: 'unconfigured' };

  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  const client = bearer
    ? createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      })
    : createServerClient(config.url, config.anonKey, {
        cookies: {
          getAll: () =>
            parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => ({ name, value: value ?? '' })),
          // Session refresh cookies are not written back from this API route.
          setAll: () => {},
        },
      });

  try {
    // getUser() verifies the token with the Supabase Auth server rather than trusting the cookie/JWT locally.
    const { data, error } = bearer ? await client.auth.getUser(bearer) : await client.auth.getUser();
    if (error || !data.user) return { status: 'unauthenticated' };
    return { status: 'authenticated', userId: data.user.id, client };
  } catch {
    return { status: 'unauthenticated' };
  }
}
