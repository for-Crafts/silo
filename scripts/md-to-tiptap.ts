/** Minimal Markdown -> Tiptap JSON converter (headings, lists, quotes, hr, code, inline marks, links). */
import { marked, type Token, type Tokens } from "marked";

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Mark[] };
type Mark = { type: string; attrs?: Record<string, unknown> };

function inline(tokens: Token[] | undefined, marks: Mark[] = []): Node[] {
  const out: Node[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "text": {
        const tt = t as Tokens.Text;
        if (tt.tokens && tt.tokens.length) out.push(...inline(tt.tokens, marks));
        else if (tt.text) out.push(textNode(decode(tt.text), marks));
        break;
      }
      case "escape":
        out.push(textNode((t as Tokens.Escape).text, marks));
        break;
      case "strong":
        out.push(...inline((t as Tokens.Strong).tokens, [...marks, { type: "bold" }]));
        break;
      case "em":
        out.push(...inline((t as Tokens.Em).tokens, [...marks, { type: "italic" }]));
        break;
      case "del":
        out.push(...inline((t as Tokens.Del).tokens, [...marks, { type: "strike" }]));
        break;
      case "codespan":
        out.push(textNode(decode((t as Tokens.Codespan).text), [...marks, { type: "code" }]));
        break;
      case "link": {
        const l = t as Tokens.Link;
        out.push(...inline(l.tokens, [...marks, { type: "link", attrs: { href: l.href, target: "_blank" } }]));
        break;
      }
      case "image":
        out.push(textNode((t as Tokens.Image).text || (t as Tokens.Image).href, marks));
        break;
      case "br":
        out.push({ type: "hardBreak" });
        break;
      case "html":
        out.push(textNode(decode((t as Tokens.HTML).text), marks));
        break;
      default:
        if ("raw" in t && typeof t.raw === "string") out.push(textNode(t.raw, marks));
    }
  }
  return out.filter((n) => n.type !== "text" || n.text);
}

function textNode(text: string, marks: Mark[]): Node {
  const n: Node = { type: "text", text };
  if (marks.length) n.marks = marks;
  return n;
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function paragraph(content: Node[]): Node {
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function blocks(tokens: Token[]): Node[] {
  const out: Node[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "space":
        break;
      case "heading": {
        const h = t as Tokens.Heading;
        out.push({ type: "heading", attrs: { level: Math.min(h.depth, 3) }, content: inline(h.tokens) });
        break;
      }
      case "paragraph":
        out.push(paragraph(inline((t as Tokens.Paragraph).tokens)));
        break;
      case "text":
        out.push(paragraph(inline((t as Tokens.Text).tokens ?? [t])));
        break;
      case "blockquote":
        out.push({ type: "blockquote", content: blocks((t as Tokens.Blockquote).tokens) });
        break;
      case "hr":
        out.push({ type: "horizontalRule" });
        break;
      case "code":
        out.push({ type: "codeBlock", content: [{ type: "text", text: (t as Tokens.Code).text }] });
        break;
      case "list": {
        const l = t as Tokens.List;
        const isTask = l.items.some((i) => i.task);
        const items: Node[] = l.items.map((item) => {
          const inner = blocks(item.tokens);
          // listItem must start with a paragraph
          if (!inner.length || inner[0].type !== "paragraph") inner.unshift(paragraph([]));
          const node: Node = { type: isTask ? "taskItem" : "listItem", content: inner };
          if (isTask) node.attrs = { checked: !!item.checked };
          return node;
        });
        out.push({ type: isTask ? "taskList" : l.ordered ? "orderedList" : "bulletList", content: items });
        break;
      }
      case "table": {
        const tb = t as Tokens.Table;
        const rows = [tb.header, ...tb.rows];
        for (const row of rows) {
          out.push(paragraph(inline(row.flatMap((c, i) => (i ? [{ type: "text", raw: " | ", text: " | " } as Token, ...c.tokens] : c.tokens)))));
        }
        break;
      }
      case "html":
        out.push(paragraph([textNode(decode((t as Tokens.HTML).text).trim(), [])]));
        break;
      default:
        if ("raw" in t && typeof t.raw === "string" && t.raw.trim()) out.push(paragraph([textNode(t.raw.trim(), [])]));
    }
  }
  return out;
}

export function markdownToTiptap(md: string): { type: "doc"; content: Node[] } {
  const tokens = marked.lexer(md.replace(/\r\n/g, "\n"), { gfm: true });
  const content = blocks(tokens);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
