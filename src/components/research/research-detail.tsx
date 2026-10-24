"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Editor, JSONContent } from "@tiptap/react";
import {
  CalendarClockIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FolderIcon,
  MoreHorizontalIcon,
  TagIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useMemberEmail, useWorkspace } from "@/components/app/workspace-context";
import { resetSaveStatus } from "@/lib/save-status";
import { usePatchQueue } from "@/lib/patch-queue";
import { uploadImage } from "@/lib/media";
import { SAVE_ERROR, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RESEARCH_STATUSES, type FactWithInsight, type Folder, type ResearchFile, type Utterance } from "@/lib/types";
import { RichEditor } from "@/components/editor/rich-editor";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { PICK_IMAGE_EVENT } from "@/components/editor/slash-command";
import { insertImageFiles, type UploadFn } from "@/components/editor/research-image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UtteranceTable } from "./utterance-table";
import { TranscriptSheet } from "./research-transcript";

export type { FactWithInsight };

type Props = {
  research: ResearchFile;
  folders: Folder[];
  utterances: Utterance[];
  facts: FactWithInsight[];
  hasTranscript: boolean;
};

type Patchable = Pick<ResearchFile, "title" | "subject" | "background" | "overview" | "tags" | "status" | "folder_id">;

export function ResearchDetail({ research, folders, utterances, facts: initialFacts, hasTranscript }: Props) {
  const router = useRouter();
  const { userId, workspaceId } = useWorkspace();
  const emailOf = useMemberEmail();

  const [title, setTitle] = useState(research.title);
  const [subject, setSubject] = useState(research.subject);
  const [tags, setTags] = useState<string[]>(research.tags);
  const [status, setStatus] = useState(research.status);
  const [folderId, setFolderId] = useState<string | null>(research.folder_id);
  const [facts, setFacts] = useState<FactWithInsight[]>(initialFacts);
  const [meta, setMeta] = useState({ updated_at: research.updated_at, updated_by: research.updated_by });
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const backgroundEditor = useRef<Editor | null>(null);

  useEffect(() => {
    resetSaveStatus();
    return () => resetSaveStatus();
  }, []);

  // 変更はすべて 1 本のキューに集約し、まとめて 1 リクエストで保存する
  const { queue } = usePatchQueue<Patchable>(async (fields) => {
    const { data, error } = await createClient()
      .from("research_file")
      .update({ ...fields, updated_by: userId })
      .eq("id", research.id)
      .select("updated_at, updated_by")
      .single();
    if (error || !data) return false;
    setMeta(data);
    return true;
  });

  const upload: UploadFn = useCallback(
    (file) => uploadImage(file, { workspaceId, researchId: research.id }),
    [workspaceId, research.id]
  );

  // ツールバー・スラッシュメニューの「画像」→ ファイル選択
  const fileInput = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<Editor | null>(null);
  useEffect(() => {
    const onPick = (e: Event) => {
      pickTarget.current = (e as CustomEvent<{ editor: Editor }>).detail.editor;
      fileInput.current?.click();
    };
    window.addEventListener(PICK_IMAGE_EVENT, onPick);
    return () => window.removeEventListener(PICK_IMAGE_EVENT, onPick);
  }, []);

  const folder = folders.find((f) => f.id === folderId);
  const toolbarEditor = activeEditor ?? backgroundEditor.current;

  async function deleteResearch() {
    const { error } = await createClient()
      .from("research_file")
      .update({ deleted_at: new Date().toISOString(), updated_by: userId })
      .eq("id", research.id);
    if (error) return toast.error(SAVE_ERROR);
    toast.success("削除しました（30 日以内なら復元できます）");
    router.push(folderId ? `/research?folder=${folderId}` : "/research");
  }

  return (
    <div className="h-full overflow-auto">
      <main className="mx-auto w-full max-w-[1200px] px-10 pb-20 pt-7">
        <Link
          href={folder ? `/research?folder=${folder.id}` : "/research"}
          className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-blue-600"
        >
          <ChevronLeftIcon className="size-3.5" />
          {folder ? `「${folder.name}」に戻る` : "すべてのリサーチに戻る"}
        </Link>

        <div className="mt-5 flex items-center justify-between">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-green-100" aria-label="リサーチ">
            <ClipboardListIcon className="size-[18px] text-green-700" />
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="その他の操作"
                className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
              >
                <MoreHorizontalIcon className="size-[18px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={deleteResearch}>
                このリサーチを削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <TitleInput
          value={title}
          onChange={(v) => {
            setTitle(v);
            queue({ title: v });
          }}
          onEnter={() => backgroundEditor.current?.commands.focus("start")}
        />

        {/* メタ情報（Centou 準拠：ラベル列 128px） */}
        <div className="mt-[22px] grid grid-cols-[128px_minmax(0,1fr)] items-center gap-x-3 gap-y-3.5 text-[13px]">
          <MetaLabel icon={<FolderIcon />}>フォルダ</MetaLabel>
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="chip hover:bg-zinc-200">
                  {folder?.name ?? "未分類"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => {
                    setFolderId(null);
                    queue({ folder_id: null }, true);
                  }}
                >
                  未分類
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {folders.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onSelect={() => {
                      setFolderId(f.id);
                      queue({ folder_id: f.id }, true);
                    }}
                  >
                    {f.name}
                    {f.id === folderId && <CheckIcon className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <MetaLabel icon={<UsersIcon />}>対象者</MetaLabel>
          <div>
            <label htmlFor="subject" className="sr-only">
              対象者
            </label>
            <input
              id="subject"
              value={subject}
              placeholder="例：株式会社〇〇 購買部"
              onChange={(e) => {
                setSubject(e.target.value);
                queue({ subject: e.target.value });
              }}
              className="chip w-[260px] outline-none placeholder:text-zinc-400 focus:bg-zinc-200/70"
            />
          </div>

          <MetaLabel icon={<TagIcon />}>リサーチタグ</MetaLabel>
          <TagEditor
            tags={tags}
            onChange={(next) => {
              setTags(next);
              queue({ tags: next }, true);
            }}
          />

          <MetaLabel icon={<CheckIcon />}>ステータス</MetaLabel>
          <div className="flex flex-wrap items-center gap-[18px]">
            {RESEARCH_STATUSES.map((s, i) => {
              const reached = RESEARCH_STATUSES.indexOf(status as (typeof RESEARCH_STATUSES)[number]) >= i;
              const current = s === status;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatus(s);
                    queue({ status: s }, true);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs",
                    current ? "font-medium text-zinc-950" : "text-zinc-500 hover:text-zinc-800"
                  )}
                >
                  {reached ? (
                    <CheckIcon className="size-3.5 text-green-700" strokeWidth={2.5} />
                  ) : (
                    <span className="inline-block size-3.5 rounded-full border-[1.5px] border-zinc-400" />
                  )}
                  {s}
                </button>
              );
            })}
          </div>

          <MetaLabel icon={<CalendarClockIcon />}>最終更新</MetaLabel>
          <div className="text-xs text-zinc-700">{formatDateTime(meta.updated_at)}</div>

          <MetaLabel icon={<UserIcon />}>作成者・更新者</MetaLabel>
          <div className="flex items-center gap-1.5 text-xs text-zinc-700">
            <Avatar email={emailOf(research.created_by)} />
            {emailOf(research.created_by) || "—"}
            {meta.updated_by && meta.updated_by !== research.created_by && (
              <>
                <span className="text-zinc-400">/</span>
                <Avatar email={emailOf(meta.updated_by)} />
                {emailOf(meta.updated_by)}
              </>
            )}
          </div>
        </div>

        <div className="mb-2 mt-[26px] h-px bg-zinc-200" />

        <div className="flex flex-wrap items-start gap-12">
          <div className="min-w-0 flex-[999_1_520px]">
            <EditorToolbar editor={toolbarEditor} />
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                const target = pickTarget.current ?? toolbarEditor;
                if (target && files.length) insertImageFiles(target, files, upload);
                e.target.value = "";
              }}
            />

            <div className="text-[15px] leading-[1.75]">
              <h2 className="mb-1.5 mt-1 text-xl font-bold">背景</h2>
              <RichEditor
                content={(research.background as JSONContent) ?? null}
                placeholder="面談の背景・目的。「/」でメニュー、画像は貼り付け・ドロップ"
                onChange={(v) => queue({ background: v })}
                upload={upload}
                onFocusEditor={setActiveEditor}
                onReady={(e) => {
                  backgroundEditor.current = e;
                  setActiveEditor((cur) => cur ?? e);
                }}
              />

              <h2 className="mb-1.5 mt-[26px] text-xl font-bold">インタビュー概要</h2>
              <RichEditor
                content={(research.overview as JSONContent) ?? null}
                placeholder="インタビュワー・対象者・データの場所など。「/」でメニュー"
                onChange={(v) => queue({ overview: v })}
                upload={upload}
                onFocusEditor={setActiveEditor}
              />

              <UtteranceTable
                researchId={research.id}
                initialUtterances={utterances}
                facts={facts}
                setFacts={setFacts}
              />

              <TranscriptSheet researchId={research.id} initialHasTranscript={hasTranscript} />
            </div>
          </div>

          <RelatedFacts facts={facts} emailOf={emailOf} />
        </div>
      </main>
    </div>
  );
}

