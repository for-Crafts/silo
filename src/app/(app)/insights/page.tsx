import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Insight } from "@/lib/types";
import { InsightWorkspace } from "@/components/insights/insight-workspace";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const supabase = await createClient();
  const [{ data: insights }, { data: facts }] = await Promise.all([
    supabase
      .from("insight")
      .select("*")
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase.from("fact").select("insight_id").is("deleted_at", null),
  ]);

  const counts: Record<string, number> = {};
  for (const f of facts ?? []) if (f.insight_id) counts[f.insight_id] = (counts[f.insight_id] ?? 0) + 1;

  return (
    <Suspense>
      <InsightWorkspace insights={(insights ?? []) as Insight[]} counts={counts} />
    </Suspense>
  );
}
