"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { SAVE_ERROR, formatDateTime } from "@/lib/format";
import { RESEARCH_STATUSES, type Folder, type ResearchListItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusDot } from "./status-dot";
import { ResearchSidebar } from "./research-sidebar";
import { ResearchRowMenu } from "./research-row-menu";

type Props = {
  folders: Folder[];
  researches: ResearchListItem[];
  factCounts: Record<string, number>;
};

export function ResearchList({ folders, researches, factCounts }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const folderParam = params.get("folder"); // null = all, "none" = 未分類
  const { workspaceId, userId } = useWorkspace();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [tag, setTag] = useState<string>("all");
  const [creating, setCreating] = useState(false);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    researches.forEach((r) => r.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [researches]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return researches.filter((r) => {
      if (folderParam === "none" && r.folder_id !== null) return false;
      if (folderParam && folderParam !== "none" && r.folder_id !== folderParam) return false;
      if (status !== "all" && r.status !== status) return false;
      if (tag !== "all" && !r.tags.includes(tag)) return false;
      if (needle && !`${r.title} ${r.subject}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [researches, folderParam, status, tag, q]);

  const currentFolder = folders.find((f) => f.id === folderParam);
  const heading = folderParam === "none" ? "未分類" : currentFolder ? currentFolder.name : "すべてのリサーチ";

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  async function createResearch() {
    setCreating(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("research_file")
      .insert({
        workspace_id: workspaceId,
        folder_id: currentFolder?.id ?? null,
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(SAVE_ERROR);
      return;
    }
    router.push(`/research/${data.id}`);
  }

  return (
    <div className="flex h-full">
      <ResearchSidebar folders={folders} researches={researches} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-6 pt-6">
          <h1 className="text-xl font-semibold">{heading}</h1>
          <Button className="bg-zinc-950" onClick={createResearch} disabled={creating}>
            <PlusIcon data-icon="inline-start" />
            新しくつくる
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-6 py-4">
          <Input
            placeholder="タイトル・対象者で検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-56"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="ステータス" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのステータス</SelectItem>
              {RESEARCH_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="タグ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのタグ</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto shrink-0 text-sm text-muted-foreground">{rows.length} 件</span>
        </div>

        <div className="grid grid-cols-[minmax(200px,1fr)_40px] md:grid-cols-[minmax(200px,1fr)_160px_40px] lg:grid-cols-[minmax(240px,1fr)_180px_170px_150px_40px] border-y bg-zinc-50 px-6 py-2 text-xs font-medium text-muted-foreground">
          <div>タイトル</div>
          <div className="hidden lg:block">対象者</div>
          <div className="hidden md:block">ステータス</div>
          <div className="hidden lg:block">更新日時</div>
          <div />
        </div>

        {researches.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-12 text-center text-sm text-muted-foreground">
            まだリサーチがありません。『新しくつくる』で面談を記録しましょう
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-12 text-sm text-muted-foreground">
            条件に合うリサーチがありません
          </div>
        ) : (
          <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((v) => {
                const r = rows[v.index];
                return (
                  <div
                    key={r.id}
                    data-index={v.index}
                    ref={virtualizer.measureElement}
                    className="group absolute left-0 top-0 grid w-full cursor-pointer grid-cols-[minmax(200px,1fr)_40px] md:grid-cols-[minmax(200px,1fr)_160px_40px] lg:grid-cols-[minmax(240px,1fr)_180px_170px_150px_40px] items-center border-b px-6 text-sm hover:bg-zinc-50"
                    style={{ transform: `translateY(${v.start}px)`, height: 48 }}
                    onClick={(e) => {
                      const t = e.target as HTMLElement;
                      // Ignore clicks from the row menu, and clicks that bubble from portaled menus/dialogs.
                      if (t.closest("[data-row-menu]") || !e.currentTarget.contains(t)) return;
                      if (document.querySelector("[role=menu],[role=dialog],[role=alertdialog]")) return;
                      router.push(`/research/${r.id}`);
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusDot status={r.status} />
                      <span className="truncate font-medium">{r.title || "無題"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{factCounts[r.id] ?? 0} ファクト</span>
                    </div>
                    <div className="hidden truncate text-muted-foreground lg:block">{r.subject}</div>
                    <div className="hidden md:block">
                      <Badge variant="secondary">{r.status}</Badge>
                    </div>
                    <div className="hidden text-muted-foreground lg:block">{formatDateTime(r.updated_at)}</div>
                    <div data-row-menu className="flex h-full items-center" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                      <ResearchRowMenu research={r} folders={folders} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
