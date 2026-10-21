"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";

export type SuggestionItem = {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
};

export type SuggestionListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type Props = {
  items: SuggestionItem[];
  command: (item: SuggestionItem) => void;
  emptyText?: string;
};

export const SuggestionList = forwardRef<SuggestionListRef, Props>(function SuggestionList(
  { items, command, emptyText = "該当なし" },
  ref
) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "Enter") {
        if (items[index]) command(items[index]);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="z-50 min-w-56 max-w-80 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
      {items.length === 0 ? (
        <div className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
              i === index ? "bg-accent text-accent-foreground" : "hover:bg-accent"
            )}
            onMouseEnter={() => setIndex(i)}
            onClick={() => command(item)}
          >
            {item.icon && <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">{item.icon}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.title}</span>
              {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
            </span>
          </button>
        ))
      )}
    </div>
  );
});
