import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { markdownToTiptap, tiptapToMarkdown } from "@/lib/markdown";
import { contextFrom, requireWriter, type SiloContext } from "./context";

/* ------------------------------------------------------------------
 * silo を Claude から扱うためのツール群。
 * - 読む：検索・リサーチ・インサイト・ドキュメント（すべて引用用の url 付き）
 * - 書く：ファクト／インサイトは「提案」として登録（人が silo で採用／却下）
 *         ドキュメントは silo のアクション（ドキュメント）に保存
 * ------------------------------------------------------------------ */

type Ctx = { http?: { authInfo?: import("@modelcontextprotocol/server").AuthInfo } };

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: `エラー: ${message}` }], isError: true });

function run<A>(fn: (args: A, c: SiloContext) => Promise<unknown>) {
  return async (args: A, ctx: Ctx) => {
    try {
      const c = contextFrom(ctx.http?.authInfo);
      return ok(await fn(args, c));
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };
}

const links = (c: SiloContext) => ({
  research: (id: string) => `${c.origin}/research/${id}`,
  insight: (id: string) => `${c.origin}/insights?node=${id}`,
  fact: (id: string, insightId?: string | null) =>
    insightId ? `${c.origin}/insights?node=${insightId}&fact=${id}` : `${c.origin}/insights?fact=${id}`,
  doc: (id: string) => `${c.origin}/actions/${id}`,
});

const like = (q: string) => `%${q.replace(/[%_,()]/g, " ").trim()}%`;

async function insightPaths(c: SiloContext) {
  const { data } = await c.supabase
    .from("insight")
    .select("id, parent_id, title, is_inbox, status")
    .is("deleted_at", null)
    .neq("status", "rejected");
  const byId = new Map((data ?? []).map((i) => [i.id, i]));
  const path = (id: string | null) => {
    const out: string[] = [];
    let cur = id ? byId.get(id) : undefined;
    while (cur) {
      out.unshift(cur.is_inbox ? "あとで分類する" : cur.title || "無題のテーマ");
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return out.join(" / ");
  };
  return { rows: data ?? [], byId, path };
}

export function registerSiloTools(server: McpServer) {
  /* ---------------- 検索 ---------------- */
  server.registerTool(
    "search_silo",
    {
      title: "silo を検索",
      description:
        "silo のリサーチ（面談記録）・ファクト（顧客が主語の具体的事実）・インサイト（ファクトを束ねたテーマ）・ドキュメントをキーワードで横断検索する。結果の url を引用に使う。",
      inputSchema: z.object({
        query: z.string().min(1).describe("検索語（日本語可）"),
        kinds: z
          .array(z.enum(["research", "fact", "insight", "document"]))
          .optional()
          .describe("絞り込み。省略時はすべて"),
        limit: z.number().int().min(1).max(50).optional().describe("種類ごとの最大件数（既定 10）"),
      }),
      annotations: { readOnlyHint: true },
    },
    run(async ({ query, kinds, limit = 10 }: { query: string; kinds?: string[]; limit?: number }, c) => {
      const want = (k: string) => !kinds || kinds.includes(k);
      const q = like(query);
      const L = links(c);
      const [r, f, i, d] = await Promise.all([
        want("research")
          ? c.supabase
              .from("research_file")
              .select("id, title, subject, status, updated_at")
              .is("deleted_at", null)
              .or(`title.ilike.${q},subject.ilike.${q}`)
              .order("updated_at", { ascending: false })
              .limit(limit)
          : null,
        want("fact")
          ? c.supabase
              .from("fact")
              .select("id, text, speaker, insight_id, research_id, status, research:research_id(title)")
              .is("deleted_at", null)
              .eq("status", "accepted")
              .or(`text.ilike.${q},note.ilike.${q}`)
              .limit(limit)
          : null,
        want("insight")
          ? c.supabase
              .from("insight")
              .select("id, title, importance, tags")
              .is("deleted_at", null)
              .eq("status", "accepted")
              .eq("is_inbox", false)
              .ilike("title", q)
              .limit(limit)
          : null,
        want("document")
          ? c.supabase
              .from("action")
              .select("id, title, template, updated_at")
              .is("deleted_at", null)
              .eq("type", "doc")
              .ilike("title", q)
              .limit(limit)
          : null,
      ]);
      return {
        research: (r?.data ?? []).map((x) => ({ id: x.id, title: x.title || "無題", subject: x.subject, status: x.status, url: L.research(x.id) })),
        facts: (f?.data ?? []).map((x) => ({
          id: x.id,
          text: x.text,
          speaker: x.speaker,
          research: (x.research as unknown as { title: string } | null)?.title ?? "",
          research_url: L.research(x.research_id),
          url: L.fact(x.id, x.insight_id),
        })),
        insights: (i?.data ?? []).map((x) => ({ id: x.id, title: x.title || "無題のテーマ", importance: x.importance, tags: x.tags, url: L.insight(x.id) })),
        documents: (d?.data ?? []).map((x) => ({ id: x.id, title: x.title || "名称未設定", url: L.doc(x.id) })),
      };
    })
  );

  /* ---------------- リサーチ ---------------- */
  server.registerTool(
    "list_research",
    {
      title: "リサーチ一覧",
      description: "silo のリサーチ（面談・インタビュー記録）を更新順に一覧する。フォルダ名・ステータスで絞り込める。",
      inputSchema: z.object({
        folder: z.string().optional().describe("フォルダ名（部分一致）"),
        status: z.enum(["1. 内容の記載", "2. ファクトとの紐付け", "3. 完了"]).optional(),
        limit: z.number().int().min(1).max(200).optional().describe("既定 50"),
        offset: z.number().int().min(0).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    run(async ({ folder, status, limit = 50, offset = 0 }: { folder?: string; status?: string; limit?: number; offset?: number }, c) => {
      const L = links(c);
      const { data: folders } = await c.supabase.from("folder").select("id, name");
      const fname = new Map((folders ?? []).map((f) => [f.id, f.name]));
      let q = c.supabase
        .from("research_file")
        .select("id, title, subject, status, tags, folder_id, updated_at")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (status) q = q.eq("status", status);
      if (folder) {
        const ids = (folders ?? []).filter((f) => f.name.includes(folder)).map((f) => f.id);
        q = q.in("folder_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: r.id,
        title: r.title || "無題",
        subject: r.subject,
        status: r.status,
        tags: r.tags,
        folder: r.folder_id ? fname.get(r.folder_id) ?? "" : "未分類",
        updated_at: r.updated_at,
        url: L.research(r.id),
      }));
    })
  );

  server.registerTool(
    "get_research",
    {
      title: "リサーチを読む",
      description:
        "リサーチ 1 件の全体を取得する：背景・インタビュー概要（Markdown）、発話表（発話者／顧客のインサイト／補足、各行の utterance_id）、登録済みファクトと AI 提案中のファクト。include_transcript=true で暗号化保存された議事録全文も読む（ファクト抽出時に使う）。",
      inputSchema: z.object({
        research_id: z.guid(),
        include_transcript: z.boolean().optional().describe("議事録全文を含める（長い場合は offset で続きを読む）"),
        transcript_offset: z.number().int().min(0).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    run(async ({ research_id, include_transcript, transcript_offset = 0 }: { research_id: string; include_transcript?: boolean; transcript_offset?: number }, c) => {
      const L = links(c);
      const [{ data: r, error }, { data: utt }, { data: facts }, { data: folders }] = await Promise.all([
        c.supabase
          .from("research_file")
          .select("id, title, subject, background, overview, tags, status, folder_id, updated_at")
          .eq("id", research_id)
          .is("deleted_at", null)
          .maybeSingle(),
        c.supabase.from("utterance").select("id, sort_order, speaker, insight_text, note").eq("research_id", research_id).order("sort_order"),
        c.supabase
          .from("fact")
          .select("id, text, speaker, note, quote, utterance_id, insight_id, status, source, insight:insight_id(title, is_inbox)")
          .eq("research_id", research_id)
          .is("deleted_at", null)
          .neq("status", "rejected")
          .order("created_at"),
        c.supabase.from("folder").select("id, name"),
      ]);
      if (error) throw new Error(error.message);
      if (!r) throw new Error("リサーチが見つかりません（削除済みか、閲覧権限がありません）");
      let transcript: { text: string; offset: number; next_offset: number | null; total: number } | null = null;
      if (include_transcript) {
        const { data: t } = await c.supabase.rpc("get_transcript", { p_research_id: research_id });
        const full = (t as string | null) ?? "";
        const CHUNK = 60_000;
        transcript = {
          text: full.slice(transcript_offset, transcript_offset + CHUNK),
          offset: transcript_offset,
          next_offset: transcript_offset + CHUNK < full.length ? transcript_offset + CHUNK : null,
          total: full.length,
        };
      }
      const folder = (folders ?? []).find((f) => f.id === r.folder_id)?.name ?? "未分類";
      const shape = (f: NonNullable<typeof facts>[number]) => {
        const ins = f.insight as unknown as { title: string; is_inbox: boolean } | null;
        return {
          id: f.id,
          text: f.text,
          speaker: f.speaker,
          note: f.note,
          quote: f.quote || undefined,
          utterance_id: f.utterance_id,
          insight: ins ? (ins.is_inbox ? "あとで分類する" : ins.title) : null,
          source: f.source,
          url: L.fact(f.id, f.insight_id),
        };
      };
      return {
        id: r.id,
        title: r.title || "無題",
        url: L.research(r.id),
        folder,
        subject: r.subject,
        tags: r.tags,
        status: r.status,
        updated_at: r.updated_at,
        background_markdown: tiptapToMarkdown(r.background),
        overview_markdown: tiptapToMarkdown(r.overview),
        utterances: (utt ?? []).map((u) => ({ utterance_id: u.id, speaker: u.speaker, insight: u.insight_text, note: u.note })),
        facts: (facts ?? []).filter((f) => f.status === "accepted").map(shape),
        proposed_facts: (facts ?? []).filter((f) => f.status === "proposed").map(shape),
        transcript,
      };
    })
  );

  /* ---------------- インサイト ---------------- */
  server.registerTool(
    "get_insight_tree",
    {
      title: "インサイトツリー",
      description: "インサイト（テーマ）の階層ツリー全体を、件数と url 付きで取得する。提案中（AI）のテーマも区別して返す。",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    run(async (_: Record<string, never>, c) => {
      const L = links(c);
      const [{ data: ins }, { data: facts }] = await Promise.all([
        c.supabase
          .from("insight")
          .select("id, parent_id, title, importance, tags, is_inbox, status, sort_order")
          .is("deleted_at", null)
          .neq("status", "rejected")
          .order("sort_order"),
        c.supabase.from("fact").select("insight_id").is("deleted_at", null).eq("status", "accepted"),
      ]);
      const count = new Map<string, number>();
      for (const f of facts ?? []) if (f.insight_id) count.set(f.insight_id, (count.get(f.insight_id) ?? 0) + 1);
      type N = { id: string; title: string; importance: string | null; tags: string[]; facts: number; proposed: boolean; url: string; children: N[] };
      const nodes = new Map<string, N>();
      for (const i of ins ?? [])
        nodes.set(i.id, {
          id: i.id,
          title: i.is_inbox ? "🔥 あとで分類する（未分類の受信箱）" : i.title || "無題のテーマ",
          importance: i.importance,
          tags: i.tags,
          facts: count.get(i.id) ?? 0,
          proposed: i.status === "proposed",
          url: L.insight(i.id),
          children: [],
        });
      const roots: N[] = [];
      for (const i of ins ?? []) {
        const n = nodes.get(i.id)!;
        const p = i.parent_id ? nodes.get(i.parent_id) : undefined;
        if (p) p.children.push(n);
        else roots.push(n);
      }
      return roots;
    })
  );

  server.registerTool(
    "get_insight",
    {
      title: "インサイトを読む",
      description: "インサイト（テーマ）1 件の詳細：階層のパス、子テーマ、束ねられたファクト（発話者・本文・元リサーチの url）を取得する。主張の根拠を示すときに使う。",
      inputSchema: z.object({ insight_id: z.guid() }),
      annotations: { readOnlyHint: true },
    },
    run(async ({ insight_id }: { insight_id: string }, c) => {
      const L = links(c);
      const { rows, byId, path } = await insightPaths(c);
      const node = byId.get(insight_id);
      if (!node) throw new Error("インサイトが見つかりません");
      const { data: full } = await c.supabase.from("insight").select("importance, tags, rationale, source").eq("id", insight_id).maybeSingle();
      const { data: facts } = await c.supabase
        .from("fact")
        .select("id, text, speaker, note, quote, research_id, updated_at, research:research_id(title)")
        .eq("insight_id", insight_id)
        .eq("status", "accepted")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      return {
        id: insight_id,
        title: node.is_inbox ? "あとで分類する" : node.title || "無題のテーマ",
        path: path(insight_id),
        status: node.status,
        importance: full?.importance ?? null,
        tags: full?.tags ?? [],
        rationale: full?.rationale || undefined,
        url: L.insight(insight_id),
        children: rows.filter((r) => r.parent_id === insight_id).map((r) => ({ id: r.id, title: r.title || "無題のテーマ", url: L.insight(r.id) })),
        facts: (facts ?? []).map((f) => ({
          id: f.id,
          text: f.text,
          speaker: f.speaker,
          note: f.note || undefined,
          quote: f.quote || undefined,
          research: (f.research as unknown as { title: string } | null)?.title ?? "",
          research_url: L.research(f.research_id),
          url: L.fact(f.id, insight_id),
        })),
      };
    })
  );

  /* ---------------- 提案（書き込み） ---------------- */
  server.registerTool(
    "propose_facts",
    {
      title: "ファクトを提案",
      description:
        "リサーチから抽出したファクトを silo に『AI 提案』として登録する（人がリサーチ詳細で採用／却下するまで正式データにならない）。1 件 = 顧客が主語の具体的な事実 1 つ。可能なら発話表の utterance_id と、議事録の原文 quote を必ず付ける。",
      inputSchema: z.object({
        research_id: z.guid(),
        facts: z
          .array(
            z.object({
              text: z.string().min(1).max(500).describe("ファクト本文（顧客が主語、解釈を混ぜない）"),
              speaker: z.string().max(100).optional().describe("発話者"),
              note: z.string().max(1000).optional().describe("背景・補足（なぜそう言ったか）"),
              quote: z.string().max(1000).optional().describe("根拠となる原文の引用"),
              utterance_id: z.guid().optional().describe("対応する発話表の行"),
            })
          )
          .min(1)
          .max(50),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run(async ({ research_id, facts }: { research_id: string; facts: Array<{ text: string; speaker?: string; note?: string; quote?: string; utterance_id?: string }> }, c) => {
      requireWriter(c);
      const { data: r } = await c.supabase.from("research_file").select("id, workspace_id, title").eq("id", research_id).maybeSingle();
      if (!r) throw new Error("リサーチが見つかりません");
      const rows = facts.map((f) => ({
        workspace_id: r.workspace_id,
        research_id,
        utterance_id: f.utterance_id ?? null,
        insight_id: null,
        text: f.text.trim(),
        speaker: f.speaker ?? "",
        note: f.note ?? "",
        quote: f.quote ?? "",
        status: "proposed",
        source: "claude",
        created_by: c.userId,
      }));
      const { data, error } = await c.supabase.from("fact").insert(rows).select("id, text");
      if (error) throw new Error(error.message);
      return {
        proposed: data?.length ?? 0,
        ids: (data ?? []).map((d) => d.id),
        review_url: links(c).research(research_id),
        next: "silo のリサーチ詳細の右側「AI 提案」で、採用／却下してもらってください。",
      };
    })
  );

  server.registerTool(
    "propose_insights",
    {
      title: "インサイトを提案",
      description:
        "ファクトの共通項を束ねたインサイト（テーマ）を silo に『AI 提案』として登録する。parent_id で既存テーマの下に置ける。fact_ids は採用時にこのテーマへ移るファクト（登録済み＝accepted のもの）。",
      inputSchema: z.object({
        insights: z
          .array(
            z.object({
              title: z.string().min(1).max(200).describe("顧客の課題・欲求として言い切る一文"),
              parent_id: z.guid().optional().describe("親テーマ（get_insight_tree の id）"),
              fact_ids: z.array(z.guid()).max(100).optional(),
              rationale: z.string().max(1000).optional().describe("なぜこれらを束ねたか"),
            })
          )
          .min(1)
          .max(30),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run(async ({ insights }: { insights: Array<{ title: string; parent_id?: string; fact_ids?: string[]; rationale?: string }> }, c) => {
      requireWriter(c);
      const rows = insights.map((i, n) => ({
        workspace_id: c.workspaceId,
        parent_id: i.parent_id ?? null,
        title: i.title.trim(),
        rationale: i.rationale ?? "",
        proposed_fact_ids: i.fact_ids ?? [],
        status: "proposed",
        source: "claude",
        sort_order: 10_000 + n,
        created_by: c.userId,
      }));
      const { data, error } = await c.supabase.from("insight").insert(rows).select("id, title");
      if (error) throw new Error(error.message);
      const L = links(c);
      return {
        proposed: (data ?? []).map((d) => ({ id: d.id, title: d.title, url: L.insight(d.id) })),
        review_url: `${c.origin}/insights`,
        next: "silo のインサイト画面の「AI 提案」で、採用／却下してもらってください。",
      };
    })
  );

  /* ---------------- ドキュメント ---------------- */
  server.registerTool(
    "list_documents",
    {
      title: "ドキュメント一覧",
      description: "silo のアクションにあるドキュメント（企画書・提案・メモなど）を更新順に一覧する。",
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }),
      annotations: { readOnlyHint: true },
    },
    run(async ({ limit = 30 }: { limit?: number }, c) => {
      const L = links(c);
      const { data, error } = await c.supabase
        .from("action")
        .select("id, title, source, updated_at")
        .eq("type", "doc")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((d) => ({ id: d.id, title: d.title || "名称未設定", source: d.source, updated_at: d.updated_at, url: L.doc(d.id) }));
    })
  );

  server.registerTool(
    "get_document",
    {
      title: "ドキュメントを読む",
      description: "silo のドキュメント 1 件を Markdown で取得する（引用元の一覧付き）。",
      inputSchema: z.object({ document_id: z.guid() }),
      annotations: { readOnlyHint: true },
    },
    run(async ({ document_id }: { document_id: string }, c) => {
      const { data, error } = await c.supabase
        .from("action")
        .select("id, title, type, content, source, source_refs, updated_at")
        .eq("id", document_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || data.type !== "doc") throw new Error("ドキュメントが見つかりません");
      return {
        id: data.id,
        title: data.title || "名称未設定",
        url: links(c).doc(data.id),
        source: data.source,
        updated_at: data.updated_at,
        markdown: tiptapToMarkdown(data.content),
        sources: data.source_refs,
      };
    })
  );

  const refSchema = z.object({ kind: z.enum(["research", "fact", "insight"]), id: z.guid() });

  server.registerTool(
    "create_document",
    {
      title: "ドキュメントを作成",
      description:
        "silo のアクションにドキュメントを作成する。本文は Markdown。根拠にした箇所には silo の url へのリンク（[タイトル](url)）を本文中に入れ、sources に引用したリサーチ／ファクト／インサイトの id を渡す。作成前に、目的・読み手・形式・範囲をユーザーに確認すること。",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        markdown: z.string().min(1).max(200_000),
        sources: z.array(refSchema).max(500).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run(async ({ title, markdown, sources = [] }: { title: string; markdown: string; sources?: Array<{ kind: string; id: string }> }, c) => {
      requireWriter(c);
      const { data, error } = await c.supabase
        .from("action")
        .insert({
          workspace_id: c.workspaceId,
          type: "doc",
          template: "doc",
          title: title.trim(),
          content: markdownToTiptap(markdown),
          source: "claude",
          source_refs: sources,
          created_by: c.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: data.id, url: links(c).doc(data.id), next: "このリンクをユーザーに伝え、silo 上で確認・編集できることを案内してください。" };
    })
  );

  server.registerTool(
    "update_document",
    {
      title: "ドキュメントを更新",
      description: "silo のドキュメントのタイトルや本文（Markdown 全体の置き換え）を更新する。人が silo で編集している可能性があるので、更新前に get_document で最新を読むこと。",
      inputSchema: z.object({
        document_id: z.guid(),
        title: z.string().min(1).max(200).optional(),
        markdown: z.string().min(1).max(200_000).optional(),
        sources: z.array(refSchema).max(500).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    run(async ({ document_id, title, markdown, sources }: { document_id: string; title?: string; markdown?: string; sources?: Array<{ kind: string; id: string }> }, c) => {
      requireWriter(c);
      const patch: Record<string, unknown> = {};
      if (title) patch.title = title.trim();
      if (markdown) patch.content = markdownToTiptap(markdown);
      if (sources) patch.source_refs = sources;
      if (!Object.keys(patch).length) throw new Error("更新する項目がありません");
      const { data, error } = await c.supabase.from("action").update(patch).eq("id", document_id).eq("type", "doc").select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("ドキュメントが見つかりません");
      return { id: data.id, url: links(c).doc(data.id) };
    })
  );
}

export const SILO_INSTRUCTIONS = `silo は for Crafts のリサーチ管理ツールです。データは 3 層です：
リサーチ（商談・インタビューの記録：背景、概要、発話表、暗号化された議事録）→ ファクト（顧客が主語の具体的な事実。1 件 1 事実）→ インサイト（複数のファクトを束ねた顧客の課題・欲求。階層ツリー）。ドキュメントはチームが企画・提案をまとめたページです。

【いつ使うか】企画書・提案書・PRD・営業資料の作成やレビュー、優先順位づけ、「顧客は〜のはず」という仮説の検証、インタビュー準備のときは、頼まれなくても silo を検索して根拠を探してください。方向性は get_insight_tree / get_insight、個別の根拠は search_silo（facts）、一次情報は get_research を使います。

【引用のルール】silo の内容に触れるときは必ず [タイトル](url) の形でリンクを付け、根拠までたどれるようにします。silo に根拠がある主張と、根拠のない推測は文中で区別して書きます（推測には「仮説」と明記）。

【ファクト・インサイトの抽出】get_research（include_transcript=true）で原文を読み、
- ファクト：顧客が主語の具体的な事実だけ（解釈・提案は入れない）。発話表の utterance_id と原文 quote を付けて propose_facts で提案。既存ファクトと重複させない。
- インサイト：get_insight_tree で既存テーマを確認し、当てはまる既存テーマがなければ、顧客の課題・欲求として言い切る一文で propose_insights（fact_ids と rationale 付き）。
どちらも「AI 提案」として入り、人が silo で採用／却下します。登録後は review_url をユーザーに伝えてください。

【ドキュメント作成】書き始める前に、目的・読み手・形式（企画書／提案書／レポート等）・対象範囲（どのリサーチやテーマを使うか）・分量をユーザーに質問して確認します（質問ツールがあれば選択式で 2〜4 問）。そのうえで silo を検索して材料を集め、根拠リンク付きの Markdown で create_document に保存し、url を伝えます。材料が足りない論点は「要調査」と明記します。`;
