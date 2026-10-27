import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Role } from "@/lib/types";

/**
 * Claude からの呼び出しは、ログインした本人のアクセストークンで Supabase に問い合わせる。
 * → RLS がそのまま効くので、本人が silo で見られる／書ける範囲だけを Claude も扱える。
 * service_role キーは使わない。
 */
export type SiloContext = {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  workspaceId: string;
  role: Role;
  origin: string; // 引用リンクの基点（例 https://sales-silo.vercel.app）
};

export function userClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// 同じトークンの検証結果を短時間だけ覚えておく（毎回の往復を減らす）
const cache = new Map<string, { at: number; info: AuthInfo }>();
const TTL = 60_000;

export async function verifySiloToken(req: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL) return hit.info;

  const supabase = userClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return undefined;

  // silo のメンバーでなければ拒否（Google アカウントを持っているだけでは使えない）
  const { data: me } = await supabase
    .from("member")
    .select("workspace_id, role, email")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();
  if (!me) return undefined;

  const url = new URL(req.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? url.host}`;

  const info: AuthInfo = {
    token,
    clientId: String((data.user as { app_metadata?: { client_id?: string } }).app_metadata?.client_id ?? "claude"),
    scopes: [],
    extra: { userId: data.user.id, email: me.email ?? data.user.email ?? "", workspaceId: me.workspace_id, role: me.role, origin },
  };
  cache.set(token, { at: Date.now(), info });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return info;
}

export function contextFrom(authInfo: AuthInfo | undefined): SiloContext {
  if (!authInfo?.token || !authInfo.extra) throw new Error("silo にログインしていません。コネクタを再接続してください。");
  const e = authInfo.extra as { userId: string; email: string; workspaceId: string; role: Role; origin: string };
  return { supabase: userClient(authInfo.token), userId: e.userId, email: e.email, workspaceId: e.workspaceId, role: e.role, origin: e.origin };
}

export function requireWriter(ctx: SiloContext) {
  if (ctx.role === "viewer") throw new Error("閲覧者（viewer）の権限では silo に書き込めません。管理者に editor 権限を依頼してください。");
}
