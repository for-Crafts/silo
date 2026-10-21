import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/core";
import { createClient } from "@/lib/supabase/client";
import { makeSuggestionRender } from "./suggestion-render";
import type { SuggestionItem } from "./suggestion-list";

type MentionItem = SuggestionItem & { href: string; kind: "insight" | "fact" };

async function searchItems(query: string): Promise<MentionItem[]> {
  const supabase = createClient();
  const q = query.trim();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const [ins, facts] = await Promise.all([
    supabase
      .from("insight")
      .select("id, title, is_inbox")
      .is("deleted_at", null)
      .ilike("title", q ? like : "%")
      .limit(8),
    q
      ? supabase.from("fact").select("id, text, insight_id").is("deleted_at", null).ilike("text", like).limit(8)
      : Promise.resolve({ data: [] as { id: string; text: string; insight_id: string | null }[] }),
  ]);
  const out: MentionItem[] = [];
  for (const i of ins.data ?? []) {
    out.push({
      id: i.id,
      kind: "insight",
      title: i.is_inbox ? "🔥 あとで分類する" : i.title || "無題",
      description: "インサイト",
      href: `/insights?node=${i.id}`,
    });
  }
  for (const f of facts.data ?? []) {
    out.push({
      id: f.id,
      kind: "fact",
      title: f.text,
      description: "ファクト",
      href: f.insight_id ? `/insights?node=${f.insight_id}&fact=${f.id}` : `/insights?fact=${f.id}`,
    });
  }
  return out;
}

export const InsightMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
        parseHTML: (el) => el.getAttribute("href"),
        renderHTML: (attrs) => (attrs.href ? { href: attrs.href } : {}),
      },
      kind: {
        default: "insight",
        parseHTML: (el) => el.getAttribute("data-kind"),
        renderHTML: (attrs) => ({ "data-kind": attrs.kind }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-type='mention']" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes({ "data-type": "mention", class: "mention" }, HTMLAttributes),
      `@${node.attrs.label ?? node.attrs.id}`,
    ];
  },
}).configure({
  suggestion: {
    char: "@",
    items: ({ query }) => searchItems(query),
    command: ({ editor, range, props }) => {
      const item = props as unknown as MentionItem;
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: "mention", attrs: { id: item.id, label: item.title, href: item.href, kind: item.kind } },
          { type: "text", text: " " },
        ])
        .run();
    },
    render: makeSuggestionRender<MentionItem>("インサイト・ファクトが見つかりません"),
  },
});
