"use client";

import { useEffect, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/react";
import { toast } from "sonner";
import { CheckIcon, LayoutTemplateIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { SAVE_ERROR } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OPEN_TEMPLATES_EVENT } from "./slash-command";

type Template = { id: string; name: string; content: JSONContent; sort_order: number };

/** 発話表ブロックは 1 ページに 1 つ。すでにあるページには挿入しない */
function withoutDuplicateTable(content: JSONContent, editor: Editor): JSONContent[] {
  let has = false;
  editor.state.doc.descendants((n) => {
    if (n.type.name === "utteranceTable") has = true;
    return !has;
  });
  const nodes = content.content ?? [];
  return has ? nodes.filter((n) => n.type !== "utteranceTable") : nodes;
}

/**
 * テンプレートの一覧。
 * - 押すとカーソル位置に挿入
 * - いまのページをテンプレートとして保存
 * - 名前の変更・削除
 */
export function TemplateMenu({ editor }: { editor: Editor | null }) {
  const { workspaceId, userId } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Template[] | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_TEMPLATES_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TEMPLATES_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open || items) return;
    createClient()
      .from("research_template")
      .select("id, name, content, sort_order")
      .order("sort_order")
      .order("created_at")
      .then(({ data }) => setItems((data ?? []) as Template[]));
  }, [open, items]);

  function insert(t: Template) {
    if (!editor) return;
    const nodes = withoutDuplicateTable(t.content, editor);
    if (!nodes.length) return;
    editor.chain().focus().insertContent(nodes).run();
    setOpen(false);
  }

  async function saveCurrent() {
    const name = newName.trim();
    if (!editor || !name) return;
    const row = { id: crypto.randomUUID(), workspace_id: workspaceId, name, content: editor.getJSON(), sort_order: items?.length ?? 0, created_by: userId };
    setItems((xs) => [...(xs ?? []), row]);
    setNewName("");
    const { error } = await createClient().from("research_template").insert(row);
    if (error) {
      toast.error(SAVE_ERROR);
      setItems((xs) => (xs ?? []).filter((x) => x.id !== row.id));
    } else toast.success(`「${name}」をテンプレートに保存しました`);
  }

  async function rename(t: Template, name: string) {
    setRenaming(null);
    const next = name.trim();
    if (!next || next === t.name) return;
    setItems((xs) => (xs ?? []).map((x) => (x.id === t.id ? { ...x, name: next } : x)));
    const { error } = await createClient().from("research_template").update({ name: next }).eq("id", t.id);
    if (error) {
      toast.error(SAVE_ERROR);
      setItems((xs) => (xs ?? []).map((x) => (x.id === t.id ? t : x)));
    }
  }

  async function remove(t: Template) {
    setConfirmDelete(null);
    setItems((xs) => (xs ?? []).filter((x) => x.id !== t.id));
    const { error } = await createClient().from("research_template").delete().eq("id", t.id);
    if (error) {
      toast.error(SAVE_ERROR);
      setItems((xs) => [...(xs ?? []), t].sort((a, b) => a.sort_order - b.sort_order));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="テンプレート"
          className="inline-flex h-[30px] items-center gap-1 rounded px-2 text-xs text-zinc-700 hover:bg-zinc-100"
        >
          <LayoutTemplateIcon className="size-[15px]" />
          テンプレート
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-zinc-500">カーソルの位置に挿入</div>
        {items === null && <div className="px-2 py-2 text-[13px] text-zinc-400">読み込み中…</div>}
        {items?.length === 0 && <div className="px-2 py-2 text-[13px] text-zinc-500">まだありません</div>}
        <ul>
          {items?.map((t) => (
            <li key={t.id} className="group flex items-center gap-1 rounded-md hover:bg-zinc-100">
              {renaming === t.id ? (
                <input
                  autoFocus
                  defaultValue={t.name}
                  onBlur={(e) => rename(t, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="m-1 h-7 min-w-0 flex-1 rounded border border-blue-400 px-2 text-[13px] outline-none"
                />
              ) : confirmDelete === t.id ? (
                <div className="flex flex-1 items-center justify-between px-2 py-1.5 text-[13px]">
                  <span className="truncate text-zinc-700">「{t.name}」を削除</span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setConfirmDelete(null)} className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200">
                      やめる
                    </button>
                    <button type="button" onClick={() => remove(t)} className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700">
                      削除
                    </button>
                  </span>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => insert(t)} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[13px]">
                    {t.name || "名前なし"}
                  </button>
                  <button type="button" aria-label="名前を変更" onClick={() => setRenaming(t.id)} className="hidden size-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 group-hover:inline-flex">
                    <PencilIcon className="size-3.5" />
                  </button>
                  <button type="button" aria-label="削除" onClick={() => setConfirmDelete(t.id)} className="mr-1 hidden size-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 group-hover:inline-flex">
                    <Trash2Icon className="size-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-1.5 border-t border-zinc-100 px-1 pt-2">
          <div className="px-1 pb-1 text-[11px] font-medium text-zinc-500">このページをテンプレートにする</div>
          <div className="flex gap-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) saveCurrent();
              }}
              placeholder="名前（例：商談メモ）"
              className="h-8 min-w-0 flex-1 rounded-md border border-zinc-200 px-2 text-[13px] outline-none focus:border-zinc-400"
            />
            <button
              type="button"
              aria-label="保存"
              disabled={!newName.trim()}
              onClick={saveCurrent}
              className="inline-flex size-8 items-center justify-center rounded-md bg-zinc-900 text-white disabled:opacity-30"
            >
              <CheckIcon className="size-4" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 空のページの上に出す「テンプレートから始める」。押すとページ全体がそのテンプレートになる */
export function TemplateStarter({ editor }: { editor: Editor | null }) {
  const [items, setItems] = useState<Template[] | null>(null);
  useEffect(() => {
    createClient()
      .from("research_template")
      .select("id, name, content, sort_order")
      .order("sort_order")
      .order("created_at")
      .limit(6)
      .then(({ data }) => setItems((data ?? []) as Template[]));
  }, []);
  if (!items?.length) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-500">
      <span>テンプレートから始める：</span>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => editor?.chain().focus().setContent(t.content, { emitUpdate: true }).run()}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-zinc-800 hover:border-zinc-400"
        >
          <LayoutTemplateIcon className="size-3.5 text-zinc-500" />
          {t.name || "名前なし"}
        </button>
      ))}
      <span className="text-zinc-400">または空白のまま書く</span>
    </div>
  );
}
