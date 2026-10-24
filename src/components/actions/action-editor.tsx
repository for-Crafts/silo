"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { JSONContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { ChevronLeftIcon } from "lucide-react";
import { useWorkspace } from "@/components/app/workspace-context";
import { createClient } from "@/lib/supabase/client";
import { usePatchQueue } from "@/lib/patch-queue";
import { resetSaveStatus } from "@/lib/save-status";
import { uploadImage } from "@/lib/media";
import { formatDateTime } from "@/lib/format";
import { templateOf, type BoardContent, type MindmapContent } from "@/lib/action-templates";
import type { ActionItem } from "@/lib/types";
import { RichEditor } from "@/components/editor/rich-editor";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { PICK_IMAGE_EVENT } from "@/components/editor/slash-command";
import { insertImageFiles, type UploadFn } from "@/components/editor/research-image";
import { Board } from "./board";
import { Mindmap } from "./mindmap";

export function ActionEditor({ action }: { action: ActionItem }) {
  const { workspaceId } = useWorkspace();
  const tpl = templateOf(action.template);
  const [title, setTitle] = useState(action.title);
  const [updatedAt, setUpdatedAt] = useState(action.updated_at);
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    resetSaveStatus();
    return () => resetSaveStatus();
  }, []);

  const { queue } = usePatchQueue<Pick<ActionItem, "title" | "content">>(async (fields) => {
    const { data, error } = await createClient().from("action").update(fields).eq("id", action.id).select("updated_at").single();
    if (error || !data) return false;
    setUpdatedAt(data.updated_at);
    return true;
  }, 800);

  const onContent = useCallback((content: unknown) => queue({ content }), [queue]);

  const upload: UploadFn = useCallback((file) => uploadImage(file, { workspaceId, researchId: action.id }), [workspaceId, action.id]);
  useEffect(() => {
    if (tpl.type !== "doc") return;
    const onPick = (e: Event) => {
      const target = (e as CustomEvent<{ editor: Editor }>).detail.editor;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,image/gif";
      input.multiple = true;
      input.onchange = () => insertImageFiles(target, Array.from(input.files ?? []), upload);
      input.click();
    };
    window.addEventListener(PICK_IMAGE_EVENT, onPick);
    return () => window.removeEventListener(PICK_IMAGE_EVENT, onPick);
  }, [tpl.type, upload]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-6 py-3">
        <Link href="/actions" className="inline-flex items-center gap-1 text-[13px] text-zinc-500 hover:text-blue-600">
          <ChevronLeftIcon className="size-3.5" />
          アクション
        </Link>
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-600">{tpl.glyph}</span>
        <input
          value={title}
          autoFocus={!title && tpl.key !== "mindmap"}
          placeholder={`${tpl.short}（名称未設定）`}
          aria-label="タイトル"
          onChange={(e) => {
            setTitle(e.target.value);
            queue({ title: e.target.value });
          }}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-[-0.01em] outline-none placeholder:text-zinc-300"
        />
        <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{tpl.short}</span>
        <span className="shrink-0 text-xs text-zinc-400">{formatDateTime(updatedAt)} 更新</span>
      </div>

      <div className="min-h-0 flex-1">
        {tpl.key === "doc" && (
          <div className="h-full overflow-auto">
            <div className="mx-auto max-w-[760px] px-6 pb-20">
              <EditorToolbar editor={editor} />
              <RichEditor
                content={(action.content as JSONContent) ?? null}
                placeholder="「/」でメニュー、「@」でインサイトを引用。画像は貼り付け・ドロップ"
                onChange={onContent}
                upload={upload}
                onReady={setEditor}
                onFocusEditor={setEditor}
                className="min-h-[60vh]"
              />
            </div>
          </div>
        )}
        {tpl.key === "mindmap" && <Mindmap value={action.content as MindmapContent} onChange={onContent} />}
        {(tpl.key === "blank" || tpl.key === "flow" || tpl.key === "persona") && (
          <Board value={(action.content as BoardContent) ?? { notes: [], frames: [] }} onChange={onContent} />
        )}
      </div>
    </div>
  );
}
