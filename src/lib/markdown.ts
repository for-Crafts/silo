/**
 * Markdown ⇄ Tiptap JSON の変換（silo のエディタと Claude 連携の両方で使う）。
 * 対応：見出し・段落・箇条書き／番号／チェックリスト・引用・区切り線・コード・表・太字／斜体／取り消し／コード／リンク・インサイト参照（mention）
 */
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
        const cell = (c: Tokens.TableCell, header: boolean): Node => ({
          type: header ? "tableHeader" : "tableCell",
          content: [paragraph(inline(c.tokens))],
        });
        out.push({
          type: "table",
          content: [
            { type: "tableRow", content: tb.header.map((c) => cell(c, true)) },
            ...tb.rows.map((r) => ({ type: "tableRow", content: r.map((c) => cell(c, false)) })),
          ],
        });
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

// ---------------------------------------------------------------
// Tiptap JSON -> Markdown
// ---------------------------------------------------------------
type AnyNode = { type?: string; attrs?: Record<string, unknown>; content?: AnyNode[]; text?: string; marks?: Mark[] };

function inlineMd(nodes: AnyNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      if (n.type === "mention") {
        const label = String(n.attrs?.label ?? n.attrs?.id ?? "");
        const href = n.attrs?.href ? String(n.attrs.href) : "";
        return href ? `[@${label}](${href})` : `@${label}`;
      }
      if (n.type === "image") return `![画像](${String(n.attrs?.src ?? "")})`;
      let t = n.text ?? "";
      for (const m of n.marks ?? []) {
        if (m.type === "bold") t = `**${t}**`;
        else if (m.type === "italic") t = `*${t}*`;
        else if (m.type === "strike") t = `~~${t}~~`;
        else if (m.type === "code") t = "`" + t + "`";
        else if (m.type === "link") t = `[${t}](${String(m.attrs?.href ?? "")})`;
      }
      return t;
    })
    .join("");
}

function blockMd(n: AnyNode, indent = ""): string {
  const kids = n.content ?? [];
  switch (n.type) {
    case "doc":
      return kids.map((k) => blockMd(k, indent)).filter(Boolean).join("\n\n");
    case "paragraph":
      return indent + inlineMd(kids);
    case "heading":
      return "#".repeat(Number(n.attrs?.level ?? 2)) + " " + inlineMd(kids);
    case "blockquote":
      return kids.map((k) => blockMd(k)).join("\n\n").split("\n").map((l) => "> " + l).join("\n");
    case "horizontalRule":
      return "---";
    case "codeBlock":
      return "```\n" + inlineMd(kids) + "\n```";
    case "bulletList":
    case "orderedList":
    case "taskList":
      return kids
        .map((item, i) => {
          const bullet =
            n.type === "orderedList" ? `${i + 1}. ` : n.type === "taskList" ? `- [${item.attrs?.checked ? "x" : " "}] ` : "- ";
          const [first, ...rest] = item.content ?? [];
          const head = indent + bullet + (first ? inlineMd(first.content) : "");
          const tail = rest.map((r) => blockMd(r, indent + "  ")).filter(Boolean);
          return [head, ...tail].join("\n");
        })
        .join("\n");
    case "table": {
      const rows = kids.map((r) => (r.content ?? []).map((c) => inlineMd((c.content ?? []).flatMap((p) => p.content ?? [])).replace(/\|/g, "\\|")));
      if (!rows.length) return "";
      const head = `| ${rows[0].join(" | ")} |`;
      const sep = `| ${rows[0].map(() => "---").join(" | ")} |`;
      return [head, sep, ...rows.slice(1).map((r) => `| ${r.join(" | ")} |`)].join("\n");
    }
    case "image":
      return `![画像](${String(n.attrs?.src ?? "")})`;
    default:
      return kids.length ? kids.map((k) => blockMd(k, indent)).join("\n") : inlineMd([n]);
  }
}

/** Tiptap JSON（null 可）を Markdown にする。Claude に渡す本文用 */
export function tiptapToMarkdown(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  return blockMd(doc as AnyNode).trim();
}
