"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LightbulbIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MindNode, MindmapContent } from "@/lib/action-templates";
import { InsightPicker } from "./insight-picker";

const COL = 270; // 階層ごとの横幅
const NODE_W = 220;
const GAP = 18; // 葉と葉の間
const PAD = 40;
const LINE = 20;

/** 文字数からノードの高さを見積もる（全角 ≒ 13px、半角 ≒ 7px） */
function nodeHeight(n: MindNode, isRoot: boolean) {
  const inner = NODE_W - 24;
  let w = 0;
  for (const ch of n.text || " ") w += ch.charCodeAt(0) > 0xff ? (isRoot ? 14 : 13) : 7.5;
  const lines = Math.max(1, Math.ceil(w / inner));
  return lines * LINE + 20 + (n.insightId ? 16 : 0);
}

type Placed = { node: MindNode; depth: number; cx: number; cy: number; h: number; parentId: string | null };

function layout(root: MindNode) {
  const out: Placed[] = [];
  let cursor = PAD;
  const walk = (n: MindNode, depth: number, parentId: string | null): number => {
    const h = nodeHeight(n, depth === 0);
    let cy: number;
    if (n.children.length === 0) {
      cy = cursor + h / 2;
      cursor += h + GAP;
    } else {
      const start = cursor;
      const ys = n.children.map((c) => walk(c, depth + 1, n.id));
      cy = (ys[0] + ys[ys.length - 1]) / 2;
      // 親が子の束より背が高いときは、はみ出さないよう下へ詰める
      if (cy - h / 2 < start) cy = start + h / 2;
      cursor = Math.max(cursor, cy + h / 2 + GAP);
    }
    out.push({ node: n, depth, cx: PAD + depth * COL, cy, h, parentId });
    return cy;
  };
  walk(root, 0, null);
  const maxDepth = Math.max(...out.map((p) => p.depth));
  return { placed: out, width: PAD * 2 + maxDepth * COL + NODE_W + 80, height: cursor + PAD };
}

/** 木を複製して、id のノードとその親を返す */
function findWithParent(root: MindNode, id: string): { node: MindNode; parent: MindNode | null } | null {
  if (root.id === id) return { node: root, parent: null };
  const stack: MindNode[] = [root];
  while (stack.length) {
    const p = stack.pop()!;
    for (const c of p.children) {
      if (c.id === id) return { node: c, parent: p };
      stack.push(c);
    }
  }
  return null;
}

const newNode = (): MindNode => ({ id: crypto.randomUUID(), text: "", children: [] });

