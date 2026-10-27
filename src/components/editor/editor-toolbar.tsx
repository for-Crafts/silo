"use client";

import { useEffect, useReducer } from "react";
import type { Editor } from "@tiptap/react";
import {
  Grid3x3Icon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  Redo2Icon,
  Undo2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PICK_IMAGE_EVENT } from "./slash-command";

/** Centou 準拠の固定ツールバー。最後にフォーカスされたエディタを操作する。 */
export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", rerender);
    return () => {
      editor.off("transaction", rerender);
    };
  }, [editor]);

  const run = (fn: (e: Editor) => void) => () => editor && fn(editor);
  const is = (name: string, attrs?: Record<string, unknown>) => !!editor?.isActive(name, attrs);

  const btn = (active = false) =>
    cn(
      "inline-flex h-[30px] min-w-[30px] items-center justify-center rounded px-2 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-40",
      active && "bg-zinc-100 text-zinc-950"
    );
  const sep = <span className="mx-1 h-[18px] w-px bg-zinc-200" />;

  return (
    <div
      role="toolbar"
      aria-label="書式"
      className="sticky top-0 z-10 my-3 flex h-10 w-fit items-center gap-0.5 rounded-md border bg-background px-1.5"
      onMouseDown={(e) => e.preventDefault()} // エディタのフォーカス・選択範囲を保つ
    >
      <button type="button" aria-label="太字" className={cn(btn(is("bold")), "font-bold")} onClick={run((e) => e.chain().focus().toggleBold().run())}>
        B
      </button>
      <button type="button" aria-label="斜体" className={cn(btn(is("italic")), "italic")} onClick={run((e) => e.chain().focus().toggleItalic().run())}>
        I
      </button>
      {sep}
      {([1, 2, 3] as const).map((level) => (
        <button
          key={level}
          type="button"
          className={btn(is("heading", { level }))}
          onClick={run((e) => e.chain().focus().toggleHeading({ level }).run())}
        >
          H{level}
        </button>
      ))}
      {sep}
      <button type="button" aria-label="箇条書き" className={btn(is("bulletList"))} onClick={run((e) => e.chain().focus().toggleBulletList().run())}>
        <ListIcon className="size-[15px]" />
      </button>
      <button type="button" aria-label="番号付きリスト" className={btn(is("orderedList"))} onClick={run((e) => e.chain().focus().toggleOrderedList().run())}>
        <ListOrderedIcon className="size-[15px]" />
      </button>
      {sep}
      <button
        type="button"
        aria-label="表"
        className={btn(is("table"))}
        onClick={run((e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      >
        <Grid3x3Icon className="size-[15px]" />
      </button>
      <button
        type="button"
        aria-label="画像"
        className={btn()}
        onClick={run((e) => window.dispatchEvent(new CustomEvent(PICK_IMAGE_EVENT, { detail: { editor: e } })))}
      >
        <ImageIcon className="size-[15px]" />
      </button>
      {sep}
      <button type="button" aria-label="元に戻す" className={btn()} disabled={!editor?.can().undo()} onClick={run((e) => e.chain().focus().undo().run())}>
        <Undo2Icon className="size-[15px]" />
      </button>
      <button type="button" aria-label="やり直す" className={btn()} disabled={!editor?.can().redo()} onClick={run((e) => e.chain().focus().redo().run())}>
        <Redo2Icon className="size-[15px]" />
      </button>
    </div>
  );
}
