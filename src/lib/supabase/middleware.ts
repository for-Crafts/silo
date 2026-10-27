import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/mcp と /.well-known は Claude（OAuth トークン）用。Cookie ログインの判定から外す
const PUBLIC_PATHS = ["/login", "/auth", "/api/mcp", "/.well-known"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims verifies the JWT locally (JWKS cached) instead of a network round-trip per request.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // ログイン後に元のページ（Claude の同意画面など）へ戻れるようにする
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/research";
    return NextResponse.redirect(new URL(safe, request.url));
  }
  if (path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/research" : "/login";
    return NextResponse.redirect(url);
  }
  return response;
}
