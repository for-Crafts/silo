"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Details = {
  authorization_id: string;
  client: { name: string; uri: string };
  user: { email: string };
  scope: string;
};

/**
 * Claude などの外部アプリが silo に接続するときの同意画面。
 * Supabase の OAuth 2.1 サーバーがここへ authorization_id 付きで送ってくる。
 * 許可すると、ログインしている本人の権限で silo を読み書きできるトークンが発行される。
 */
export function ConsentForm() {
  const params = useSearchParams();
  const authorizationId = params.get("authorization_id");
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    if (!authorizationId) {
      setError("接続リクエストが見つかりません。Claude の画面からやり直してください。");
      return;
    }
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (error || !data) {
        setError("接続リクエストの有効期限が切れたか、無効です。Claude の画面からやり直してください。");
        return;
      }
      if (!("authorization_id" in data)) {
        window.location.href = data.redirect_url; // すでに許可済み
        return;
      }
      setDetails(data as unknown as Details);
      const { data: me } = await supabase.from("member").select("role").limit(1).maybeSingle();
      setIsMember(!!me);
    })();
  }, [authorizationId]);

  async function decide(approve: boolean) {
    if (!authorizationId) return;
    setBusy(true);
    const auth = createClient().auth.oauth;
    const { data, error } = approve
      ? await auth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await auth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error || !data) {
      setBusy(false);
      setError("処理できませんでした。もう一度お試しください。");
      return;
    }
    window.location.href = data.redirect_url;
  }

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-7">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-[9px] bg-zinc-950">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <path d="M4 7h16M4 12h10M4 17h7" />
          </svg>
        </span>
        <div>
          <h1 className="text-[17px] font-semibold">{details ? `${details.client.name} が silo への接続を求めています` : "silo への接続"}</h1>
          {details && <p className="text-[13px] text-zinc-500">{details.user.email} としてログイン中</p>}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && !details && <p className="text-sm text-zinc-500">読み込み中…</p>}

      {details && (
        <>
          <div className="rounded-lg bg-zinc-50 p-4 text-[13px] leading-relaxed text-zinc-700">
            <p className="mb-2 font-medium text-zinc-900">許可すると、{details.client.name} はあなたの権限で次のことができます</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>リサーチ・ファクト・インサイト・ドキュメントを読む（議事録全文を含む）</li>
              <li>ファクトとインサイトを「AI 提案」として登録する（採用するまで正式データになりません）</li>
              <li>ドキュメントを作成・更新する</li>
            </ul>
            <p className="mt-3 text-xs text-zinc-500">閲覧者（viewer）の場合は読むことだけができます。接続はいつでも Claude 側で解除できます。</p>
          </div>
          {isMember === false && (
            <p className="rounded-md bg-amber-50 p-3 text-[13px] text-amber-800">
              このアカウントは silo のメンバーではないため、接続しても使えません。管理者に招待を依頼してください。
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(false)}
              className="h-9 rounded-md border border-zinc-200 px-4 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              拒否
            </button>
            <button
              type="button"
              disabled={busy || isMember === false}
              onClick={() => decide(true)}
              className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              許可して接続
            </button>
          </div>
        </>
      )}
    </div>
  );
}
