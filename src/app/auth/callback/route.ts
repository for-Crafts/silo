import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Google ログイン（OAuth / PKCE）の戻り先。メンバーかどうかは (app)/layout で判定する。 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/research`);
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
