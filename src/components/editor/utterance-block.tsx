"use client";

import { createContext, useContext } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { UtteranceTable, type UtteranceTableProps } from "@/components/research/utterance-table";

/**
 * 発話表を本文中のブロックとして置く。
 * 行のデータは utterance テーブルにあり、本文には { type: "utteranceTable" } という目印だけを保存する。
 * 表の中身はページ（ResearchDetail）から Context で受け取る。
 */
export const UtteranceTableContext = createContext<UtteranceTableProps | null>(null);

function UtteranceBlockView() {
  const ctx = useContext(UtteranceTableContext);
  return (
    <NodeViewWrapper data-utterance-block="" contentEditable={false} className="my-2">
      {ctx ? (
        <UtteranceTable {...ctx} />
      ) : (
        <div className="rounded border border-dashed border-zinc-300 px-4 py-3 text-[13px] text-zinc-500">
          発話表（リサーチに挿入すると、ここに発話を記録できます）
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const UtteranceTableNode = Node.create({
  name: "utteranceTable",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  parseHTML: () => [{ tag: "div[data-utterance-table]" }],
  renderHTML: () => ["div", { "data-utterance-table": "" }],
  addNodeView() {
    return ReactNodeViewRenderer(UtteranceBlockView, {
      // 表の入力欄での入力・選択をエディタに奪われないように
      stopEvent: ({ event }) => !(event.type === "dragstart" || event.type === "drop"),
    });
  },
});

export function docHasUtteranceTable(doc: { content?: Array<{ type?: string }> } | null | undefined) {
  return !!doc?.content?.some((n) => n.type === "utteranceTable");
}
