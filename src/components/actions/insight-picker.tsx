"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Pick = { id: string; title: string };
let cached: Pick[] | null = null;

/** インサイト（テーマ）を検索して 1 つ選ぶポップオーバー */
export function InsightPicker({ children, onPick }: { children: React.ReactNode; onPick: (p: Pick) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Pick[]>(cached ?? []);
  useEffect(() => {
    if (!open || cached) return;
    createClient()
      .from("insight")
      .select("id, title")
      .is("deleted_at", null)
      .eq("is_inbox", false)
      .order("title")
      .then(({ data }) => {
        cached = (data ?? []).map((d) => ({ id: d.id, title: d.title || "無題のテーマ" }));
        setItems(cached);
      });
  }, [open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="インサイトを検索" />
          <CommandList>
            <CommandEmpty>見つかりません</CommandEmpty>
            <CommandGroup heading="インサイト">
              {items.map((i) => (
                <CommandItem
                  key={i.id}
                  value={`${i.title} ${i.id}`}
                  onSelect={() => {
                    onPick(i);
                    setOpen(false);
                  }}
                >
                  {i.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
