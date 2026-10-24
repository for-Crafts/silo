"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import { TableKit } from "@tiptap/extension-table";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { BoldIcon, CodeIcon, GripVerticalIcon, ItalicIcon, StrikethroughIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SlashCommand } from "./slash-command";
import { InsightMention } from "./mention";
import { ResearchImage, hasPendingUploads, insertImageFiles, type UploadFn } from "./research-image";

type Props = {
  content: JSONContent | null | undefined;
  placeholder?: string;
  onChange: (json: JSONContent) => void;
  /** 画像のアップロード先。未指定なら画像の貼り付けは無効 */
  upload?: UploadFn;
  /** フォーカスされたエディタを親に知らせる（共通ツールバー用） */
  onFocusEditor?: (editor: Editor) => void;
  onReady?: (editor: Editor) => void;
  className?: string;
};

export function RichEditor({
  content,
  placeholder = "「/」でメニュー、「@」でインサイト参照",
  onChange,
  upload,
  onFocusEditor,
  onReady,
  className,
}: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  const focusRef = useRef(onFocusEditor);
  focusRef.current = onFocusEditor;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      SlashCommand,
      InsightMention,
      ResearchImage.configure({ inline: false, allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: content ?? "",
    editorProps: {
      attributes: {
        class: "tiptap prose prose-zinc max-w-none min-h-8 px-0 py-0.5 text-[15px] leading-[1.75] prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:mb-1.5 prose-headings:mt-5 focus:outline-none",
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const up = uploadRef.current;
        if (!up || files.length === 0 || !editorRef.current) return false;
        return insertImageFiles(editorRef.current, files, up);
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        const up = uploadRef.current;
        if (moved || !up || files.length === 0 || !editorRef.current) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        event.preventDefault();
        return insertImageFiles(editorRef.current, files, up, at);
      },
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name === "mention" && node.attrs.href) {
          event.preventDefault();
          window.location.href = node.attrs.href;
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      // アップロード中の画像（blob: URL）を含む状態は保存しない。完了時の差し替えで改めて保存される
      if (hasPendingUploads(editor.state.doc)) return;
      onChangeRef.current(editor.getJSON());
    },
    onFocus: ({ editor }) => focusRef.current?.(editor),
    onCreate: ({ editor }) => onReady?.(editor),
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // Replace content only when a different document is loaded (not on our own edits).
  const loadedFor = useRef<unknown>(null);
  useEffect(() => {
    if (!editor || loadedFor.current === content) return;
    if (loadedFor.current === null && content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    loadedFor.current = content ?? null;
  }, [editor, content]);

  if (!editor) return <div className={cn("min-h-32", className)} />;

  const btn = (active: boolean) =>
    cn("rounded-sm p-1.5 hover:bg-accent", active && "bg-accent text-accent-foreground");

  return (
    <div className={cn("relative", className)}>
      <DragHandle editor={editor}>
        <div className="drag-handle">
          <GripVerticalIcon className="size-4" />
        </div>
      </DragHandle>
      <BubbleMenu editor={editor} options={{ placement: "top" }}>
        <div className="flex items-center gap-0.5 rounded-md border bg-popover p-0.5 shadow-md">
          <button type="button" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}>
            <BoldIcon className="size-4" />
          </button>
          <button type="button" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <ItalicIcon className="size-4" />
          </button>
          <button type="button" className={btn(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <StrikethroughIcon className="size-4" />
          </button>
          <button type="button" className={btn(editor.isActive("code"))} onClick={() => editor.chain().focus().toggleCode().run()}>
            <CodeIcon className="size-4" />
          </button>
        </div>
      </BubbleMenu>
      <EditorContent editor={editor} />
    </div>
  );
}
