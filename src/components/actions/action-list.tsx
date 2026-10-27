"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useMemberEmail, useWorkspace } from "@/components/app/workspace-context";
import { SAVE_ERROR, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TEMPLATES, initialContent, templateOf } from "@/lib/action-templates";
import type { ActionItem, ActionTemplate } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ActionList({ actions: initial }: { actions: ActionItem[] }) {
  const router = useRouter();
  const { workspaceId, userId } = useWorkspace();
  const emailOf = useMemberEmail();
  const [actions, setActions] = useState(initial);
  useEffect(() => setActions(initial), [initial]);
  const [tab, setTab] = useState<"board" | "doc">("board");
  const [showNew, setShowNew] = useState(initial.length === 0);
  const [creating, setCreating] = useState<ActionTemplate | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const boards = useMemo(() => actions.filter((a) => a.type === "board"), [actions]);
  const docs = useMemo(() => actions.filter((a) => a.type === "doc"), [actions]);
  const rows = tab === "board" ? boards : docs;

  async function create(key: ActionTemplate) {
    const tpl = templateOf(key);
    setCreating(key);
    const id = crypto.randomUUID();
    const { error } = await createClient()
      .from("action")
      .insert({ id, workspace_id: workspaceId, type: tpl.type, template: key, title: "", content: initialContent(key), created_by: userId });
    if (error) {
      setCreating(null);
      return toast.error(SAVE_ERROR);
    }
    router.push(`/actions/${id}`);
  }

  async function update(id: string, patch: Partial<ActionItem>) {
    const before = actions.find((a) => a.id === id);
    const removed = !!patch.deleted_at;
    setActions((list) => (removed ? list.filter((a) => a.id !== id) : list.map((a) => (a.id === id ? { ...a, ...patch } : a))));
    const { error } = await createClient().from("action").update(patch).eq("id", id);
    if (error && before) {
      toast.error(SAVE_ERROR);
      setActions((list) => (removed ? [before, ...list] : list.map((a) => (a.id === id ? before : a))));
    }
  }

  return (
    <div className="h-full overflow-auto">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-10 py-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">すべてのアクション</h1>
            <p className="mt-1 text-[13px] text-zinc-500">整理したインサイトを、企画・提案に落とす場所</p>
          </div>
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-3.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <PlusIcon className="size-3.5" strokeWidth={2.5} />
            新しくつくる
          </button>
        </div>

        {showNew && (
          <div className="flex flex-col gap-3.5 rounded-[10px] border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">テンプレートを選択</span>
              <span className="text-xs text-zinc-500">作成後も付箋・枝は自由に動かせます</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  disabled={!!creating}
                  onClick={() => create(t.key)}
                  className={cn(
                    "flex flex-col gap-2.5 rounded-lg border border-zinc-200 bg-white p-3.5 text-left transition-colors hover:border-blue-500 disabled:opacity-60",
                    creating === t.key && "border-blue-500"
                  )}
                >
                  <span className="flex h-[72px] items-center justify-center whitespace-pre rounded-md border border-zinc-100 bg-zinc-50 text-[11px] leading-normal text-zinc-400">
                    {t.preview}
                  </span>
                  <span className="text-[13px] font-semibold">{t.name}</span>
                  <span className="text-xs leading-normal text-zinc-500">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-0.5 border-b border-zinc-200">
          {(
            [
              ["board", "ホワイトボード", boards.length],
              ["doc", "ドキュメント", docs.length],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium",
                tab === key ? "border-zinc-950 text-zinc-950" : "border-transparent text-zinc-500 hover:text-zinc-800"
              )}
            >
              {label}
              <span className="ml-1 text-xs text-zinc-500">{n}</span>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_140px_110px_110px_170px_36px] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-medium text-zinc-500">
            <div>タイトル</div>
            <div>テンプレート</div>
            <div>作成日</div>
            <div>更新日</div>
            <div>作成者</div>
            <div />
          </div>
          {rows.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-zinc-500">
              まだありません。「新しくつくる」からテンプレートを選びましょう
            </div>
          )}
          {rows.map((a) => {
            const tpl = templateOf(a.template);
            return (
              <div
                key={a.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[data-row-menu],input")) return;
                  if (document.querySelector("[role=menu]")) return;
                  router.push(`/actions/${a.id}`);
                }}
                onMouseEnter={() => router.prefetch(`/actions/${a.id}`)}
                className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_140px_110px_110px_170px_36px] items-center gap-4 border-b border-zinc-100 px-4 py-3 text-sm hover:bg-zinc-50"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-600">{tpl.glyph}</span>
                  {renaming === a.id ? (
                    <input
                      autoFocus
                      defaultValue={a.title}
                      onBlur={(e) => {
                        setRenaming(null);
                        if (e.target.value.trim() !== a.title) update(a.id, { title: e.target.value.trim() });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="h-7 min-w-0 flex-1 rounded border border-blue-400 px-2 outline-none"
                    />
                  ) : (
                    <>
                      <span className="truncate font-medium">{a.title || `${tpl.short}（名称未設定）`}</span>
                      {a.source === "claude" && (
                        <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-medium text-violet-700">Claude が作成</span>
                      )}
                    </>
                  )}
                </div>
                <div className="text-[13px] text-zinc-600">{tpl.short}</div>
                <div className="text-[13px] text-zinc-500">{formatDate(a.created_at)}</div>
                <div className="text-[13px] text-zinc-500">{formatDate(a.updated_at)}</div>
                <div className="truncate text-[13px] text-zinc-600">{emailOf(a.created_by) || "—"}</div>
                <div data-row-menu onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="操作"
                        className="inline-flex size-7 items-center justify-center rounded text-zinc-500 opacity-0 hover:bg-zinc-200 group-hover:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRenaming(a.id)}>名称を変更</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => update(a.id, { deleted_at: new Date().toISOString() })}>
                        削除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
