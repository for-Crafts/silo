"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LockIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SAVE_ERROR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

export function TranscriptSheet({ researchId, initialHasTranscript }: { researchId: string; initialHasTranscript: boolean }) {
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
      console.error("get_transcript failed:", error.code, error.message);
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
    if (error) {
      console.error("set_transcript failed:", error.code, error.message);
      return toast.error(SAVE_ERROR);
    }
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
      <div className="mt-9 flex items-center justify-between border-t pt-4">
        <span className="inline-flex items-center gap-2 text-[13px] text-zinc-500">
          <LockIcon className="size-3.5" />
          {hasTranscript ? "議事録全文（暗号化保存）" : "議事録全文はまだありません（保存時に暗号化）"}
        </span>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="h-[30px] text-xs">
            {hasTranscript ? "全文を表示" : "議事録を追加"}
          </Button>
        </SheetTrigger>
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
