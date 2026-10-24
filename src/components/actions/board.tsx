"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LightbulbIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTE_COLORS, type BoardContent, type BoardNote, type NoteColor } from "@/lib/action-templates";
import { InsightPicker } from "./insight-picker";

const NOTE_W = 180;
const NOTE_H = 120;

/** 付箋ボード（空白・行動フロー・ペルソナ） */
export function Board({ value, onChange }: { value: BoardContent; onChange: (v: BoardContent) => void }) {
  const [board, setBoard] = useState<BoardContent>(() => ({ notes: value?.notes ?? [], frames: value?.frames ?? [] }));
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [color, setColor] = useState<NoteColor>("yellow");
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  const commit = (next: BoardContent) => {
    setBoard(next);
    onChange(next);
  };
  const updateNote = (id: string, patch: Partial<BoardNote>, save = true) => {
    const next = { ...board, notes: board.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
    if (save) commit(next);
    else setBoard(next);
  };

  function addNote(x?: number, y?: number, extra?: Partial<BoardNote>) {
    const el = scroller.current;
    const px = x ?? (el ? el.scrollLeft + el.clientWidth / 2 - NOTE_W / 2 : 80);
    const py = y ?? (el ? el.scrollTop + el.clientHeight / 2 - NOTE_H / 2 : 80);
    const note: BoardNote = { id: crypto.randomUUID(), x: Math.max(0, px), y: Math.max(0, py), text: "", color, ...extra };
    commit({ ...board, notes: [...board.notes, note] });
    setSelected(note.id);
    if (!extra?.text) setEditing(note.id);
  }

  function removeSelected() {
    if (!selected) return;
    commit({ ...board, notes: board.notes.filter((n) => n.id !== selected) });
    setSelected(null);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || !selected) return;
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,[contenteditable=true]")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-6 py-2">
        <button
          type="button"
          onClick={() => addNote()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 text-[13px] hover:bg-zinc-50"
        >
          <PlusIcon className="size-3.5" />
          付箋
        </button>
        <InsightPicker onPick={(p) => addNote(undefined, undefined, { text: p.title, insightId: p.id, insightTitle: p.title, color: "blue" })}>
          <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 text-[13px] hover:bg-zinc-50">
            <LightbulbIcon className="size-3.5" />
            インサイトを貼る
          </button>
        </InsightPicker>
        <span className="mx-1 h-5 w-px bg-zinc-200" />
        {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`色：${c}`}
            onClick={() => {
              setColor(c);
              if (selected) updateNote(selected, { color: c });
            }}
            style={{ background: NOTE_COLORS[c].bg, borderColor: NOTE_COLORS[c].border }}
            className={cn("size-6 rounded-full border-2", color === c && "ring-2 ring-zinc-900 ring-offset-1")}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-zinc-200" />
        <button
          type="button"
          disabled={!selected}
          onClick={removeSelected}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-zinc-600 hover:bg-zinc-100 disabled:opacity-40"
        >
          <Trash2Icon className="size-3.5" />
          削除
        </button>
        <span className="ml-auto text-xs text-zinc-400">ダブルクリックで付箋を追加・編集 / ドラッグで移動 / Delete で削除</span>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-zinc-50">
        <div
          className="relative"
          style={{
            width: 2400,
            height: 1600,
            backgroundImage: "radial-gradient(#d4d4d8 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              (document.activeElement as HTMLElement | null)?.blur(); // 編集中の付箋を先に保存
              setSelected(null);
              setEditing(null);
            }
          }}
          onDoubleClick={(e) => {
            if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.frame) return;
            const r = e.currentTarget.getBoundingClientRect();
            addNote(e.clientX - r.left - NOTE_W / 2, e.clientY - r.top - 20);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const r = e.currentTarget.getBoundingClientRect();
            d.moved = true;
            updateNote(d.id, { x: Math.max(0, e.clientX - r.left - d.dx), y: Math.max(0, e.clientY - r.top - d.dy) }, false);
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (d?.moved) onChange(board); // ドロップした位置で保存
          }}
        >
          {board.frames.map((f) => (
            <div
              key={f.id}
              data-frame="1"
              className="absolute rounded-xl border border-zinc-300 bg-white/70"
              style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
            >
              <input
                value={f.title}
                aria-label="枠の見出し"
                onChange={(e) => commit({ ...board, frames: board.frames.map((x) => (x.id === f.id ? { ...x, title: e.target.value } : x)) })}
                className="w-full rounded-t-xl border-b border-zinc-200 bg-zinc-100/80 px-3 py-2 text-[13px] font-semibold text-zinc-700 outline-none focus:bg-white"
              />
            </div>
          ))}

          {board.notes.map((n) => {
            const c = NOTE_COLORS[n.color] ?? NOTE_COLORS.yellow;
            const isEditing = editing === n.id;
            return (
              <div
                key={n.id}
                className={cn(
                  "absolute flex flex-col rounded-md border p-2.5 text-[13px] leading-relaxed shadow-sm",
                  selected === n.id && "ring-2 ring-blue-500",
                  !isEditing && "cursor-grab active:cursor-grabbing"
                )}
                style={{ left: n.x, top: n.y, width: NOTE_W, minHeight: NOTE_H, background: c.bg, borderColor: c.border, touchAction: "none" }}
                onPointerDown={(e) => {
                  if (isEditing || (e.target as HTMLElement).closest("a")) return;
                  e.stopPropagation();
                  setSelected(n.id);
                  const r = e.currentTarget.getBoundingClientRect();
                  drag.current = { id: n.id, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditing(n.id);
                }}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    defaultValue={n.text}
                    placeholder="内容を入力"
                    onBlur={(e) => {
                      setEditing(null);
                      if (e.target.value !== n.text) updateNote(n.id, { text: e.target.value });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) (e.target as HTMLTextAreaElement).blur();
                    }}
                    className="min-h-[96px] w-full flex-1 resize-none bg-transparent outline-none"
                  />
                ) : (
                  <span className="whitespace-pre-wrap break-words">{n.text || <span className="text-zinc-400">ダブルクリックで入力</span>}</span>
                )}
                {n.insightId && (
                  <Link
                    href={`/insights?node=${n.insightId}`}
                    className="mt-auto inline-flex w-fit max-w-full items-center gap-1 truncate rounded bg-white/70 px-1.5 py-0.5 text-[10.5px] text-blue-700 hover:underline"
                  >
                    <LightbulbIcon className="size-3 shrink-0" />
                    {n.insightTitle || "インサイト"}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
