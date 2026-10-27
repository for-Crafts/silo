import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RESEARCH_COLUMNS, type FactWithInsight, type Folder, type ResearchFile, type Utterance } from "@/lib/types";
import { ResearchDetail } from "@/components/research/research-detail";

export const dynamic = "force-dynamic";

export default async function ResearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: research }, { data: folders }, { data: utterances }, { data: facts }, { data: hasTranscript }] =
    await Promise.all([
      supabase.from("research_file").select(RESEARCH_COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle(),
      supabase.from("folder").select("*").order("sort_order").order("created_at"),
      supabase.from("utterance").select("*").eq("research_id", id).order("sort_order").order("created_at"),
      supabase
        .from("fact")
        .select("*, insight:insight_id(id, title, is_inbox)")
        .eq("research_id", id)
        .is("deleted_at", null)
        .neq("status", "rejected")
        .order("created_at", { ascending: false }),
      supabase.rpc("has_transcript", { p_research_id: id }),
    ]);

  if (!research) notFound();

  return (
    <ResearchDetail
      research={research as unknown as ResearchFile}
      folders={(folders ?? []) as Folder[]}
      utterances={(utterances ?? []) as Utterance[]}
      facts={(facts ?? []) as unknown as FactWithInsight[]}
      hasTranscript={!!hasTranscript}
    />
  );
}
