import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Google ログイン（OAuth / PKCE）の戻り先。メンバーかどうかは (app)/layout で判定する。 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = request.cookies.get("silo_next")?.value ? decodeURIComponent(request.cookies.get("silo_next")!.value) : null;
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/research";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(`${origin}${next}`);
      res.cookies.delete("silo_next");
      return res;
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
