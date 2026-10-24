"use client";

import { useEffect, useRef } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TreeHandlers = {
  selectedId: string | null;
  editingId: string | null;
  collapsed: Set<string>;
  counts: Record<string, number>;
  childrenOf: (id: string | null) => Insight[];
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onToggle: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCommitEdit: (id: string, title: string, how: "enter" | "tab" | "shift-tab" | "blur" | "escape") => void;
  onAddChild: (id: string) => void;
  onDelete: (node: Insight) => void;
  /** 検索中は該当ノードとその祖先だけを表示 */
  visible: ((id: string) => boolean) | null;
};

export function TreeNode({ node, depth, h }: { node: Insight; depth: number; h: TreeHandlers }) {
  const kids = h.childrenOf(node.id);
  const open = !h.collapsed.has(node.id) || !!h.visible;
  if (h.visible && !h.visible(node.id)) return null;
  return (
    <li>
      <NodeRow node={node} depth={depth} hasKids={kids.length > 0} open={open} h={h} />
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <TreeNode key={k.id} node={k} depth={depth + 1} h={h} />
          ))}
        </ul>
      )}
    </li>
  );
}

function NodeRow({
  node,
  depth,
  hasKids,
  open,
  h,
}: {
  node: Insight;
  depth: number;
  hasKids: boolean;
  open: boolean;
  h: TreeHandlers;
}) {
  const { setNodeRef: setDrop, isOver } = useDroppable({ id: `drop:${node.id}`, data: { insightId: node.id } });
  const drag = useDraggable({ id: `node:${node.id}`, data: { kind: "node", insightId: node.id }, disabled: node.is_inbox });
  const selected = h.selectedId === node.id;
  const editing = h.editingId === node.id;
  const label = node.is_inbox ? "🔥 あとで分類する" : node.title || "無題のテーマ";

  return (
    <div
      ref={(el) => {
        setDrop(el);
        drag.setNodeRef(el);
      }}
      {...(editing ? {} : drag.listeners)}
      {...drag.attributes}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasKids ? open : undefined}
      onClick={() => !editing && h.onSelect(node.id)}
      onDoubleClick={() => !node.is_inbox && h.onStartEdit(node.id)}
      onMouseEnter={() => h.onHover(node.id)}
      style={{ paddingLeft: 8 + depth * 16 }}
      className={cn(
        "group flex h-8 cursor-pointer items-center gap-1 rounded-md pr-1 text-[13px] outline-none",
        selected ? "bg-zinc-200/70 font-medium" : "hover:bg-zinc-100",
        node.is_inbox && "text-amber-800",
        isOver && "bg-blue-50 ring-2 ring-blue-300",
        drag.isDragging && "opacity-40"
      )}
    >
      <button
        type="button"
        aria-label={open ? "閉じる" : "開く"}
        onClick={(e) => {
          e.stopPropagation();
          h.onToggle(node.id);
        }}
        className={cn("inline-flex size-4 shrink-0 items-center justify-center text-zinc-400", !hasKids && "invisible")}
      >
        <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
      </button>
      {editing ? (
        <EditInput initial={node.title} onDone={(v, how) => h.onCommitEdit(node.id, v, how)} />
      ) : (
        <span className="min-w-0 flex-1 truncate">{label}</span>
      )}
      {!editing && (
        <>
          <span className="shrink-0 text-[11px] tabular-nums text-zinc-400 group-hover:hidden">{h.counts[node.id] ?? 0}</span>
          {!node.is_inbox && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="テーマの操作"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="hidden size-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 group-hover:inline-flex data-[state=open]:inline-flex"
                >
                  <MoreHorizontalIcon className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={() => h.onAddChild(node.id)}>子テーマを追加</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => h.onStartEdit(node.id)}>名称を変更</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => h.onDelete(node)}>
                  削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}
    </div>
  );
}

function EditInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (v: string, how: "enter" | "tab" | "shift-tab" | "blur" | "escape") => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (how: "enter" | "tab" | "shift-tab" | "blur" | "escape") => {
    if (done.current) return;
    done.current = true;
    onDone(ref.current?.value ?? "", how);
  };
  return (
    <input
      ref={ref}
      defaultValue={initial}
      placeholder="テーマ名（Enter で次、Tab で子に）"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => finish("blur")}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          finish("enter");
        } else if (e.key === "Tab") {
          e.preventDefault();
          finish(e.shiftKey ? "shift-tab" : "tab");
        } else if (e.key === "Escape") {
          finish("escape");
        }
      }}
      className="h-6 min-w-0 flex-1 rounded border border-blue-400 bg-white px-1.5 text-[13px] outline-none"
    />
  );
}

/** ここに落とすとトップレベルに移動 */
export function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: "drop:root", data: { insightId: null } });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mt-1 rounded-md border border-dashed px-2 py-1.5 text-center text-[11px] text-zinc-400",
        isOver ? "border-blue-400 bg-blue-50 text-blue-700" : "border-transparent"
      )}
    >
      ここに落とすとトップレベルへ
    </div>
  );
}
