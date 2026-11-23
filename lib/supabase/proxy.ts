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

function isServerAction(request: NextRequest) {
  return request.headers.has("next-action");
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Signing out clears cookies on its own response. Refreshing the session here would write them back.
  if (path === "/auth/sign-out" || path === "/auth/account-deleted") {
    return NextResponse.next({ request });
  }

  const serverAction = isServerAction(request);
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
          // Cache headers on a server action replace the RSC payload the client is waiting for.
          if (!serverAction) {
            Object.entries(headers).forEach(([key, value]) =>
              supabaseResponse.headers.set(key, value),
            );
          }
        },
      },
    },
  );

  // Must run right after createServerClient, or the session cookie goes stale.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const isPrivate = path.startsWith("/clinics") || path.startsWith("/profile");
  const isAuthScreen = path === "/login" || path === "/register";

  // A normal redirect is an HTML page. Server actions must answer with the RSC
  // payload, or the client throws "An unexpected response was received from the server."
  // The action itself sends the user to login when the session is missing.
  if (!signedIn && isPrivate && !serverAction) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return carrySession(supabaseResponse, NextResponse.redirect(url));
  }

  if (signedIn && isAuthScreen && !serverAction) {
    const url = request.nextUrl.clone();
    url.pathname = "/clinics";
    url.search = "";
    return carrySession(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}
