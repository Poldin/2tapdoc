import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function carrySession(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(key);
    if (value) to.headers.set(key, value);
  }
  return to;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Must run right after createServerClient, or the session cookie goes stale.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;
  const isPrivate = path.startsWith("/clinics") || path.startsWith("/profile");
  const isAuthScreen = path === "/login" || path === "/register";

  if (!signedIn && isPrivate) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return carrySession(supabaseResponse, NextResponse.redirect(url));
  }

  if (signedIn && isAuthScreen) {
    const url = request.nextUrl.clone();
    url.pathname = "/clinics";
    url.search = "";
    return carrySession(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}
