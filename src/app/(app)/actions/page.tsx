import { createClient } from "@/lib/supabase/server";
import type { ActionItem } from "@/lib/types";
import { ActionList } from "@/components/actions/action-list";

export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("action")
    .select("id, workspace_id, type, template, title, source, created_by, created_at, updated_at, deleted_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return <ActionList actions={(data ?? []) as ActionItem[]} />;
}