function TitleInput({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      autoFocus={!value}
      aria-label="タイトル"
      placeholder="無題のリサーチ"
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter();
        }
      }}
      className="mt-[18px] w-full resize-none overflow-hidden bg-transparent text-[28px] font-bold leading-[1.3] tracking-[-0.02em] outline-none placeholder:text-zinc-300"
    />
  );
}

function MetaLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-zinc-600 [&_svg]:size-[15px] [&_svg]:shrink-0">
      {icon}
      {children}
    </span>
  );
}

function Avatar({ email }: { email: string }) {
  return (
    <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-zinc-200 text-[8px] font-semibold text-zinc-700">
      {(email || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
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

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "たった今";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 時間前`;
  return formatDateTime(iso);
}

function RelatedFacts({ facts, emailOf }: { facts: FactWithInsight[]; emailOf: (id: string | null | undefined) => string }) {
  return (
    <aside className="flex min-w-[260px] flex-[0_1_300px] flex-col gap-1.5 pt-3">
      <Link href="/insights" className="text-[13px] font-bold text-blue-600">
        関連するファクト({facts.length})
      </Link>
      {facts.length === 0 && (
        <p className="py-3 text-xs leading-relaxed text-zinc-500">
          まだファクトがありません。発話表の ✓ を押すと、ここに追加されます
        </p>
      )}
      {facts.map((f) => {
        const label = f.insight ? (f.insight.is_inbox ? "🔥 あとで分類する" : f.insight.title || "無題") : "未分類";
        return (
          <Link
            key={f.id}
            href={f.insight_id ? `/insights?node=${f.insight_id}&fact=${f.id}` : `/insights?fact=${f.id}`}
            className="flex flex-col gap-2.5 border-b border-zinc-100 pb-[22px] pt-3.5 hover:[&_.fact-text]:text-blue-700"
          >
            {f.note && (
              <div className="line-clamp-3 border-l-2 border-zinc-200 py-0.5 pl-3 text-xs leading-relaxed text-zinc-500">
                {f.note}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-5 items-center gap-1 rounded bg-zinc-100 px-1.5 text-[10.5px] text-zinc-700">
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-zinc-200 text-[7px] font-semibold">
                  {(f.speaker || "?").slice(0, 2)}
                </span>
                {f.speaker || "発話者未設定"}
              </span>
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded px-1.5 text-[10.5px]",
                  f.insight?.is_inbox ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-700"
                )}
              >
                {label}
              </span>
            </div>
            <div className="fact-text text-[13px] font-bold leading-[1.55]">{f.text}</div>
            <div className="text-[11px] text-zinc-400">
              {relative(f.created_at)}
              {f.created_by && ` · ${emailOf(f.created_by)}`}
            </div>
          </Link>
        );
      })}
      <Link href="/insights" className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-blue-600">
        インサイトツリーで整理する
        <ChevronRightIcon className="size-3" />
      </Link>
    </aside>
  );
}
