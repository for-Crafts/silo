/**
 * Initial setup: creates one workspace, adds the given email as admin,
 * and creates the inbox insight ("🔥 あとで分類する").
 *
 * Usage:  pnpm seed
 * Needs NEXT_PUBLIC_SUPABASE_URL in .env.local.
 * SUPABASE_SERVICE_ROLE_KEY is asked interactively (never stored).
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as readline from "node:readline";

config({ path: ".env.local" });

function ask(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    if (hidden) {
      const out = process.stdout;
      process.stdout.write(question);
      // Mute echo for secret input
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rl as any)._writeToOutput = (s: string) => {
        if (s.includes("\n")) out.write("\n");
      };
    }
    rl.question(hidden ? "" : question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL が .env.local にありません");

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    (await ask("Supabase の service_role キーを貼り付けて Enter（画面には表示されません）: ", true));
  if (!serviceKey) throw new Error("service_role キーが空です");

  const email = (await ask("admin にするメールアドレス: ")).toLowerCase();
  if (!email.includes("@")) throw new Error("メールアドレスが不正です");

  const workspaceName = (await ask("ワークスペース名 [for Crafts]: ")) || "for Crafts";

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. user
  let userId: string | undefined;
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  userId = list.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    console.log("auth ユーザーを作成しました");
  } else {
    console.log("auth ユーザーは既に存在します");
  }

  // 2. workspace (reuse if the user already belongs to one)
  const { data: existing } = await admin
    .from("member")
    .select("workspace_id")
    .eq("user_id", userId)
    .maybeSingle();
  let workspaceId = existing?.workspace_id as string | undefined;
  if (!workspaceId) {
    const { data: ws, error } = await admin
      .from("workspace")
      .insert({ name: workspaceName })
      .select("id")
      .single();
    if (error) throw error;
    workspaceId = ws.id;
    const { error: mErr } = await admin
      .from("member")
      .insert({ workspace_id: workspaceId, user_id: userId, email, role: "admin" });
    if (mErr) throw mErr;
    console.log(`workspace "${workspaceName}" を作成し、${email} を admin にしました`);
  } else {
    console.log("既存の workspace を使います");
  }

  // 3. inbox insight
  const { data: inbox } = await admin
    .from("insight")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_inbox", true)
    .maybeSingle();
  if (!inbox) {
    const { error } = await admin.from("insight").insert({
      workspace_id: workspaceId,
      title: "あとで分類する",
      is_inbox: true,
      sort_order: 9999,
      created_by: userId,
    });
    if (error) throw error;
    console.log("inbox インサイトを作成しました");
  }

  console.log("完了。 http://localhost:3000/login からログインしてください。");
}

main().catch((e) => {
  console.error("seed 失敗:", e.message ?? e);
  process.exit(1);
});
