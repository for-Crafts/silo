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
  SparklesIcon,
  FolderIcon,
  MoreHorizontalIcon,
  TagIcon,
  UserIcon,
  UsersIcon,
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
import { TagEditor } from "@/components/app/tag-editor";

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
  const { userId, workspaceId, inboxInsightId } = useWorkspace();
  const emailOf = useMemberEmail();

  const [title, setTitle] = useState(research.title);
  const [subject, setSubject] = useState(research.subject);
  const [tags, setTags] = useState<string[]>(research.tags);
  const [status, setStatus] = useState(research.status);
  const [folderId, setFolderId] = useState<string | null>(research.folder_id);
  // 登録済み（accepted）と、Claude の提案（proposed）を分けて持つ
  const [facts, setFacts] = useState<FactWithInsight[]>(() => initialFacts.filter((f) => (f.status ?? "accepted") === "accepted"));
  const [proposals, setProposals] = useState<FactWithInsight[]>(() => initialFacts.filter((f) => f.status === "proposed"));

  /** 提案を採用（→ 受信箱「あとで分類する」へ）または却下。画面を先に更新して裏で保存 */
  async function decideProposals(targets: FactWithInsight[], accept: boolean) {
    if (!targets.length) return;
    const ids = new Set(targets.map((t) => t.id));
    const taken = new Set(facts.map((f) => f.utterance_id).filter(Boolean));
    // 同じ発話にすでに登録済みのファクトがあるものは、採用できない（発話 1 行 = ファクト 1 件）
    const blocked = accept ? targets.filter((t) => t.utterance_id && taken.has(t.utterance_id)) : [];
    const go = targets.filter((t) => !blocked.includes(t));
    setProposals((ps) => ps.filter((p) => !ids.has(p.id) || blocked.includes(p)));
    if (accept)
      setFacts((fs) => [
        ...go.map((t) => ({
          ...t,
          status: "accepted" as const,
          insight_id: t.insight_id ?? inboxInsightId,
          insight: t.insight ?? (inboxInsightId ? { id: inboxInsightId, title: "", is_inbox: true } : null),
        })),
        ...fs,
      ]);
    const supabase = createClient();
    const results = await Promise.all(
      go.map((t) =>
        supabase
          .from("fact")
          .update(accept ? { status: "accepted", insight_id: t.insight_id ?? inboxInsightId } : { status: "rejected", deleted_at: new Date().toISOString() })
          .eq("id", t.id)
      )
    );
    if (results.some((r) => r.error)) {
      toast.error(SAVE_ERROR);
      router.refresh();
    } else if (go.length) toast.success(accept ? `${go.length} 件を採用しました（「あとで分類する」へ）` : `${go.length} 件を却下しました`);
    if (blocked.length) toast(`${blocked.length} 件は同じ発話のファクトが登録済みのため採用できませんでした`);
  }
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

          <RelatedFacts facts={facts} proposals={proposals} onDecide={decideProposals} emailOf={emailOf} />
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

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "たった今";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 時間前`;
  return formatDateTime(iso);
}

function RelatedFacts({
  facts,
  proposals,
  onDecide,
  emailOf,
}: {
  facts: FactWithInsight[];
  proposals: FactWithInsight[];
  onDecide: (targets: FactWithInsight[], accept: boolean) => void;
  emailOf: (id: string | null | undefined) => string;
}) {
  return (
    <aside className="flex min-w-[260px] flex-[0_1_300px] flex-col gap-1.5 pt-3">
      {proposals.length > 0 && (
        <section aria-label="AI 提案" className="mb-4 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-violet-800">
              <SparklesIcon className="size-3.5" />
              AI 提案（{proposals.length}）
            </span>
            <div className="flex gap-1">
              <button type="button" onClick={() => onDecide(proposals, true)} className="h-6 rounded px-2 text-[11px] font-medium text-violet-800 hover:bg-violet-100">
                すべて採用
              </button>
              <button type="button" onClick={() => onDecide(proposals, false)} className="h-6 rounded px-2 text-[11px] text-zinc-500 hover:bg-violet-100">
                すべて却下
              </button>
            </div>
          </div>
          <p className="mb-2 text-[11px] leading-relaxed text-violet-900/70">Claude が議事録から抽出した候補です。採用すると「あとで分類する」に入ります</p>
          <ul className="flex flex-col gap-2">
            {proposals.map((p) => (
              <li key={p.id} className="rounded-md border border-violet-100 bg-white p-2.5">
                {p.quote && (
                  <div className="mb-1.5 line-clamp-3 border-l-2 border-violet-200 pl-2 text-[11px] leading-relaxed text-zinc-500">{p.quote}</div>
                )}
                <div className="text-[13px] font-bold leading-snug">{p.text}</div>
                {(p.speaker || p.note) && (
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {p.speaker}
                    {p.speaker && p.note && " · "}
                    {p.note}
                  </div>
                )}
                <div className="mt-2 flex justify-end gap-1">
                  <button type="button" onClick={() => onDecide([p], false)} className="h-7 rounded-md px-2.5 text-xs text-zinc-600 hover:bg-zinc-100">
                    却下
                  </button>
                  <button type="button" onClick={() => onDecide([p], true)} className="inline-flex h-7 items-center gap-1 rounded-md bg-zinc-950 px-2.5 text-xs font-medium text-white hover:bg-zinc-800">
                    <CheckIcon className="size-3" />
                    採用
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
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