/** マインドマップ（ロジックツリー）。左に中心の問い、右へ枝分かれ */
export function Mindmap({ value, onChange }: { value: MindmapContent; onChange: (v: MindmapContent) => void }) {
  const [root, setRoot] = useState<MindNode>(() => value?.root ?? newNode());
  const [focusId, setFocusId] = useState<string | null>(value?.root?.text ? null : (value?.root?.id ?? null));
  const { placed, width, height } = useMemo(() => layout(root), [root]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);

  /** 複製した木を書き換えて保存 */
  const mutate = (fn: (draft: MindNode) => void) => {
    const draft = structuredClone(root);
    fn(draft);
    setRoot(draft);
    onChange({ root: draft });
  };

  const addChild = (id: string) => {
    const n = newNode();
    mutate((d) => findWithParent(d, id)?.node.children.push(n));
    setFocusId(n.id);
  };
  const addSibling = (id: string) => {
    const n = newNode();
    mutate((d) => {
      const hit = findWithParent(d, id);
      if (!hit?.parent) return void hit?.node.children.push(n);
      const i = hit.parent.children.findIndex((c) => c.id === id);
      hit.parent.children.splice(i + 1, 0, n);
    });
    setFocusId(n.id);
  };
  const outdent = (id: string) => {
    mutate((d) => {
      const hit = findWithParent(d, id);
      if (!hit?.parent) return;
      const grand = findWithParent(d, hit.parent.id)?.parent;
      if (!grand) return;
      hit.parent.children = hit.parent.children.filter((c) => c.id !== id);
      const i = grand.children.findIndex((c) => c.id === hit.parent!.id);
      grand.children.splice(i + 1, 0, hit.node);
    });
    setFocusId(id);
  };
  const indent = (id: string) => {
    mutate((d) => {
      const hit = findWithParent(d, id);
      if (!hit?.parent) return;
      const i = hit.parent.children.findIndex((c) => c.id === id);
      const prev = hit.parent.children[i - 1];
      if (!prev) return;
      hit.parent.children.splice(i, 1);
      prev.children.push(hit.node);
    });
    setFocusId(id);
  };
  const remove = (id: string) => {
    let next: string | null = null;
    mutate((d) => {
      const hit = findWithParent(d, id);
      if (!hit?.parent) return;
      const i = hit.parent.children.findIndex((c) => c.id === id);
      next = hit.parent.children[i - 1]?.id ?? hit.parent.id;
      hit.parent.children.splice(i, 1);
    });
    setFocusId(next);
  };
  const setText = (id: string, text: string) => mutate((d) => {
    const hit = findWithParent(d, id);
    if (hit) hit.node.text = text;
  });
  const linkInsight = (id: string, insight: { id: string; title: string } | null) =>
    mutate((d) => {
      const hit = findWithParent(d, id);
      if (!hit) return;
      hit.node.insightId = insight?.id ?? null;
      hit.node.insightTitle = insight?.title ?? null;
      if (insight && !hit.node.text) hit.node.text = insight.title;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-6 py-2 text-xs text-zinc-500">
        <span>
          <kbd className="rounded border bg-zinc-50 px-1">Enter</kbd> 兄弟を追加 ·<kbd className="ml-1 rounded border bg-zinc-50 px-1">Tab</kbd> 子に ·
          <kbd className="ml-1 rounded border bg-zinc-50 px-1">Shift+Tab</kbd> 親の階層へ ·<kbd className="ml-1 rounded border bg-zinc-50 px-1">⌫</kbd> 空の枝を削除
        </span>
        <span className="ml-auto">枝の 💡 から、インサイトを葉に紐づけられます</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-zinc-50">
        <div className="relative" style={{ width: Math.max(width, 800), height: Math.max(height, 400) }}>
          <svg className="pointer-events-none absolute inset-0" width={Math.max(width, 800)} height={Math.max(height, 400)} aria-hidden="true">
            {placed
              .filter((p) => p.parentId)
              .map((p) => {
                const parent = byId.get(p.parentId!)!;
                const x1 = parent.cx + NODE_W;
                const y1 = parent.cy;
                const x2 = p.cx;
                const y2 = p.cy;
                const mx = (x1 + x2) / 2;
                return <path key={p.node.id} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="#a1a1aa" strokeWidth={1.5} />;
              })}
          </svg>
          {placed.map((p) => (
            <MindNodeBox
              key={p.node.id}
              p={p}
              focus={focusId === p.node.id}
              onFocused={() => setFocusId(null)}
              onText={(t) => setText(p.node.id, t)}
              onEnter={() => (p.parentId ? addSibling(p.node.id) : addChild(p.node.id))}
              onTab={() => (p.parentId ? indent(p.node.id) : addChild(p.node.id))}
              onShiftTab={() => outdent(p.node.id)}
              onAddChild={() => addChild(p.node.id)}
              onRemove={() => remove(p.node.id)}
              onLink={(i) => linkInsight(p.node.id, i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MindNodeBox({
  p,
  focus,
  onFocused,
  onText,
  onEnter,
  onTab,
  onShiftTab,
  onAddChild,
  onRemove,
  onLink,
}: {
  p: Placed;
  focus: boolean;
  onFocused: () => void;
  onText: (t: string) => void;
  onEnter: () => void;
  onTab: () => void;
  onShiftTab: () => void;
  onAddChild: () => void;
  onRemove: () => void;
  onLink: (i: { id: string; title: string } | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const isRoot = !p.parentId;
  useEffect(() => {
    if (focus) {
      ref.current?.focus();
      onFocused();
    }
  }, [focus, onFocused]);
  return (
    <div
      className={cn(
        "group absolute flex flex-col rounded-lg border bg-white px-3 shadow-xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100",
        isRoot ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"
      )}
      style={{ left: p.cx, top: p.cy - p.h / 2, width: NODE_W, height: p.h }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={p.node.text}
        placeholder={isRoot ? "中心の問い（例：なぜ〜なのか）" : "枝を入力"}
        aria-label={isRoot ? "中心の問い" : "枝"}
        onChange={(e) => onText(e.target.value.replace(/\n/g, ""))}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "Tab") {
            e.preventDefault();
            if (e.shiftKey) onShiftTab();
            else onTab();
          } else if (e.key === "Backspace" && !p.node.text && !isRoot && p.node.children.length === 0) {
            e.preventDefault();
            onRemove();
          }
        }}
        className={cn(
          "w-full flex-1 resize-none overflow-hidden bg-transparent py-2.5 text-[13px] leading-5 outline-none",
          isRoot ? "font-semibold text-white placeholder:text-zinc-400" : "text-zinc-900 placeholder:text-zinc-400"
        )}
      />
      {p.node.insightId && (
        <span className="-mt-2 mb-1.5 inline-flex max-w-full items-center gap-1 text-[10.5px] leading-4 text-blue-700">
          <LightbulbIcon className="size-3 shrink-0" />
          <Link href={`/insights?node=${p.node.insightId}`} className="truncate hover:underline">
            {p.node.insightTitle || "インサイト"}
          </Link>
          <button type="button" aria-label="紐づけを外す" onClick={() => onLink(null)} className="text-zinc-400 hover:text-zinc-700">
            <XIcon className="size-3" />
          </button>
        </span>
      )}
      <div className="absolute -right-[76px] top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-focus-within:flex group-hover:flex">
        <button type="button" aria-label="子の枝を追加" onClick={onAddChild} className="inline-flex size-6 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50">
          <PlusIcon className="size-3.5" />
        </button>
        <InsightPicker onPick={(i) => onLink(i)}>
          <button type="button" aria-label="インサイトを紐づけ" className="inline-flex size-6 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50">
            <LightbulbIcon className="size-3.5" />
          </button>
        </InsightPicker>
        {!isRoot && (
          <button type="button" aria-label="枝を削除" onClick={onRemove} className="inline-flex size-6 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50">
            <Trash2Icon className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
