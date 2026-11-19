import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import {
  AtSignIcon,
  CheckSquareIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  LayoutTemplateIcon,
  Grid3x3Icon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  TableIcon,
  TextQuoteIcon,
} from "lucide-react";
import { makeSuggestionRender } from "./suggestion-render";
import type { SuggestionItem } from "./suggestion-list";

type CommandItem = SuggestionItem & {
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
};

/** エディタに画像を挿入するためのファイル選択を開く（detail.editor に対象エディタ） */
export const PICK_IMAGE_EVENT = "silo:pick-image";
/** テンプレートの一覧を開く */
export const OPEN_TEMPLATES_EVENT = "silo:open-templates";

const ITEMS: CommandItem[] = [
  {
    id: "h1",
    title: "見出し 1",
    keywords: ["h1", "heading", "midashi"],
    icon: <Heading1Icon className="size-4" />,
    run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run(),
  },
  {
    id: "h2",
    title: "見出し 2",
    keywords: ["h2", "heading", "midashi"],
    icon: <Heading2Icon className="size-4" />,
    run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run(),
  },
  {
    id: "h3",
    title: "見出し 3",
    keywords: ["h3", "heading", "midashi"],
    icon: <Heading3Icon className="size-4" />,
    run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run(),
  },
  {
    id: "bullet",
    title: "箇条書き",
    keywords: ["ul", "bullet", "list", "kajo"],
    icon: <ListIcon className="size-4" />,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    id: "ordered",
    title: "番号付きリスト",
    keywords: ["ol", "ordered", "number", "bango"],
    icon: <ListOrderedIcon className="size-4" />,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    id: "task",
    title: "チェックリスト",
    keywords: ["todo", "task", "check"],
    icon: <CheckSquareIcon className="size-4" />,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
  },
  {
    id: "quote",
    title: "引用",
    keywords: ["quote", "blockquote", "inyo"],
    icon: <TextQuoteIcon className="size-4" />,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    id: "hr",
    title: "区切り線",
    keywords: ["hr", "divider", "rule", "kugiri"],
    icon: <MinusIcon className="size-4" />,
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
  {
    id: "image",
    title: "画像",
    description: "画像をアップロード（貼り付け・ドロップでも可）",
    keywords: ["image", "img", "picture", "gazo", "photo"],
    icon: <ImageIcon className="size-4" />,
    run: (e, r) => {
      e.chain().focus().deleteRange(r).run();
      window.dispatchEvent(new CustomEvent(PICK_IMAGE_EVENT, { detail: { editor: e } }));
    },
  },
  {
    id: "table",
    title: "表",
    keywords: ["table", "hyo", "grid"],
    icon: <Grid3x3Icon className="size-4" />,
    run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "utterance",
    title: "発話表",
    description: "発話者・インサイト・補足の表（1 ページに 1 つ）",
    keywords: ["table", "utterance", "hatsuwa", "録画"],
    icon: <TableIcon className="size-4" />,
    run: (e, r) => {
      let exists = false;
      e.state.doc.descendants((n) => {
        if (n.type.name === "utteranceTable") exists = true;
        return !exists;
      });
      if (exists) {
        e.chain().focus().deleteRange(r).run();
        document.querySelector("[data-utterance-block]")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      e.chain().focus().deleteRange(r).insertContent({ type: "utteranceTable" }).run();
    },
  },
  {
    id: "template",
    title: "テンプレート",
    description: "保存したテンプレートをここに挿入",
    keywords: ["template", "tenpure", "ひな形"],
    icon: <LayoutTemplateIcon className="size-4" />,
    run: (e, r) => {
      e.chain().focus().deleteRange(r).run();
      window.dispatchEvent(new CustomEvent(OPEN_TEMPLATES_EVENT));
    },
  },
  {
    id: "mention",
    title: "インサイト参照",
    description: "@ でインサイト・ファクトを検索",
    keywords: ["insight", "mention", "ref", "sansho"],
    icon: <AtSignIcon className="size-4" />,
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent("@").run(),
  },
];

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion<CommandItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => {
          const q = query.toLowerCase();
          return ITEMS.filter(
            (i) => !q || i.title.toLowerCase().includes(q) || i.keywords.some((k) => k.includes(q))
          );
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: makeSuggestionRender<CommandItem>("コマンドがありません"),
      }),
    ];
  },
});
