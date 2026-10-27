"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CopyIcon,
  FrameIcon,
  LightbulbIcon,
  MinusIcon,
  MousePointer2Icon,
  PlusIcon,
  Redo2Icon,
  StickyNoteIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NOTE_COLORS,
  type BoardContent,
  type BoardEdge,
  type BoardFrame,
  type BoardNote,
  type NoteColor,
} from "@/lib/action-templates";
import { InsightPicker } from "./insight-picker";

const NOTE_W = 180;
const NOTE_H = 120;
const TEXT_SIZES = { s: 13, m: 18, l: 28 } as const;
type Tool = "select" | "note" | "text" | "frame" | "arrow";

type Box = { id: string; x: number; y: number; w: number; h: number };
const noteBox = (n: BoardNote): Box => ({
  id: n.id,
  x: n.x,
  y: n.y,
  w: n.w ?? (n.kind === "text" ? 240 : NOTE_W),
  h: n.h ?? (n.kind === "text" ? 48 : NOTE_H),
});

/**
 * ホワイトボード（空白・行動フロー・ペルソナ）。
 * 付箋・テキスト・枠・矢印を自由に置け、移動・サイズ変更・複数選択・複製・元に戻すができる。
 * テンプレートの枠もふつうの要素なので、動かす・広げる・消す・増やすが自由。
 */
