"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

/** チップ型のタグ編集。「＋」で inline 入力、Enter で確定、ホバーで × */
export function TagEditor({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const commit = () => {
    const t = draft.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="chip group gap-1">
          {t}
          <button
            type="button"
            aria-label={`${t} を外す`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="hidden rounded-sm text-zinc-500 hover:text-zinc-900 group-hover:inline-flex"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          placeholder="タグ名（Enter）"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            commit();
            setAdding(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") setAdding(false);
          }}
          className="h-6 w-36 rounded border border-zinc-300 px-2 text-xs outline-none"
        />
      ) : (
        <button
          type="button"
          aria-label="タグを追加"
          onClick={() => setAdding(true)}
          className="h-6 rounded border border-dashed border-zinc-300 px-2 text-xs text-zinc-500 hover:bg-zinc-50"
        >
          ＋
        </button>
      )}
    </div>
  );
}
