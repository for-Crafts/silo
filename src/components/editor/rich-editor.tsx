"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
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

type Props = {
  content: JSONContent | null | undefined;
  placeholder?: string;
  onChange: (json: JSONContent) => void;
  className?: string;
};

export function RichEditor({ content, placeholder = "「/」でメニュー、「@」でインサイト参照", onChange, className }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
    ],
    content: content ?? "",
    editorProps: {
      attributes: {
        class: "tiptap prose prose-zinc max-w-none min-h-32 px-1 py-2 text-sm leading-relaxed focus:outline-none",
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
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
  });

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
