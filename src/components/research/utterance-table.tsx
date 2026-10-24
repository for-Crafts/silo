"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { CheckIcon, ClipboardPasteIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { beginSave, endSave } from "@/lib/save-status";
import { SAVE_ERROR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FactWithInsight, Utterance } from "@/lib/types";
import { useKeyedPatchQueue } from "@/lib/patch-queue";
import { UTTERANCE_TABLE_EVENT } from "@/components/editor/slash-command";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  researchId: string;
  initialUtterances: Utterance[];
  facts: FactWithInsight[];
  setFacts: Dispatch<SetStateAction<FactWithInsight[]>>;
};

type Field = "speaker" | "insight_text" | "note";
type RowPatch = Partial<Pick<Utterance, Field>>;

export function UtteranceTable({ researchId, initialUtterances, facts, setFacts }: Props) {
  const { workspaceId, userId, inboxInsightId } = useWorkspace();
  const [rows, setRows] = useState<Utterance[]>(initialUtterances);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const sectionRef = useRef<HTMLDivElement>(null);

  const factByUtterance = useMemo(() => {
    const m = new Map<string, FactWithInsight>();
    facts.forEach((f) => f.utterance_id && m.set(f.utterance_id, f));
    return m;
  }, [facts]);

  useEffect(() => {
    const onFocus = () => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const first = sectionRef.current?.querySelector<HTMLTextAreaElement>("textarea");
      first?.focus();
    };
    window.addEventListener(UTTERANCE_TABLE_EVENT, onFocus);
    return () => window.removeEventListener(UTTERANCE_TABLE_EVENT, onFocus);
  }, []);

  // 同じ行の発話者・インサイト・補足の変更は 1 リクエストにまとめる
  const rowQueue = useKeyedPatchQueue<RowPatch>(async (id, fields) => {
    const { error } = await createClient().from("utterance").update(fields).eq("id", id);
    return !error;
  });

  function edit(id: string, field: Field, value: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    rowQueue.queue(id, { [field]: value });
  }

  /** 行を即座に表示し、保存は裏で行う（ID はクライアントで採番） */
  function addRows(items: Array<Pick<Utterance, "speaker" | "insight_text" | "note">>) {
    if (items.length === 0) return [];
    const now = new Date().toISOString();
    const base = rows.length;
    const created: Utterance[] = items.map((it, i) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      research_id: researchId,
      sort_order: base + i,
      created_at: now,
      updated_at: now,
      ...it,
    }));
    setRows((rs) => [...rs, ...created]);
    beginSave();
    createClient()
      .from("utterance")
      .insert(
        created.map((r) => ({
          id: r.id,
          workspace_id: r.workspace_id,
          research_id: r.research_id,
          sort_order: r.sort_order,
          speaker: r.speaker,
          insight_text: r.insight_text,
          note: r.note,
        }))
      )
      .then(({ error }) => {
        endSave(!error);
        if (error) {
          toast.error(SAVE_ERROR);
          const ids = new Set(created.map((c) => c.id));
          setRows((rs) => rs.filter((r) => !ids.has(r.id)));
        }
      });
    return created;
  }

  function addRow() {
    const [created] = addRows([{ speaker: "", insight_text: "", note: "" }]);
    requestAnimationFrame(() => {
      sectionRef.current?.querySelector<HTMLTextAreaElement>(`[data-row="${created.id}"] textarea`)?.focus();
    });
  }

  function removeRow(id: string) {
    const prev = rows;
    rowQueue.drop(id);
    setRows((rs) => rs.filter((r) => r.id !== id));
    createClient()
      .from("utterance")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          toast.error(SAVE_ERROR);
          setRows(prev);
        }
      });
  }

  function parsePaste(text: string) {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^([^：:]{1,30})[：:]\s*(.+)$/);
        return m
          ? { speaker: m[1].trim(), insight_text: m[2].trim(), note: "" }
          : { speaker: "", insight_text: line, note: "" };
      });
  }

  function submitPaste() {
    addRows(parsePaste(pasteText));
    setPasteText("");
    setPasteOpen(false);
  }

  /** ✓ を押した瞬間に右カラムへファクトを出し、保存は裏で行う */
  function createFacts(targets: Utterance[]) {
    if (!inboxInsightId) {
      toast.error("inbox インサイトがありません。seed を実行してください");
      return;
    }
    const todo = targets.filter((u) => !factByUtterance.has(u.id) && u.insight_text.trim());
    if (todo.length === 0) return;
    rowQueue.flushAll(); // 発話の最新テキストを先に保存
    const now = new Date().toISOString();
    const optimistic: FactWithInsight[] = todo.map((u) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      research_id: researchId,
      utterance_id: u.id,
      insight_id: inboxInsightId,
      text: u.insight_text.trim(),
      speaker: u.speaker,
      note: u.note,
      created_by: userId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      insight: { id: inboxInsightId, title: "", is_inbox: true },
    }));
    setFacts((fs) => [...optimistic, ...fs]);
    beginSave();
    createClient()
      .from("fact")
      .insert(
        optimistic.map((f) => ({
          id: f.id,
          workspace_id: f.workspace_id,
          research_id: f.research_id,
          utterance_id: f.utterance_id,
          insight_id: f.insight_id,
          text: f.text,
          speaker: f.speaker,
          note: f.note,
          created_by: f.created_by,
        }))
      )
      .then(({ error }) => {
        endSave(!error);
        if (error) {
          toast.error(SAVE_ERROR);
          const ids = new Set(optimistic.map((f) => f.id));
          setFacts((fs) => fs.filter((f) => !ids.has(f.id)));
        }
      });
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      addRow();
    }
  };

  return (
    <div ref={sectionRef} onKeyDown={onKeyDown} className="scroll-mt-4">
      <div className="mb-2.5 mt-8 flex items-center justify-between">
        <h2 className="text-xl font-bold">録画データ</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-[30px] text-xs" onClick={() => setPasteOpen(true)}>
            <ClipboardPasteIcon data-icon="inline-start" />
            貼り付けて追加
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-[30px] text-xs"
            disabled={rows.every((r) => factByUtterance.has(r.id) || !r.insight_text.trim())}
            onClick={() => createFacts(rows)}
          >
            すべてファクト化
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded border border-zinc-200">
        <div className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_44px] border-b border-zinc-200 bg-zinc-100 text-[13px] font-semibold text-zinc-700">
          <div className="border-r border-zinc-200 px-3.5 py-3">発話者</div>
          <div className="border-r border-zinc-200 px-3.5 py-3 leading-normal">顧客のインサイト（潜在的なニーズ・課題）</div>
          <div className="border-r border-zinc-200 px-3.5 py-3 leading-normal">発言内容と背景の補足（なぜそう考えたか）</div>
          <div />
        </div>
        {rows.length === 0 && (
          <div className="border-b border-zinc-200 p-4 text-center text-sm text-muted-foreground">
            発話がまだありません。「貼り付けて追加」か「＋ 行を追加」で記録しましょう
          </div>
        )}
        {rows.map((r) => {
          const done = factByUtterance.has(r.id);
          return (
            <div
              key={r.id}
              data-row={r.id}
              className="group grid grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_44px] items-stretch border-b border-zinc-200 text-[13.5px] leading-[1.7]"
            >
              <Cell value={r.speaker} onChange={(v) => edit(r.id, "speaker", v)} placeholder="発話者" className="text-zinc-700" />
              <Cell value={r.insight_text} onChange={(v) => edit(r.id, "insight_text", v)} placeholder="ニーズ・課題" />
              <Cell value={r.note} onChange={(v) => edit(r.id, "note", v)} placeholder="補足" className="text-zinc-700" />
              <div className="flex flex-col items-center gap-1 px-2 pt-2.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={done ? "ファクト化済み" : "この発話をファクトにする"}
                      disabled={done || !r.insight_text.trim()}
                      onClick={() => createFacts([r])}
                      className={cn(
                        "flex size-[26px] items-center justify-center rounded-md transition-[opacity,colors]",
                        done
                          ? "bg-green-100 text-green-700"
                          : "border border-zinc-200 bg-white text-zinc-700 opacity-35 hover:bg-zinc-50 group-hover:opacity-100 disabled:opacity-20"
                      )}
                    >
                      <CheckIcon className="size-[13px]" strokeWidth={2.5} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{done ? "ファクト作成済み" : "ファクトにする"}</TooltipContent>
                </Tooltip>
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  className="rounded-md p-1 text-muted-foreground opacity-0 hover:bg-zinc-100 group-hover:opacity-100"
                  aria-label="行を削除"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addRow}
          className="flex w-full items-center gap-1 bg-white px-3.5 py-2.5 text-left text-[13px] text-zinc-500 hover:bg-zinc-50"
        >
          <PlusIcon className="size-3.5" />
          行を追加（⌘+Enter）
        </button>
      </div>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>貼り付けて追加</DialogTitle>
            <DialogDescription>1 行 = 1 発話。「発話者：本文」の形式なら発話者を自動で分けます</DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            rows={12}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"田中：納期が読めないのが一番困る\n佐藤：見積の往復が多い"}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>
              キャンセル
            </Button>
            <Button className="bg-zinc-950" onClick={submitPaste} disabled={!pasteText.trim()}>
              {parsePaste(pasteText).length} 行を追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Cell({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <div className="border-r border-zinc-200">
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "block min-h-11 w-full resize-none bg-transparent px-3.5 py-3 outline-none placeholder:text-muted-foreground/40 focus:bg-blue-50/40",
        className
      )}
    />
    </div>
  );
}
