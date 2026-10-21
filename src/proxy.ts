import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { decideRoute } from './lib/auth/route-guard';
import { getSupabaseConfig } from './lib/supabase/server';

/** Refreshes the Supabase session cookie on every page request and guards protected pages. */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  let isAuthenticated = false;

  const config = getSupabaseConfig();
  if (config) {
    const supabase = createServerClient(config.url, config.anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    });
    try {
      // getUser() validates the session with Supabase Auth and triggers token refresh when needed.
      const { data } = await supabase.auth.getUser();
      isAuthenticated = Boolean(data.user);
    } catch {
      isAuthenticated = false;
    }
  }

  const decision = decideRoute(request.nextUrl.pathname, request.nextUrl.search, isAuthenticated);
  if (decision.action === 'next') return response;

  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  redirect.headers.set('Cache-Control', 'private, no-store');
  return redirect;
}

export const config = {
  // API routes authenticate themselves; skipping them also avoids proxy body buffering of uploads.
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|logo.svg).*)'],
};
