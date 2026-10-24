import type { ActionTemplate } from "@/lib/types";

export type BoardNote = {
  id: string;
  x: number;
  y: number;
  /** 未指定なら既定サイズ（付箋 180×120） */
  w?: number;
  h?: number;
  text: string;
  color: NoteColor;
  /** note=付箋、text=背景なしの文字 */
  kind?: "note" | "text";
  size?: "s" | "m" | "l";
  insightId?: string | null;
  insightTitle?: string | null;
};
export type BoardFrame = { id: string; x: number; y: number; w: number; h: number; title: string; color?: NoteColor };
export type BoardEdge = { id: string; from: string; to: string };
export type BoardContent = { notes: BoardNote[]; frames: BoardFrame[]; edges?: BoardEdge[] };

export type MindNode = {
  id: string;
  text: string;
  children: MindNode[];
  color?: NoteColor | null;
  collapsed?: boolean;
  insightId?: string | null;
  insightTitle?: string | null;
};
export type MindmapContent = { root: MindNode };

export const NOTE_COLORS = {
  yellow: { bg: "#fef9c3", border: "#fde047" },
  blue: { bg: "#dbeafe", border: "#93c5fd" },
  green: { bg: "#dcfce7", border: "#86efac" },
  pink: { bg: "#fce7f3", border: "#f9a8d4" },
  gray: { bg: "#f4f4f5", border: "#d4d4d8" },
} as const;
export type NoteColor = keyof typeof NOTE_COLORS;

const uid = () => crypto.randomUUID();

export const TEMPLATES: Array<{
  key: ActionTemplate;
  name: string;
  short: string;
  desc: string;
  preview: string;
  glyph: string;
  type: "board" | "doc";
}> = [
  { key: "blank", name: "空白のホワイトボード", short: "空白", desc: "付箋を自由に並べる", preview: "空白", glyph: "▦", type: "board" },
  { key: "flow", name: "ユーザーの行動フロー", short: "行動フロー", desc: "フェーズごとに行動と課題を整理", preview: "▭ → ▭ → ▭ → ▭", glyph: "⤳", type: "board" },
  { key: "persona", name: "ターゲット像（ペルソナ）", short: "ペルソナ", desc: "基本情報・ゴール・ペイン・行動の4象限", preview: "⊞ 2×2", glyph: "☺", type: "board" },
  {
    key: "mindmap",
    name: "マインドマップ（ロジックツリー）",
    short: "マインドマップ",
    desc: "中心の問いから枝分かれで分解。インサイトを葉に貼る",
    preview: "● ─┬─ ○ ─┬─ ○\n　　 ├─ ○ └─ ○\n　　 └─ ○",
    glyph: "⑂",
    type: "board",
  },
  { key: "doc", name: "ドキュメント", short: "ドキュメント", desc: "@でインサイトを引用しながら書く", preview: "≡ 本文", glyph: "≡", type: "doc" },
];

export const templateOf = (key: string | null | undefined) => TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];

export function initialContent(key: ActionTemplate): unknown {
  switch (key) {
    case "flow": {
      const phases = ["① きっかけ", "② 情報収集", "③ 比較・選定", "④ 実行・振り返り"];
      return {
        notes: [],
        frames: phases.map((title, i) => ({ id: uid(), x: 40 + i * 300, y: 40, w: 280, h: 620, title })),
      } satisfies BoardContent;
    }
    case "persona": {
      const cells = ["基本情報（役割・組織・状況）", "ゴール（達成したいこと）", "ペイン（困りごと・障壁）", "行動（今やっていること）"];
      return {
        notes: [],
        frames: cells.map((title, i) => ({ id: uid(), x: 40 + (i % 2) * 520, y: 40 + Math.floor(i / 2) * 360, w: 500, h: 340, title })),
      } satisfies BoardContent;
    }
    case "mindmap":
      return { root: { id: uid(), text: "", children: [] } } satisfies MindmapContent;
    case "doc":
      return { type: "doc", content: [{ type: "paragraph" }] };
    default:
      return { notes: [], frames: [] } satisfies BoardContent;
  }
}
