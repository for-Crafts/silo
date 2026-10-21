"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/react";
import { ArrowLeftIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useMemberEmail, useWorkspace } from "@/components/app/workspace-context";
import { beginSave, endSave, resetSaveStatus } from "@/lib/save-status";
import { SAVE_ERROR, formatDateTime } from "@/lib/format";
import type { Fact, Folder, ResearchFile, Utterance } from "@/lib/types";
import { RichEditor } from "@/components/editor/rich-editor";
import { Badge } from "@/components/ui/badge";
import { UtteranceTable } from "./utterance-table";
import { ResearchSidePanel } from "./research-side-panel";

export type FactWithInsight = Fact & { insight: { id: string; title: string; is_inbox: boolean } | null };

type Props = {
  research: ResearchFile;
  folders: Folder[];
  utterances: Utterance[];
  facts: FactWithInsight[];
  hasTranscript: boolean;
};

export function useDebouncedSave<T>(ms: number, save: (value: T) => Promise<boolean>) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  return useCallback(
    (value: T) => {
      if (timer.current) clearTimeout(timer.current);
      else beginSave(); // count one pending save per debounce window
      timer.current = setTimeout(async () => {
        timer.current = null;
        const ok = await saveRef.current(value);
        endSave(ok);
        if (!ok) toast.error(SAVE_ERROR);
      }, ms);
    },
    [ms]
  );
}

export function ResearchDetail({ research, folders, utterances, facts, hasTranscript }: Props) {
  const router = useRouter();
  const { userId } = useWorkspace();
  const emailOf = useMemberEmail();
  const [title, setTitle] = useState(research.title);
  const [meta, setMeta] = useState({ updated_at: research.updated_at, updated_by: research.updated_by });

  useEffect(() => {
    resetSaveStatus();
    return () => resetSaveStatus();
  }, []);

  const patch = useCallback(
    async (fields: Partial<ResearchFile>) => {
      const { data, error } = await createClient()
        .from("research_file")
        .update({ ...fields, updated_by: userId })
        .eq("id", research.id)
        .select("updated_at, updated_by")
        .single();
      if (error || !data) return false;
      setMeta(data);
      return true;
    },
    [research.id, userId]
  );

  const saveTitle = useDebouncedSave<string>(800, (v) => patch({ title: v }));
  const saveBackground = useDebouncedSave<JSONContent>(800, (v) => patch({ background: v }));
  const saveOverview = useDebouncedSave<JSONContent>(800, (v) => patch({ overview: v }));

  const folder = folders.find((f) => f.id === research.folder_id);

  return (
    <div className="flex h-full">
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[720px] px-6 py-8">
          <Link
            href={folder ? `/research?folder=${folder.id}` : "/research"}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            {folder ? folder.name : "すべてのリサーチ"}
          </Link>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              saveTitle(e.target.value);
            }}
            placeholder="無題のリサーチ"
            className="mt-3 w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(meta.updated_at)} 更新
            {meta.updated_by && ` · ${emailOf(meta.updated_by)}`}
          </p>

          <section className="mt-8">
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">背景</h2>
            <RichEditor
              content={(research.background as JSONContent) ?? null}
              placeholder="面談の背景・目的。「/」でメニュー"
              onChange={saveBackground}
            />
          </section>

          <section className="mt-6">
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">概要</h2>
            <RichEditor
              content={(research.overview as JSONContent) ?? null}
              placeholder="面談の概要・まとめ。「/」でメニュー"
              onChange={saveOverview}
            />
          </section>

          <section className="mt-10">
            <UtteranceTable
              researchId={research.id}
              initialUtterances={utterances}
              facts={facts}
              onFactsChanged={() => router.refresh()}
            />
          </section>

          <section className="mt-10">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">このリサーチのファクト（{facts.length}）</h2>
            {facts.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                まだファクトがありません。発話表の ✓ でファクトにできます
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {facts.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={f.insight_id ? `/insights?node=${f.insight_id}&fact=${f.id}` : `/insights?fact=${f.id}`}
                      className="flex items-start gap-3 px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      <span className="w-20 shrink-0 truncate text-muted-foreground">{f.speaker}</span>
                      <span className="min-w-0 flex-1">{f.text}</span>
                      <Badge
                        variant="secondary"
                        className={f.insight?.is_inbox ? "shrink-0 text-amber-700" : "shrink-0"}
                      >
                        {f.insight ? (f.insight.is_inbox ? "🔥 あとで分類する" : f.insight.title || "無題") : "未分類"}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <ResearchSidePanel research={research} folders={folders} hasTranscript={hasTranscript} onPatch={patch} />
    </div>
  );
}
