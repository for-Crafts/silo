import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app/app-header";
import { WorkspaceProvider } from "@/components/app/workspace-context";
import type { Member } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const user = claims?.claims ? { id: claims.claims.sub, email: claims.claims.email as string | undefined } : null;
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("member")
    .select("workspace_id, user_id, email, role, workspace(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!me) redirect("/not-invited");

  const [{ data: members }, { data: inbox }] = await Promise.all([
    supabase.from("member").select("workspace_id, user_id, email, role").eq("workspace_id", me.workspace_id),
    supabase
      .from("insight")
      .select("id")
      .eq("workspace_id", me.workspace_id)
      .eq("is_inbox", true)
      .maybeSingle(),
  ]);

  const ws = me.workspace as unknown as { name: string } | { name: string }[] | null;
  const workspaceName = Array.isArray(ws) ? ws[0]?.name : ws?.name;

  return (
    <WorkspaceProvider
      value={{
        workspaceId: me.workspace_id,
        workspaceName: workspaceName ?? "silo",
        userId: user.id,
        email: user.email ?? me.email,
        role: me.role as Member["role"],
        members: (members ?? []) as Member[],
        inboxInsightId: inbox?.id ?? null,
      }}
    >
      <div className="flex h-screen flex-col">
        <AppHeader />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </WorkspaceProvider>
  );
}
