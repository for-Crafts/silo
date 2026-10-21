"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon, LightbulbIcon, QuoteIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { createClient } from "@/lib/supabase/client";

type Item = { id: string; label: string; sub?: string; href: string };

export function useCommandSearch() {
  const [isOpen, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { isOpen, setOpen, open: useCallback(() => setOpen(true), []) };
}

export function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [research, setResearch] = useState<Item[]>([]);
  const [insights, setInsights] = useState<Item[]>([]);
  const [facts, setFacts] = useState<Item[]>([]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    (async () => {
      const [r, i, f] = await Promise.all([
        supabase.from("research_file").select("id, title, subject").is("deleted_at", null).limit(2000),
        supabase.from("insight").select("id, title, is_inbox").is("deleted_at", null).limit(2000),
        supabase.from("fact").select("id, text, insight_id").is("deleted_at", null).limit(5000),
      ]);
      setResearch(
        (r.data ?? []).map((x) => ({
          id: x.id,
          label: x.title || "無題",
          sub: x.subject,
          href: `/research/${x.id}`,
        }))
      );
      setInsights(
        (i.data ?? []).map((x) => ({
          id: x.id,
          label: x.is_inbox ? "🔥 あとで分類する" : x.title || "無題",
          href: `/insights?node=${x.id}`,
        }))
      );
      setFacts(
        (f.data ?? []).map((x) => ({
          id: x.id,
          label: x.text,
          href: x.insight_id ? `/insights?node=${x.insight_id}&fact=${x.id}` : `/insights?fact=${x.id}`,
        }))
      );
    })();
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="検索" description="リサーチ・インサイト・ファクトを検索">
      <CommandInput placeholder="リサーチ・インサイト・ファクトを検索…" />
      <CommandList>
        <CommandEmpty>見つかりません</CommandEmpty>
        <CommandGroup heading="リサーチ">
          {research.map((x) => (
            <CommandItem key={x.id} value={`${x.label} ${x.sub ?? ""} ${x.id}`} onSelect={() => go(x.href)}>
              <FileTextIcon />
              <span className="truncate">{x.label}</span>
              {x.sub && <span className="ml-auto truncate text-xs text-muted-foreground">{x.sub}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="インサイト">
          {insights.map((x) => (
            <CommandItem key={x.id} value={`${x.label} ${x.id}`} onSelect={() => go(x.href)}>
              <LightbulbIcon />
              <span className="truncate">{x.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="ファクト">
          {facts.map((x) => (
            <CommandItem key={x.id} value={`${x.label} ${x.id}`} onSelect={() => go(x.href)}>
              <QuoteIcon />
              <span className="truncate">{x.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