export function Board({ value, onChange }: { value: BoardContent; onChange: (v: BoardContent) => void }) {
  const [board, setBoard] = useState<BoardContent>(() => ({
    notes: value?.notes ?? [],
    frames: value?.frames ?? [],
    edges: value?.edges ?? [],
  }));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [arrowFrom, setArrowFrom] = useState<string | null>(null);
  const [color, setColor] = useState<NoteColor>("yellow");
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const past = useRef<BoardContent[]>([]);
  const future = useRef<BoardContent[]>([]);
  const gesture = useRef<
    | { type: "move"; start: { x: number; y: number }; origin: Map<string, { x: number; y: number }>; moved: boolean }
    | { type: "resize"; id: string; start: { x: number; y: number }; w: number; h: number }
    | null
  >(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  // ---- 保存と履歴 ----
  const commit = useCallback(
    (next: BoardContent, base: BoardContent = boardRef.current) => {
      past.current.push(base);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      setBoard(next);
      onChange(next);
    },
    [onChange]
  );
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(boardRef.current);
    setBoard(prev);
    onChange(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(boardRef.current);
    setBoard(next);
    onChange(next);
  };

  const edges = board.edges ?? [];
  const boxes = useMemo(() => {
    const m = new Map<string, Box>();
    board.frames.forEach((f) => m.set(f.id, f));
    board.notes.forEach((n) => m.set(n.id, noteBox(n)));
    return m;
  }, [board]);

  // キャンバスはコンテンツに合わせて広がる
  const size = useMemo(() => {
    let w = 2400;
    let h = 1600;
    boxes.forEach((b) => {
      w = Math.max(w, b.x + b.w + 600);
      h = Math.max(h, b.y + b.h + 600);
    });
    return { w, h };
  }, [boxes]);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };
  /** 画面の中央。既存の付箋と重なるときは右下へずらして空いている場所を探す */
  const viewCenter = () => {
    const el = scroller.current;
    const c = el
      ? { x: (el.scrollLeft + el.clientWidth / 2) / zoom, y: (el.scrollTop + el.clientHeight / 2) / zoom }
      : { x: 300, y: 300 };
    const hits = (x: number, y: number) =>
      board.notes.some((n) => {
        const b = noteBox(n);
        return x - NOTE_W / 2 < b.x + b.w && x + NOTE_W / 2 > b.x && y - NOTE_H / 2 < b.y + b.h && y + NOTE_H / 2 > b.y;
      });
    for (let i = 0; i < 30 && hits(c.x, c.y); i++) {
      c.x += 40;
      c.y += 30;
    }
    return c;
  };

  // ---- 追加 ----
  function addNote(at: { x: number; y: number }, extra?: Partial<BoardNote>) {
    const kind = extra?.kind ?? "note";
    const w = kind === "text" ? 240 : NOTE_W;
    const h = kind === "text" ? 48 : NOTE_H;
    const note: BoardNote = {
      id: crypto.randomUUID(),
      x: Math.max(0, Math.round(at.x - w / 2)),
      y: Math.max(0, Math.round(at.y - h / 2)),
      text: "",
      color,
      ...extra,
    };
    commit({ ...board, notes: [...board.notes, note] });
    setSelected(new Set([note.id]));
    if (!extra?.text) setEditing(note.id);
  }
  function addFrame(at: { x: number; y: number }) {
    const frame: BoardFrame = { id: crypto.randomUUID(), x: Math.max(0, Math.round(at.x - 200)), y: Math.max(0, Math.round(at.y - 150)), w: 400, h: 300, title: "新しい枠", color: "gray" };
    commit({ ...board, frames: [...board.frames, frame] });
    setSelected(new Set([frame.id]));
    setEditing(frame.id);
  }
  function addEdge(from: string, to: string) {
    if (from === to || edges.some((e) => e.from === from && e.to === to)) return;
    const edge: BoardEdge = { id: crypto.randomUUID(), from, to };
    commit({ ...board, edges: [...edges, edge] });
  }

  // ---- 選択中の要素への操作 ----
  function removeSelected() {
    if (selected.size === 0) return;
    commit({
      notes: board.notes.filter((n) => !selected.has(n.id)),
      frames: board.frames.filter((f) => !selected.has(f.id)),
      edges: edges.filter((e) => !selected.has(e.id) && !selected.has(e.from) && !selected.has(e.to)),
    });
    setSelected(new Set());
  }
  function duplicateSelected() {
    const ids = new Map<string, string>();
    const notes = board.notes.filter((n) => selected.has(n.id)).map((n) => {
      const id = crypto.randomUUID();
      ids.set(n.id, id);
      return { ...n, id, x: n.x + 24, y: n.y + 24 };
    });
    const frames = board.frames.filter((f) => selected.has(f.id)).map((f) => {
      const id = crypto.randomUUID();
      ids.set(f.id, id);
      return { ...f, id, x: f.x + 24, y: f.y + 24 };
    });
    if (!notes.length && !frames.length) return;
    commit({ ...board, notes: [...board.notes, ...notes], frames: [...board.frames, ...frames] });
    setSelected(new Set(ids.values()));
  }
  function applyColor(c: NoteColor) {
    setColor(c);
    if (selected.size === 0) return;
    commit({
      ...board,
      notes: board.notes.map((n) => (selected.has(n.id) ? { ...n, color: c } : n)),
      frames: board.frames.map((f) => (selected.has(f.id) ? { ...f, color: c } : f)),
    });
  }
  function applyTextSize(s: "s" | "m" | "l") {
    commit({ ...board, notes: board.notes.map((n) => (selected.has(n.id) ? { ...n, size: s } : n)) });
  }
  const setNoteText = (id: string, text: string) => commit({ ...board, notes: board.notes.map((n) => (n.id === id ? { ...n, text } : n)) });
  const setFrameTitle = (id: string, title: string) =>
    commit({ ...board, frames: board.frames.map((f) => (f.id === id ? { ...f, title } : f)) });

  // ---- キーボード ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (editing || t.closest("input,textarea,[contenteditable=true]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set([...board.notes.map((n) => n.id), ...board.frames.map((f) => f.id)]));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        setSelected(new Set());
        setTool("select");
        setArrowFrom(null);
      } else if (!mod && e.key.length === 1) {
        const map: Record<string, Tool> = { v: "select", n: "note", t: "text", f: "frame", a: "arrow" };
        if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- ポインタ操作（移動・サイズ変更） ----
  function startMove(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (tool === "arrow") {
      if (!arrowFrom) setArrowFrom(id);
      else {
        addEdge(arrowFrom, id);
        setArrowFrom(null);
      }
      return;
    }
    let sel = selected;
    if (e.shiftKey) {
      sel = new Set(selected);
      if (sel.has(id)) sel.delete(id);
      else sel.add(id);
    } else if (!selected.has(id)) sel = new Set([id]);
    setSelected(sel);
    const origin = new Map<string, { x: number; y: number }>();
    sel.forEach((sid) => {
      const b = boxes.get(sid);
      if (b) origin.set(sid, { x: b.x, y: b.y });
    });
    // 枠を動かすときは、枠の中にある付箋も一緒に動かす
    board.frames
      .filter((f) => sel.has(f.id))
      .forEach((f) =>
        board.notes.forEach((n) => {
          if (n.x >= f.x && n.y >= f.y && n.x + noteBox(n).w <= f.x + f.w && n.y + noteBox(n).h <= f.y + f.h) origin.set(n.id, { x: n.x, y: n.y });
        })
      );
    gesture.current = { type: "move", start: toCanvas(e), origin, moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function startResize(e: React.PointerEvent, b: Box) {
    e.stopPropagation();
    gesture.current = { type: "resize", id: b.id, start: toCanvas(e), w: b.w, h: b.h };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  const base = useRef<BoardContent | null>(null);
  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const p = toCanvas(e);
    const dx = p.x - g.start.x;
    const dy = p.y - g.start.y;
    if (!base.current) base.current = boardRef.current;
    if (g.type === "move") {
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      g.moved = true;
      const pos = (id: string) => {
        const o = g.origin.get(id)!;
        return { x: Math.max(0, Math.round(o.x + dx)), y: Math.max(0, Math.round(o.y + dy)) };
      };
      setBoard((b) => ({
        ...b,
        notes: b.notes.map((n) => (g.origin.has(n.id) ? { ...n, ...pos(n.id) } : n)),
        frames: b.frames.map((f) => (g.origin.has(f.id) ? { ...f, ...pos(f.id) } : f)),
      }));
    } else {
      const w = Math.max(80, Math.round(g.w + dx));
      const h = Math.max(36, Math.round(g.h + dy));
      setBoard((b) => ({
        ...b,
        notes: b.notes.map((n) => (n.id === g.id ? { ...n, w, h } : n)),
        frames: b.frames.map((f) => (f.id === g.id ? { ...f, w, h } : f)),
      }));
    }
  }
  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    if (base.current && (g?.type === "resize" || (g?.type === "move" && g.moved))) commit(boardRef.current, base.current);
    base.current = null;
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return;
    placeOrClear(e);
  }
  /** 空いている場所を押したとき：道具に応じて置く、選択ツールなら選択解除 */
  function placeOrClear(e: React.PointerEvent) {
    (document.activeElement as HTMLElement | null)?.blur(); // 編集中のテキストを先に保存
    const at = toCanvas(e);
    if (tool === "note" || tool === "text" || tool === "frame") e.preventDefault(); // 置いた直後の入力欄からフォーカスを奪わない
    if (tool === "note") addNote(at);
    else if (tool === "text") addNote(at, { kind: "text", color: "gray" });
    else if (tool === "frame") addFrame(at);
    else {
      setSelected(new Set());
      setEditing(null);
      setArrowFrom(null);
      return;
    }
    setTool("select");
  }

  const selNotes = board.notes.filter((n) => selected.has(n.id));
  const toolBtn = (t: Tool, icon: React.ReactNode, label: string, key: string) => (
    <button
      type="button"
      aria-label={label}
      title={`${label}（${key}）`}
      aria-pressed={tool === t}
      onClick={() => {
        setTool(t);
        setArrowFrom(null);
      }}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px]",
        tool === t ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
      )}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-200 bg-white px-4 py-1.5">
        {toolBtn("select", <MousePointer2Icon className="size-3.5" />, "選択", "V")}
        {toolBtn("note", <StickyNoteIcon className="size-3.5" />, "付箋", "N")}
        {toolBtn("text", <TypeIcon className="size-3.5" />, "テキスト", "T")}
        {toolBtn("frame", <FrameIcon className="size-3.5" />, "枠", "F")}
        {toolBtn("arrow", <ArrowRightIcon className="size-3.5" />, "矢印", "A")}
        <InsightPicker onPick={(p) => addNote(viewCenter(), { text: p.title, insightId: p.id, insightTitle: p.title, color: "blue" })}>
          <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-zinc-700 hover:bg-zinc-100">
            <LightbulbIcon className="size-3.5" />
            <span className="hidden xl:inline">インサイト</span>
          </button>
        </InsightPicker>
        <span className="mx-1.5 h-5 w-px bg-zinc-200" />
        {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`色：${c}`}
            onClick={() => applyColor(c)}
            style={{ background: NOTE_COLORS[c].bg, borderColor: NOTE_COLORS[c].border }}
            className={cn("size-6 rounded-full border-2", color === c && "ring-2 ring-zinc-900 ring-offset-1")}
          />
        ))}
        {selNotes.some((n) => n.kind === "text") && (
          <>
            <span className="mx-1.5 h-5 w-px bg-zinc-200" />
            {(["s", "m", "l"] as const).map((s) => (
              <button key={s} type="button" onClick={() => applyTextSize(s)} className="h-8 rounded-md px-2 text-[13px] text-zinc-700 hover:bg-zinc-100">
                {{ s: "小", m: "中", l: "大" }[s]}
              </button>
            ))}
          </>
        )}
        <span className="mx-1.5 h-5 w-px bg-zinc-200" />
        <IconBtn label="複製（⌘D）" disabled={selected.size === 0} onClick={duplicateSelected}>
          <CopyIcon className="size-3.5" />
        </IconBtn>
        <IconBtn label="削除（Delete）" disabled={selected.size === 0} onClick={removeSelected}>
          <Trash2Icon className="size-3.5" />
        </IconBtn>
        <IconBtn label="元に戻す（⌘Z）" disabled={past.current.length === 0} onClick={undo}>
          <Undo2Icon className="size-3.5" />
        </IconBtn>
        <IconBtn label="やり直す（⌘⇧Z）" disabled={future.current.length === 0} onClick={redo}>
          <Redo2Icon className="size-3.5" />
        </IconBtn>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-2 hidden text-xs text-zinc-400 2xl:inline">
            {tool === "arrow"
              ? arrowFrom
                ? "矢印の先をクリック"
                : "矢印の始まりをクリック"
              : "ダブルクリックで編集 · Shift+クリックで複数選択 · 右下の角でサイズ変更"}
          </span>
          <IconBtn label="縮小" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))}>
            <MinusIcon className="size-3.5" />
          </IconBtn>
          <button type="button" onClick={() => setZoom(1)} className="h-8 w-12 rounded-md text-xs tabular-nums text-zinc-600 hover:bg-zinc-100">
            {Math.round(zoom * 100)}%
          </button>
          <IconBtn label="拡大" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>
            <PlusIcon className="size-3.5" />
          </IconBtn>
        </div>
      </div>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-auto bg-zinc-50"
        onWheel={(e) => {
          if (!(e.ctrlKey || e.metaKey)) return; // ピンチ／⌘+ホイールで拡大縮小
          e.preventDefault();
          setZoom((z) => Math.min(2, Math.max(0.3, +(z - e.deltaY * 0.002).toFixed(2))));
        }}
      >
        <div style={{ width: size.w * zoom, height: size.h * zoom }}>
          <div
            ref={canvas}
            className={cn("relative origin-top-left select-none", tool !== "select" && "cursor-crosshair")}
            style={{
              width: size.w,
              height: size.h,
              transform: `scale(${zoom})`,
              backgroundImage: "radial-gradient(#d4d4d8 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={(e) => {
              if (e.target === e.currentTarget) addNote(toCanvas(e));
            }}
          >
            {/* 枠（いちばん下） */}
            {board.frames.map((f) => {
              const c = NOTE_COLORS[f.color ?? "gray"] ?? NOTE_COLORS.gray;
              const sel = selected.has(f.id);
              return (
                <div
                  key={f.id}
                  className={cn("absolute rounded-xl border-2", sel ? "border-blue-500" : "", arrowFrom === f.id && "ring-4 ring-blue-200")}
                  style={{ left: f.x, top: f.y, width: f.w, height: f.h, borderColor: sel ? undefined : c.border, background: `${c.bg}99` }}
                  onPointerDown={(e) => {
                    // 枠の内側の空白は、キャンバスと同じ扱い（付箋を置ける）
                    if (e.target === e.currentTarget && tool !== "arrow") {
                      e.stopPropagation();
                      placeOrClear(e);
                    }
                  }}
                  onDoubleClick={(e) => {
                    if (e.target === e.currentTarget) {
                      e.stopPropagation();
                      addNote(toCanvas(e));
                    }
                  }}
                >
                  <div
                    className="flex cursor-grab items-center rounded-t-[10px] px-3 py-2 active:cursor-grabbing"
                    style={{ background: c.bg }}
                    onPointerDown={(e) => startMove(e, f.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditing(f.id);
                    }}
                  >
                    {editing === f.id ? (
                      <InlineText
                        initial={f.title}
                        onDone={(v) => {
                          setEditing(null);
                          if (v !== f.title) setFrameTitle(f.id, v);
                        }}
                        className="w-full bg-white/80 px-1 text-[13px] font-semibold"
                      />
                    ) : (
                      <span className="truncate text-[13px] font-semibold text-zinc-700">{f.title || "無題の枠"}</span>
                    )}
                  </div>
                  {sel && <ResizeHandle onPointerDown={(e) => startResize(e, f)} />}
                </div>
              );
            })}

            {/* 矢印 */}
            <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden="true">
              <defs>
                <marker id="silo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#52525b" />
                </marker>
              </defs>
              {edges.map((ed) => {
                const a = boxes.get(ed.from);
                const b = boxes.get(ed.to);
                if (!a || !b) return null;
                const [p1, p2] = edgePoints(a, b);
                const sel = selected.has(ed.id);
                return (
                  <g key={ed.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); setSelected(new Set([ed.id])); }}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={14} />
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={sel ? "#2563eb" : "#52525b"} strokeWidth={sel ? 2.5 : 1.75} markerEnd="url(#silo-arrow)" />
                  </g>
                );
              })}
            </svg>

            {/* 付箋・テキスト */}
            {board.notes.map((n) => {
              const b = noteBox(n);
              const c = NOTE_COLORS[n.color] ?? NOTE_COLORS.yellow;
              const isText = n.kind === "text";
              const isEditing = editing === n.id;
              const sel = selected.has(n.id);
              return (
                <div
                  key={n.id}
                  className={cn(
                    "absolute flex flex-col rounded-md p-2.5 leading-relaxed",
                    isText ? "" : "border shadow-sm",
                    sel && "ring-2 ring-blue-500",
                    arrowFrom === n.id && "ring-4 ring-blue-300",
                    !isEditing && (tool === "arrow" ? "cursor-pointer" : "cursor-grab active:cursor-grabbing")
                  )}
                  style={{
                    left: b.x,
                    top: b.y,
                    width: b.w,
                    minHeight: b.h, // 文字が増えたら付箋も伸びる
                    background: isText ? "transparent" : c.bg,
                    borderColor: c.border,
                    fontSize: isText ? TEXT_SIZES[n.size ?? "m"] : 13,
                    fontWeight: isText && n.size === "l" ? 700 : undefined,
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => {
                    if (isEditing || (e.target as HTMLElement).closest("a")) return;
                    startMove(e, n.id);
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
                      placeholder={isText ? "テキスト" : "内容を入力"}
                      onBlur={(e) => {
                        setEditing(null);
                        if (e.target.value !== n.text) setNoteText(n.id, e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) (e.target as HTMLTextAreaElement).blur();
                      }}
                      className="field-sizing-content min-h-full w-full flex-1 resize-none bg-transparent outline-none select-text"
                    />
                  ) : (
                    <span className="flex-1 whitespace-pre-wrap break-words">
                      {n.text || <span className="text-zinc-400">{isText ? "テキスト" : "ダブルクリックで入力"}</span>}
                    </span>
                  )}
                  {n.insightId && (
                    <Link
                      href={`/insights?node=${n.insightId}`}
                      className="mt-1 inline-flex w-fit max-w-full shrink-0 items-center gap-1 truncate rounded bg-white/70 px-1.5 py-0.5 text-[10.5px] text-blue-700 hover:underline"
                    >
                      <LightbulbIcon className="size-3 shrink-0" />
                      {n.insightTitle || "インサイト"}
                    </Link>
                  )}
                  {sel && selected.size === 1 && <ResizeHandle onPointerDown={(e) => startResize(e, b)} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 2 つの箱の外周どうしを結ぶ線分（中心線と箱の辺の交点） */
function edgePoints(a: Box, b: Box) {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const clip = (c: { x: number; y: number }, box: Box, to: { x: number; y: number }) => {
    const dx = to.x - c.x;
    const dy = to.y - c.y;
    if (dx === 0 && dy === 0) return c;
    const sx = dx !== 0 ? box.w / 2 / Math.abs(dx) : Infinity;
    const sy = dy !== 0 ? box.h / 2 / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: c.x + dx * s, y: c.y + dy * s };
  };
  return [clip(ca, a, cb), clip(cb, b, ca)];
}

function ResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span
      role="presentation"
      onPointerDown={onPointerDown}
      className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize rounded-sm border-2 border-blue-500 bg-white"
    />
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function InlineText({ initial, onDone, className }: { initial: string; onDone: (v: string) => void; className?: string }) {
  const done = useRef(false);
  const finish = (v: string) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      autoFocus
      defaultValue={initial}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") finish((e.target as HTMLInputElement).value);
        if (e.key === "Escape") finish(initial);
      }}
      className={cn("select-text rounded outline-none ring-1 ring-blue-400", className)}
    />
  );
}
