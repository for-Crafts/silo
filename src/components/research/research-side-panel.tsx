"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LockIcon, XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useMemberEmail } from "@/components/app/workspace-context";
import { SAVE_ERROR } from "@/lib/format";
import { RESEARCH_STATUSES, type Folder, type ResearchFile } from "@/lib/types";
import { useDebouncedSave } from "./research-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  research: ResearchFile;
  folders: Folder[];
  hasTranscript: boolean;
  onPatch: (fields: Partial<ResearchFile>) => Promise<boolean>;
};

export function ResearchSidePanel({ research, folders, hasTranscript: initialHasTranscript, onPatch }: Props) {
  const emailOf = useMemberEmail();
  const [folderId, setFolderId] = useState(research.folder_id ?? "none");
  const [subject, setSubject] = useState(research.subject);
  const [tags, setTags] = useState<string[]>(research.tags);
  const [newTag, setNewTag] = useState("");
  const [status, setStatus] = useState(research.status);

  const saveSubject = useDebouncedSave<string>(600, (v) => onPatch({ subject: v }));

  async function immediate(fields: Partial<ResearchFile>) {
    const ok = await onPatch(fields);
    if (!ok) toast.error(SAVE_ERROR);
  }

  function addTag() {
    const t = newTag.trim();
    if (!t || tags.includes(t)) return setNewTag("");
    const next = [...tags, t];
    setTags(next);
    setNewTag("");
    immediate({ tags: next });
  }

  function removeTag(t: string) {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    immediate({ tags: next });
  }

  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-5 overflow-auto border-l bg-zinc-50 p-4 text-sm">
      <div className="space-y-1.5">
        <Label>フォルダ</Label>
        <Select
          value={folderId}
          onValueChange={(v) => {
            setFolderId(v);
            immediate({ folder_id: v === "none" ? null : v });
          }}
        >
          <SelectTrigger className="w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">未分類</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subject">対象者</Label>
        <Input
          id="subject"
          className="bg-background"
          value={subject}
          placeholder="例：株式会社〇〇 購買部"
          onChange={(e) => {
            setSubject(e.target.value);
            saveSubject(e.target.value);
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label>リサーチタグ</Label>
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1">
              {t}
              <button type="button" onClick={() => removeTag(t)} className="rounded-sm hover:bg-zinc-300/60">
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <Input
          className="h-8 bg-background"
          placeholder="＋ タグを追加（Enter）"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label>ステータス</Label>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            immediate({ status: v });
          }}
        >
          <SelectTrigger className="w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESEARCH_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div>作成者：{emailOf(research.created_by) || "—"}</div>
        <div>更新者：{emailOf(research.updated_by) || "—"}</div>
      </div>

      <TranscriptSheet researchId={research.id} initialHasTranscript={initialHasTranscript} />
    </aside>
  );
}

function TranscriptSheet({ researchId, initialHasTranscript }: { researchId: string; initialHasTranscript: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasTranscript, setHasTranscript] = useState(initialHasTranscript);

  async function load() {
    setLoading(true);
    const { data, error } = await createClient().rpc("get_transcript", { p_research_id: researchId });
    setLoading(false);
    if (error) {
      toast.error("議事録を取得できませんでした");
      setText("");
      return;
    }
    setText((data as string | null) ?? "");
  }

  async function save() {
    setSaving(true);
    const { error } = await createClient().rpc("set_transcript", { p_research_id: researchId, p_text: text ?? "" });
    setSaving(false);
    if (error) return toast.error(SAVE_ERROR);
    setHasTranscript(!!text);
    toast.success("議事録を暗号化して保存しました");
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && text === null) load();
      }}
    >
      <div className="space-y-1.5">
        <Label>議事録</Label>
        <SheetTrigger asChild>
          <Button variant="outline" className="w-full bg-background">
            <LockIcon data-icon="inline-start" />
            {hasTranscript ? "全文を表示" : "議事録を追加"}
          </Button>
        </SheetTrigger>
        <p className="text-xs text-muted-foreground">暗号化して保存されます</p>
      </div>
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <LockIcon className="size-4" />
            議事録
          </SheetTitle>
          <SheetDescription>全文は暗号化され、表示したときだけ復号されます</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
          <Textarea
            className="min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed"
            value={text ?? ""}
            disabled={loading}
            placeholder={loading ? "読み込み中…" : "議事録の全文を貼り付け"}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end">
            <Button className="bg-zinc-950" onClick={save} disabled={saving || loading}>
              保存
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
