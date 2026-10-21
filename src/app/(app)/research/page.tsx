import { createClient } from "@/lib/supabase/server";
import { ResearchList } from "@/components/research/research-list";
import type { Folder, ResearchListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const supabase = await createClient();
  const [{ data: folders }, { data: researches }, { data: facts }] = await Promise.all([
    supabase.from("folder").select("*").order("sort_order").order("created_at"),
    supabase
      .from("research_file")
      .select("id, workspace_id, folder_id, title, subject, tags, status, ext_id, created_by, updated_by, created_at, updated_at, deleted_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    supabase.from("fact").select("research_id").is("deleted_at", null),
  ]);

  const factCounts: Record<string, number> = {};
  for (const f of facts ?? []) factCounts[f.research_id] = (factCounts[f.research_id] ?? 0) + 1;

  return (
    <ResearchList
      folders={(folders ?? []) as Folder[]}
      researches={(researches ?? []) as ResearchListItem[]}
      factCounts={factCounts}
    />
  );
}
