"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckIcon, ClipboardPasteIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { beginSave, endSave } from "@/lib/save-status";
import { SAVE_ERROR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Fact, Utterance } from "@/lib/types";
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
  facts: Fact[];
  onFactsChanged: () => void;
};

type Field = "speaker" | "insight_text" | "note";

export function UtteranceTable({ researchId, initialUtterances, facts, onFactsChanged }: Props) {
  const { workspaceId, userId, inboxInsightId } = useWorkspace();
  const [rows, setRows] = useState<Utterance[]>(initialUtterances);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const factByUtterance = useMemo(() => {
    const m = new Map<string, Fact>();
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

  function edit(id: string, field: Field, value: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    const key = `${id}:${field}`;
    const prev = timers.current.get(key);
    if (prev) clearTimeout(prev);
    else beginSave();
    timers.current.set(
      key,
      setTimeout(async () => {
        timers.current.delete(key);
        const { error } = await createClient().from("utterance").update({ [field]: value }).eq("id", id);
        endSave(!error);
        if (error) toast.error(SAVE_ERROR);
      }, 600)
    );
  }

  async function addRows(items: Array<Pick<Utterance, "speaker" | "insight_text" | "note">>) {
    if (items.length === 0) return;
    const base = rows.length;
    const { data, error } = await createClient()
      .from("utterance")
      .insert(
        items.map((it, i) => ({
          workspace_id: workspaceId,
          research_id: researchId,
          sort_order: base + i,
          ...it,
        }))
      )
      .select("*");
    if (error || !data) {
      toast.error(SAVE_ERROR);
      return;
    }
    setRows((rs) => [...rs, ...(data as Utterance[])]);
    return data as Utterance[];
  }

  async function addRow() {
    const created = await addRows([{ speaker: "", insight_text: "", note: "" }]);
    if (created?.[0]) {
      requestAnimationFrame(() => {
        sectionRef.current
          ?.querySelector<HTMLTextAreaElement>(`[data-row="${created[0].id}"] textarea`)
          ?.focus();
      });
    }
  }

  async function removeRow(id: string) {
    const { error } = await createClient().from("utterance").delete().eq("id", id);
    if (error) return toast.error(SAVE_ERROR);
    setRows((rs) => rs.filter((r) => r.id !== id));
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

  async function submitPaste() {
    setBusy(true);
    await addRows(parsePaste(pasteText));
    setBusy(false);
    setPasteText("");
    setPasteOpen(false);
  }

  async function createFacts(targets: Utterance[]) {
    if (!inboxInsightId) {
      toast.error("inbox インサイトがありません。seed を実行してください");
      return;
    }
    const todo = targets.filter((u) => !factByUtterance.has(u.id) && u.insight_text.trim());
    if (todo.length === 0) return;
    setBusy(true);
    const { error } = await createClient().from("fact").insert(
      todo.map((u) => ({
        workspace_id: workspaceId,
        research_id: researchId,
        utterance_id: u.id,
        insight_id: inboxInsightId,
        text: u.insight_text.trim(),
        speaker: u.speaker,
        note: u.note,
        created_by: userId,
      }))
    );
    setBusy(false);
    if (error) return toast.error(SAVE_ERROR);
    onFactsChanged();
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      addRow();
    }
  };

  return (
    <div ref={sectionRef} onKeyDown={onKeyDown}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">発話表（{rows.length}）</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
            <ClipboardPasteIcon data-icon="inline-start" />
            貼り付けて追加
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || rows.every((r) => factByUtterance.has(r.id) || !r.insight_text.trim())}
            onClick={() => createFacts(rows)}
          >
            <CheckIcon data-icon="inline-start" />
            すべてファクト化
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[110px_1fr_1fr_40px_32px] border-b bg-zinc-50 text-xs font-medium text-muted-foreground">
          <div className="px-2 py-2">発話者</div>
          <div className="px-2 py-2">顧客のインサイト（ニーズ・課題）</div>
          <div className="px-2 py-2">発言内容と背景の補足</div>
          <div className="px-1 py-2 text-center">ファクト</div>
          <div />
        </div>
        {rows.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            発話がまだありません。「貼り付けて追加」か「＋ 行を追加」で記録しましょう
          </div>
        )}
        {rows.map((r) => {
          const done = factByUtterance.has(r.id);
          return (
            <div
              key={r.id}
              data-row={r.id}
              className="group grid grid-cols-[110px_1fr_1fr_40px_32px] items-stretch border-b last:border-b-0"
            >
              <Cell value={r.speaker} onChange={(v) => edit(r.id, "speaker", v)} placeholder="発話者" />
              <Cell value={r.insight_text} onChange={(v) => edit(r.id, "insight_text", v)} placeholder="ニーズ・課題" />
              <Cell value={r.note} onChange={(v) => edit(r.id, "note", v)} placeholder="補足" />
              <div className="flex items-start justify-center pt-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={done || busy || !r.insight_text.trim()}
                      onClick={() => createFacts([r])}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-md border transition-colors",
                        done
                          ? "border-green-600 bg-green-600 text-white"
                          : "text-muted-foreground hover:bg-zinc-100 disabled:opacity-40"
                      )}
                    >
                      <CheckIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{done ? "ファクト作成済み" : "ファクトにする"}</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-start justify-center pt-1.5">
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  className="rounded-md p-1 text-muted-foreground opacity-0 hover:bg-zinc-100 group-hover:opacity-100"
                  title="行を削除"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={addRow}>
        <PlusIcon data-icon="inline-start" />
        行を追加
        <kbd className="ml-1 rounded border bg-muted px-1 font-mono text-[10px]">⌘⏎</kbd>
      </Button>

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
            <Button className="bg-zinc-950" onClick={submitPaste} disabled={busy || !pasteText.trim()}>
              {parsePaste(pasteText).length} 行を追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Cell({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-9 w-full resize-none border-r bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:bg-blue-50/40"
    />
  );
}
