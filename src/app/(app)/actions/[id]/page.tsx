import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionItem } from "@/lib/types";
import { ActionEditor } from "@/components/actions/action-editor";

export const dynamic = "force-dynamic";

export default async function ActionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("action").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  return <ActionEditor action={data as ActionItem} />;
}
