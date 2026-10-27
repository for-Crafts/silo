"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVerticalIcon, PlusIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { beginSave, endSave } from "@/lib/save-status";
import { useKeyedPatchQueue } from "@/lib/patch-queue";
import { SAVE_ERROR, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FactRow, Insight } from "@/lib/types";
import { TagEditor } from "@/components/app/tag-editor";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RootDropZone, TreeNode, type TreeHandlers } from "./insight-tree";

const FACT_COLUMNS = "id, text, speaker, note, insight_id, research_id, updated_at, research:research_id(title)";
const IMPORTANCE = ["高", "中", "低"] as const;

async function saveRow(table: "insight" | "fact", id: string, patch: Record<string, unknown>) {
  beginSave();
  const { error } = await createClient().from(table).update(patch).eq("id", id);
  endSave(!error);
  if (error) toast.error(SAVE_ERROR);
  return !error;
}

export function InsightWorkspace({ insights: initial, counts: initialCounts }: { insights: Insight[]; counts: Record<string, number> }) {
  const router = useRouter();
  const params = useSearchParams();
  const { workspaceId, userId } = useWorkspace();

  const [insights, setInsights] = useState<Insight[]>(initial);
  const [counts, setCounts] = useState(initialCounts);
  const inbox = insights.find((i) => i.is_inbox) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(params.get("node") ?? inbox?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null); // 作成直後のノード（Enter で兄弟を続けて作る）
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Insight | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const highlightFact = params.get("fact");

  // ---- ファクトはノードごとに遅延取得してキャッシュ ----
  const cache = useRef(new Map<string, FactRow[]>());
  const inflight = useRef(new Map<string, Promise<FactRow[]>>());
  const [facts, setFacts] = useState<FactRow[] | null>(null);

  const loadFacts = useCallback((id: string) => {
    const hit = cache.current.get(id);
    if (hit) return Promise.resolve(hit);
    const running = inflight.current.get(id);
    if (running) return running;
    const p = (async () => {
      const { data } = await createClient()
        .from("fact")
        .select(FACT_COLUMNS)
        .eq("insight_id", id)
        .eq("status", "accepted")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      const rows = (data ?? []) as unknown as FactRow[];
      cache.current.set(id, rows);
      inflight.current.delete(id);
      return rows;
    })();
    inflight.current.set(id, p);
    return p;
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const hit = cache.current.get(selectedId);
    setFacts(hit ?? null);
    if (!hit) {
      let alive = true;
      loadFacts(selectedId).then((rows) => alive && setFacts(rows));
      return () => {
        alive = false;
      };
    }
  }, [selectedId, loadFacts]);

  const select = (id: string) => {
    setSelectedId(id);
    window.history.replaceState(null, "", `/insights?node=${id}`); // サーバ往復なしで URL だけ更新
  };

  // ---- ツリー構造 ----
  const byParent = useMemo(() => {
    const m = new Map<string | null, Insight[]>();
    for (const i of insights) {
      if (i.is_inbox || i.status === "proposed") continue; // 提案中のテーマはツリーに混ぜない
      const k = i.parent_id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    for (const list of m.values()) list.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    return m;
  }, [insights]);
  const childrenOf = useCallback((id: string | null) => byParent.get(id) ?? [], [byParent]);
  const byId = useMemo(() => new Map(insights.map((i) => [i.id, i])), [insights]);
  const proposals = useMemo(() => insights.filter((i) => i.status === "proposed"), [insights]);

  /** Claude が提案したテーマを採用（ツリーに入れ、紐づくファクトを移す）または却下 */
  async function decideProposal(p: Insight, accept: boolean) {
    const supabase = createClient();
    if (!accept) {
      setInsights((list) => list.filter((i) => i.id !== p.id));
      const { error } = await supabase.from("insight").update({ status: "rejected", deleted_at: new Date().toISOString() }).eq("id", p.id);
      if (error) {
        toast.error(SAVE_ERROR);
        setInsights((list) => [...list, p]);
      }
      return;
    }
    const order = childrenOf(p.parent_id).length;
    patchLocal(p.id, { status: "accepted", sort_order: order });
    beginSave();
    const factIds = p.proposed_fact_ids ?? [];
    const { data: before } = factIds.length
      ? await supabase.from("fact").select("id, insight_id").in("id", factIds).eq("status", "accepted").is("deleted_at", null)
      : { data: [] as { id: string; insight_id: string | null }[] };
    const [a, b] = await Promise.all([
      supabase.from("insight").update({ status: "accepted", sort_order: order }).eq("id", p.id),
      before?.length ? supabase.from("fact").update({ insight_id: p.id }).in("id", before.map((f) => f.id)) : null,
    ]);
    const ok = !a.error && !b?.error;
    endSave(ok);
    if (!ok) {
      toast.error(SAVE_ERROR);
      patchLocal(p.id, { status: "proposed" });
      return;
    }
    // 件数とキャッシュを更新
    setCounts((c) => {
      const next = { ...c, [p.id]: (c[p.id] ?? 0) + (before?.length ?? 0) };
      for (const f of before ?? []) if (f.insight_id) next[f.insight_id] = Math.max(0, (next[f.insight_id] ?? 1) - 1);
      return next;
    });
    for (const f of before ?? []) if (f.insight_id) cache.current.delete(f.insight_id);
    cache.current.delete(p.id);
    toast.success(`「${p.title}」をツリーに追加しました${before?.length ? `（ファクト ${before.length} 件を移動）` : ""}`);
    select(p.id);
  }

  const isDescendant = (maybeChild: string, ancestor: string) => {
    let cur = byId.get(maybeChild)?.parent_id ?? null;
    while (cur) {
      if (cur === ancestor) return true;
      cur = byId.get(cur)?.parent_id ?? null;
    }
    return false;
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const keep = new Set<string>();
    for (const i of insights) {
      if (!i.title.toLowerCase().includes(q)) continue;
      let cur: Insight | undefined = i;
      while (cur) {
        keep.add(cur.id);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
    }
    return (id: string) => keep.has(id);
  }, [query, insights, byId]);

  // ---- 操作（すべて画面を先に更新し、裏で保存） ----
  function patchLocal(id: string, patch: Partial<Insight>) {
    setInsights((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function createNode(parentId: string | null, afterId?: string) {
    const siblings = childrenOf(parentId);
    const afterIdx = afterId ? siblings.findIndex((s) => s.id === afterId) : siblings.length - 1;
    const now = new Date().toISOString();
    const node: Insight = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      parent_id: parentId,
      title: "",
      tags: [],
      importance: null,
      sort_order: afterIdx + 1,
      is_inbox: false,
      created_by: userId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    // 後ろの兄弟を 1 つずつ後ろへ
    const shifted = siblings.slice(afterIdx + 1);
    setInsights((list) => [
      ...list.map((i) => (shifted.some((s) => s.id === i.id) ? { ...i, sort_order: i.sort_order + 1 } : i)),
      node,
    ]);
    if (parentId) setCollapsed((c) => (c.has(parentId) ? new Set([...c].filter((x) => x !== parentId)) : c));
    setEditingId(node.id);
    setFreshId(node.id);
    select(node.id);
    beginSave();
    const supabase = createClient();
    const [{ error }] = await Promise.all([
      supabase.from("insight").insert({
        id: node.id,
        workspace_id: workspaceId,
        parent_id: parentId,
        title: "",
        sort_order: node.sort_order,
        created_by: userId,
      }),
      ...shifted.map((s) => supabase.from("insight").update({ sort_order: s.sort_order + 1 }).eq("id", s.id)),
    ]);
    endSave(!error);
    if (error) {
      toast.error(SAVE_ERROR);
      setInsights((list) => list.filter((i) => i.id !== node.id));
    }
  }

  function moveNode(id: string, parentId: string | null) {
    const node = byId.get(id);
    if (!node || node.parent_id === parentId) return;
    if (parentId && (parentId === id || isDescendant(parentId, id))) return toast.error("自分の子孫の下には移動できません");
    const order = childrenOf(parentId).length;
    const before = { parent_id: node.parent_id, sort_order: node.sort_order };
    patchLocal(id, { parent_id: parentId, sort_order: order });
    saveRow("insight", id, { parent_id: parentId, sort_order: order }).then((ok) => !ok && patchLocal(id, before));
  }

  function commitEdit(id: string, title: string, how: "enter" | "tab" | "shift-tab" | "blur" | "escape") {
    const node = byId.get(id);
    setEditingId(null);
    if (!node) return;
    const wasFresh = freshId === id;
    setFreshId(null);
    const t = title.trim();
    if (how === "escape" && wasFresh && !node.title && !t) {
      // 空のまま取り消した新規ノードは消す
      setInsights((list) => list.filter((i) => i.id !== id));
      createClient().from("insight").delete().eq("id", id);
      select(node.parent_id ?? inbox?.id ?? "");
      return;
    }
    if (how !== "escape" && t !== node.title) {
      patchLocal(id, { title: t });
      saveRow("insight", id, { title: t });
    }
    if (how === "enter" && wasFresh) void createNode(node.parent_id, id);
    if (how === "tab") {
      const sibs = childrenOf(node.parent_id);
      const prev = sibs[sibs.findIndex((s) => s.id === id) - 1];
      if (prev) moveNode(id, prev.id);
      setEditingId(id);
    }
    if (how === "shift-tab" && node.parent_id) {
      moveNode(id, byId.get(node.parent_id)?.parent_id ?? null);
      setEditingId(id);
    }
  }

  async function deleteNode(node: Insight) {
    setDeleting(null);
    const kids = childrenOf(node.id);
    const moved = cache.current.get(node.id) ?? [];
    // 子テーマは親へ、ファクトは受信箱へ戻す
    setInsights((list) =>
      list.filter((i) => i.id !== node.id).map((i) => (i.parent_id === node.id ? { ...i, parent_id: node.parent_id } : i))
    );
    if (inbox) {
      setCounts((c) => ({ ...c, [inbox.id]: (c[inbox.id] ?? 0) + (c[node.id] ?? 0), [node.id]: 0 }));
      cache.current.delete(inbox.id);
    }
    cache.current.delete(node.id);
    if (selectedId === node.id) select(node.parent_id ?? inbox?.id ?? "");
    beginSave();
    const supabase = createClient();
    const results = await Promise.all([
      ...kids.map((k) => supabase.from("insight").update({ parent_id: node.parent_id }).eq("id", k.id)),
      inbox ? supabase.from("fact").update({ insight_id: inbox.id }).eq("insight_id", node.id) : null,
      supabase.from("insight").update({ deleted_at: new Date().toISOString() }).eq("id", node.id),
    ]);
    const ok = results.every((r) => !r?.error);
    endSave(ok);
    if (!ok) {
      toast.error(SAVE_ERROR);
      router.refresh();
    } else if (moved.length) toast.success(`${moved.length} 件のファクトを「あとで分類する」に戻しました`);
  }

  function moveFact(factId: string, from: string | null, to: string) {
    if (from === to) return;
    const fromRows = from ? cache.current.get(from) : undefined;
    const row = fromRows?.find((f) => f.id === factId);
    if (from && fromRows) cache.current.set(from, fromRows.filter((f) => f.id !== factId));
    const toRows = cache.current.get(to);
    if (row && toRows) cache.current.set(to, [{ ...row, insight_id: to }, ...toRows]);
    setCounts((c) => ({ ...c, ...(from ? { [from]: Math.max(0, (c[from] ?? 1) - 1) } : {}), [to]: (c[to] ?? 0) + 1 }));
    if (selectedId === from) setFacts((fs) => fs?.filter((f) => f.id !== factId) ?? fs);
    saveRow("fact", factId, { insight_id: to }).then((ok) => {
      if (!ok) {
        cache.current.delete(to);
        if (from) cache.current.delete(from);
        if (selectedId) loadFacts(selectedId).then(setFacts);
      }
    });
    const target = byId.get(to);
    toast(`「${target?.is_inbox ? "あとで分類する" : target?.title || "無題のテーマ"}」に移動しました`);
  }

  // ---- ドラッグ＆ドロップ ----
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function onDragStart(e: DragStartEvent) {
    const d = e.active.data.current as { kind: string; label?: string; insightId?: string };
    setDragLabel(d.kind === "fact" ? (d.label ?? "") : byId.get(d.insightId ?? "")?.title || "無題のテーマ");
  }
  function onDragEnd(e: DragEndEvent) {
    setDragLabel(null);
    const over = e.over?.data.current as { insightId: string | null } | undefined;
    if (!over) return;
    const d = e.active.data.current as { kind: "fact" | "node"; factId?: string; from?: string | null; insightId?: string };
    if (d.kind === "fact" && d.factId && over.insightId) moveFact(d.factId, d.from ?? null, over.insightId);
    if (d.kind === "node" && d.insightId) moveNode(d.insightId, over.insightId);
  }

  // ---- 選択中のテーマ ----
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const crumbs = useMemo(() => {
    const out: Insight[] = [];
    let cur = selected?.parent_id ? byId.get(selected.parent_id) : undefined;
    while (cur) {
      out.unshift(cur);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return out;
  }, [selected, byId]);

  // テーマごと（ID ごと）にまとめて保存。素早く別テーマへ移っても取り違えない
  const nodeQueue = useKeyedPatchQueue<Pick<Insight, "title" | "tags" | "importance">>(async (id, fields) => {
    const { error } = await createClient().from("insight").update(fields).eq("id", id);
    return !error;
  });

  const h: TreeHandlers = {
    selectedId,
    editingId,
    collapsed,
    counts,
    childrenOf,
    onSelect: select,
    onHover: (id) => void loadFacts(id),
    onToggle: (id) => setCollapsed((c) => (c.has(id) ? new Set([...c].filter((x) => x !== id)) : new Set([...c, id]))),
    onStartEdit: setEditingId,
    onCommitEdit: commitEdit,
    onAddChild: (id) => void createNode(id),
    onDelete: setDeleting,
    visible,
  };

  return (
    <DndContext id="insights" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragLabel(null)}>
      <div className="flex h-full">
        <aside className="flex w-[340px] shrink-0 flex-col border-r bg-zinc-50">
          <div className="flex items-center justify-between px-4 pb-2 pt-5">
            <h1 className="text-[15px] font-semibold">インサイトツリー</h1>
            <span className="text-xs text-zinc-500">{insights.filter((i) => !i.is_inbox && i.status !== "proposed").length} テーマ</span>
          </div>
          <div className="relative px-3 pb-2">
            <SearchIcon className="pointer-events-none absolute left-5 top-2.5 size-3.5 text-zinc-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="テーマを検索" className="h-8 bg-white pl-7 text-[13px]" />
          </div>
          <div role="tree" aria-label="インサイトツリー" className="min-h-0 flex-1 overflow-auto px-2 pb-4">
            {proposals.length > 0 && (
              <section aria-label="AI 提案" className="mb-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2">
                <div className="flex items-center justify-between px-1 pb-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-violet-800">
                    <SparklesIcon className="size-3.5" />
                    AI 提案（{proposals.length}）
                  </span>
                  <span className="text-[10.5px] text-violet-900/60">採用するとツリーに入ります</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {proposals.map((p) => (
                    <li key={p.id} className="rounded-md border border-violet-100 bg-white p-2">
                      <div className="text-[13px] font-semibold leading-snug">{p.title || "無題のテーマ"}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {p.parent_id ? `「${byId.get(p.parent_id)?.title || "無題"}」の下` : "トップレベル"} · ファクト {p.proposed_fact_ids?.length ?? 0} 件
                      </div>
                      {p.rationale && <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-zinc-600">{p.rationale}</p>}
                      <div className="mt-1.5 flex justify-end gap-1">
                        <button type="button" onClick={() => decideProposal(p, false)} className="h-6 rounded px-2 text-[11px] text-zinc-600 hover:bg-zinc-100">
                          却下
                        </button>
                        <button type="button" onClick={() => decideProposal(p, true)} className="h-6 rounded bg-zinc-950 px-2 text-[11px] font-medium text-white hover:bg-zinc-800">
                          採用
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {inbox && (
              <ul className="mb-2 border-b border-zinc-200 pb-2">
                <TreeNode node={inbox} depth={0} h={h} />
              </ul>
            )}
            <ul>
              {childrenOf(null).map((n) => (
                <TreeNode key={n.id} node={n} depth={0} h={h} />
              ))}
            </ul>
            {childrenOf(null).length === 0 && (
              <p className="px-3 py-6 text-center text-xs leading-relaxed text-zinc-500">
                まだテーマがありません。下の「＋ テーマを追加」で、ファクトの共通項に名前をつけましょう
              </p>
            )}
            <RootDropZone />
            <button
              type="button"
              onClick={() => createNode(null)}
              className="mt-1 flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-[13px] text-zinc-500 hover:bg-zinc-100"
            >
              <PlusIcon className="size-3.5" />
              テーマを追加（Enter で続けて、Tab で子に）
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto">
          {selected ? (
            <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-8 py-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-zinc-500">
                    <span>すべてのテーマ</span>
                    {crumbs.map((c) => (
                      <button key={c.id} type="button" onClick={() => select(c.id)} className="hover:text-blue-600">
                        {" / "}
                        {c.title || "無題のテーマ"}
                      </button>
                    ))}
                  </div>
                  {selected.is_inbox ? (
                    <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-amber-800">🔥 あとで分類する</h1>
                  ) : (
                    <input
                      key={selected.id}
                      defaultValue={selected.title}
                      placeholder="無題のテーマ"
                      aria-label="テーマ名"
                      onChange={(e) => {
                        patchLocal(selected.id, { title: e.target.value });
                        nodeQueue.queue(selected.id, { title: e.target.value });
                      }}
                      className="w-full bg-transparent text-[22px] font-semibold tracking-[-0.01em] outline-none placeholder:text-zinc-300"
                    />
                  )}
                  <p className="mt-1.5 text-[13px] text-zinc-500">
                    {selected.is_inbox
                      ? "リサーチの ✓ で作ったファクトがここに届きます。左のテーマへドラッグして分類しましょう"
                      : `ファクト ${counts[selected.id] ?? 0} 件 · 子テーマ ${childrenOf(selected.id).length} 件`}
                  </p>
                </div>
                {!selected.is_inbox && (
                  <button
                    type="button"
                    onClick={() => createNode(selected.id)}
                    className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-[13px] text-zinc-700 hover:bg-zinc-50"
                  >
                    子テーマを追加
                  </button>
                )}
              </div>

              {!selected.is_inbox && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-500">重要度</span>
                  {IMPORTANCE.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        const next = selected.importance === v ? null : v;
                        patchLocal(selected.id, { importance: next });
                        nodeQueue.queue(selected.id, { importance: next });
                      }}
                      className={cn(
                        "h-7 rounded-full border px-2.5 text-xs",
                        selected.importance === v ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      )}
                    >
                      {v}
                    </button>
                  ))}
                  <span className="ml-3 text-xs text-zinc-500">タグ</span>
                  <TagEditor
                    tags={selected.tags}
                    onChange={(next) => {
                      patchLocal(selected.id, { tags: next });
                      nodeQueue.queue(selected.id, { tags: next });
                    }}
                  />
                </div>
              )}

              <FactTable facts={facts} insightId={selected.id} highlight={highlightFact} />

              {childrenOf(selected.id).length > 0 && (
                <div>
                  <h2 className="mb-2 text-[13px] font-medium text-zinc-500">子テーマ</h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                    {childrenOf(selected.id).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => select(c.id)}
                        onMouseEnter={() => void loadFacts(c.id)}
                        className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-left text-[13px] hover:border-blue-300"
                      >
                        <span className="truncate font-medium">{c.title || "無題のテーマ"}</span>
                        <span className="text-xs text-zinc-400">{counts[c.id] ?? 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">左のツリーからテーマを選んでください</div>
          )}
        </main>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragLabel !== null && (
          <div className="max-w-[360px] truncate rounded-md border border-blue-300 bg-white px-3 py-2 text-[13px] shadow-lg">{dragLabel || "（空）"}</div>
        )}
      </DragOverlay>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>「{deleting?.title || "無題のテーマ"}」を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>子テーマは一つ上の階層へ、ファクトは「あとで分類する」に戻ります</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteNode(deleting)}>削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  );
}

function FactTable({ facts, insightId, highlight }: { facts: FactRow[] | null; insightId: string; highlight: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-main:${insightId}`, data: { insightId } });
  return (
    <div ref={setNodeRef} className={cn("overflow-hidden rounded-lg border bg-white", isOver ? "border-blue-400" : "border-zinc-200")}>
      <div className="grid grid-cols-[110px_minmax(0,1fr)_220px_90px] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-medium text-zinc-500">
        <div>発話者</div>
        <div>ファクト</div>
        <div>元リサーチ</div>
        <div>更新</div>
      </div>
      {facts === null &&
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-b border-zinc-100 px-4 py-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      {facts?.length === 0 && (
        <div className="px-4 py-6 text-center text-[13px] text-zinc-500">このテーマにはまだファクトがありません</div>
      )}
      {facts?.map((f) => <FactRowView key={f.id} f={f} highlight={highlight === f.id} />)}
      <div
        className={cn(
          "m-2.5 rounded-lg border-2 border-dashed px-4 py-3 text-center text-[13px]",
          isOver ? "border-blue-400 bg-blue-100 text-blue-800" : "border-blue-200 bg-blue-50 text-blue-700"
        )}
      >
        左のツリーのテーマへファクトをドラッグすると、そのテーマにまとまります
      </div>
    </div>
  );
}

function FactRowView({ f, highlight }: { f: FactRow; highlight: boolean }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `fact:${f.id}`,
    data: { kind: "fact", factId: f.id, from: f.insight_id, label: f.text },
  });
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: "center" });
  }, [highlight]);
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        ref.current = el;
      }}
      className={cn(
        "group grid grid-cols-[110px_minmax(0,1fr)_220px_90px] items-center gap-4 border-b border-zinc-100 px-4 py-3 text-sm hover:bg-zinc-50",
        isDragging && "opacity-40",
        highlight && "bg-amber-50"
      )}
    >
      <div className="truncate text-[13px] text-zinc-600">{f.speaker || "—"}</div>
      <div className="flex min-w-0 items-start gap-2">
        <button
          type="button"
          aria-label="ドラッグしてテーマへ移動"
          {...listeners}
          {...attributes}
          className="mt-0.5 shrink-0 cursor-grab text-zinc-300 hover:text-zinc-600 active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <span className="line-clamp-2" title={f.note || undefined}>
          {f.text}
        </span>
      </div>
      <Link href={`/research/${f.research_id}`} className="truncate text-[13px] text-blue-600 hover:underline">
        {f.research?.title || "無題のリサーチ"}
      </Link>
      <div className="text-xs text-zinc-500">{formatDate(f.updated_at)}</div>
    </div>
  );
}
