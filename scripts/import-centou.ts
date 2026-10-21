/**
 * Import a Centou export (data.json) into silo.
 *
 * Usage:
 *   SEED_EMAIL=you@example.com SUPABASE_SERVICE_ROLE_KEY=... pnpm import:centou <path/to/data.json> [--dry-run]
 *
 * Mapping:
 *   frontmatter.centou_file_id -> research_file.ext_id (duplicates skipped)
 *   folder_name                -> folder (created if missing)
 *   "## 背景"                   -> research_file.background (Tiptap JSON)
 *   "## インタビュー概要" + "## データ" -> research_file.overview
 *   remaining body             -> transcript (encrypted via admin_set_transcript)
 *   "| 発話者 | ... |" rows     -> utterance
 *   "### all > A > B" + bullets -> insight tree + fact (also creates a linked utterance per fact)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { markdownToTiptap } from "./md-to-tiptap";

config({ path: ".env.local" });

type ExportItem = { id: string; title: string; folder_name: string; content: string };

type Parsed = {
  extId: string;
  title: string;
  folderName: string;
  subject: string;
  updatedAt: string | null;
  status: string;
  backgroundMd: string;
  overviewMd: string;
  transcript: string;
  utterances: { speaker: string; insight_text: string; note: string }[];
  facts: { path: string[]; text: string; note: string }[];
};

const INBOX_PATHS = new Set(["all", "(ルート)", ""]);

function parseFrontmatter(md: string): { fm: Record<string, string>; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, body: md };
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fm, body: md.slice(m[0].length) };
}

/** Split markdown into sections keyed by heading line (level 1-2 only). */
function splitSections(body: string): { heading: string; level: number; text: string }[] {
  const lines = body.split("\n");
  const sections: { heading: string; level: number; text: string }[] = [{ heading: "", level: 0, text: "" }];
  for (const line of lines) {
    const m = line.match(/^(#{1,2}) (.+)$/);
    if (m) sections.push({ heading: m[2].trim(), level: m[1].length, text: "" });
    else sections[sections.length - 1].text += line + "\n";
  }
  return sections;
}

/** Keep the leading bullet/sub-heading paragraphs of a meta section; everything after is interview body. */
function splitMeta(text: string): { head: string; tail: string } {
  const paras = text.split(/\n\s*\n/);
  const head: string[] = [];
  let i = 0;
  for (; i < paras.length; i++) {
    const first = paras[i].trimStart();
    if (!first) continue;
    if (first.startsWith("- ") || first.startsWith("### ") || first === "---") head.push(paras[i]);
    else break;
  }
  return { head: head.join("\n\n"), tail: paras.slice(i).join("\n\n") };
}

function stripBold(s: string) {
  return s.replace(/^\*\*([\s\S]*)\*\*$/, "$1").replace(/\*\*/g, "").trim();
}

function parseItem(item: ExportItem): Parsed {
  const { fm, body } = parseFrontmatter(item.content);
  const aiIdx = body.indexOf("# AIエージェント向け構造化セクション");
  const mainBody = aiIdx >= 0 ? body.slice(0, aiIdx) : body;
  const aiBody = aiIdx >= 0 ? body.slice(aiIdx) : "";

  const sections = splitSections(mainBody);
  let backgroundMd = "";
  let overviewMd = "";
  const rest: string[] = [];
  let subject = "";
  for (const s of sections) {
    if (s.level === 1 && s.heading.trim() === (fm.centou_file_name ?? item.title).trim() && !s.text.trim()) continue;
    if (s.heading === "背景") backgroundMd += s.text;
    else if (s.heading === "インタビュー概要" || s.heading === "データ") {
      const { head, tail } = splitMeta(s.text);
      overviewMd += `## ${s.heading}\n${head}\n`;
      if (tail.trim()) rest.push(tail);
      if (s.heading === "インタビュー概要") {
        const pick = (label: string) => s.text.match(new RegExp(`^[ \\t]*-[ \\t]*${label}[：:][ \\t]*(\\S.*)$`, "m"))?.[1]?.trim() ?? "";
        const t = pick("対象者");
        const dept = pick("部署");
        const role = pick("役職");
        subject = [t, [dept, role].filter(Boolean).join(" / ")].filter(Boolean).join("（") + (dept || role ? "）" : "");
      }
    } else if (s.heading === "" && s.level === 0) {
      if (s.text.trim()) rest.push(s.text);
    } else if (s.level === 1 && !s.text.trim()) {
      // bare H1 title line
    } else rest.push((s.heading ? `${"#".repeat(s.level)} ${s.heading}\n` : "") + s.text);
  }

  // utterance table rows: | speaker | insight | note |
  const utterances: Parsed["utterances"] = [];
  for (const line of mainBody.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (cells[0] === "発話者" || /^-+$/.test(cells[0])) continue;
    utterances.push({ speaker: cells[0], insight_text: stripBold(cells[1] ?? ""), note: cells[2] ?? "" });
  }

  // facts grouped by insight path
  const facts: Parsed["facts"] = [];
  let currentPath: string[] | null = null;
  for (const line of aiBody.split("\n")) {
    const h = line.match(/^### (.+)$/);
    if (h) {
      const raw = h[1].trim();
      currentPath = INBOX_PATHS.has(raw) ? [] : raw.split(">").map((p) => p.trim()).filter((p) => p && p !== "all");
      continue;
    }
    if (currentPath === null) continue;
    const b = line.match(/^- (.+)$/);
    if (b) {
      facts.push({ path: currentPath, text: stripBold(b[1]), note: "" });
      continue;
    }
    const n = line.match(/^\s+- 補足[：:]\s*(.+)$/);
    if (n && facts.length) facts[facts.length - 1].note = n[1].trim();
  }

  const status = fm.status_insighted === "true" ? "3. 完了" : fm.status_researched === "true" ? "2. ファクトとの紐付け" : "1. 内容の記載";

  return {
    extId: fm.centou_file_id || item.id,
    title: (fm.centou_file_name || item.title || "無題").trim(),
    folderName: (item.folder_name || "").trim(),
    subject,
    updatedAt: fm.updated_at || null,
    status,
    backgroundMd: backgroundMd.trim(),
    overviewMd: overviewMd.trim(),
    transcript: rest.join("\n").trim(),
    utterances,
    facts,
  };
}

async function main() {
  const [, , file, ...flags] = process.argv;
  if (!file) throw new Error("usage: pnpm import:centou <data.json> [--dry-run]");
  const dryRun = flags.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.SEED_EMAIL?.toLowerCase();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
  if (!dryRun && !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  if (!email) throw new Error("SEED_EMAIL missing (admin member email)");

  const items = JSON.parse(readFileSync(file, "utf8")) as ExportItem[];
  const parsed = items.map(parseItem);

  const totals = {
    files: parsed.length,
    withBackground: parsed.filter((p) => p.backgroundMd).length,
    withTranscript: parsed.filter((p) => p.transcript).length,
    utterances: parsed.reduce((a, p) => a + p.utterances.length, 0),
    facts: parsed.reduce((a, p) => a + p.facts.length, 0),
    paths: new Set(parsed.flatMap((p) => p.facts.map((f) => f.path.join(" > ")))).size,
  };
  console.log("parsed:", totals);
  if (dryRun) {
    const sample = parsed.find((p) => p.facts.length && p.backgroundMd)!;
    console.log(JSON.stringify({ ...sample, transcript: sample.transcript.slice(0, 200) + "…" }, null, 2).slice(0, 3000));
    return;
  }

  const sb = createClient(url, key!, { auth: { persistSession: false } });

  const { data: member, error: mErr } = await sb.from("member").select("workspace_id, user_id").eq("email", email).maybeSingle();
  if (mErr) throw mErr;
  if (!member) throw new Error(`member not found for ${email}. Run pnpm seed first.`);
  const ws = member.workspace_id as string;
  const uid = member.user_id as string;

  const { data: inbox } = await sb.from("insight").select("id").eq("workspace_id", ws).eq("is_inbox", true).maybeSingle();
  if (!inbox) throw new Error("inbox insight missing. Run pnpm seed first.");
  const inboxId = inbox.id as string;

  // folders
  const { data: folderRows } = await sb.from("folder").select("id, name").eq("workspace_id", ws);
  const folders = new Map((folderRows ?? []).map((f) => [f.name, f.id as string]));
  async function folderId(name: string): Promise<string | null> {
    if (!name) return null;
    if (folders.has(name)) return folders.get(name)!;
    const { data, error } = await sb.from("folder").insert({ workspace_id: ws, name, sort_order: folders.size }).select("id").single();
    if (error) throw error;
    folders.set(name, data.id);
    return data.id;
  }

  // insight tree
  const { data: insightRows } = await sb.from("insight").select("id, parent_id, title, is_inbox").eq("workspace_id", ws).is("deleted_at", null);
  const nodeKey = (parent: string | null, title: string) => `${parent ?? "root"}::${title}`;
  const nodes = new Map((insightRows ?? []).filter((i) => !i.is_inbox).map((i) => [nodeKey(i.parent_id, i.title), i.id as string]));
  const created = { insights: 0 };
  async function insightIdForPath(path: string[]): Promise<string> {
    if (path.length === 0) return inboxId;
    let parent: string | null = null;
    for (const title of path) {
      const k = nodeKey(parent, title);
      if (!nodes.has(k)) {
        const { data, error } = await sb
          .from("insight")
          .insert({ workspace_id: ws, parent_id: parent, title, sort_order: nodes.size, created_by: uid })
          .select("id")
          .single();
        if (error) throw error;
        nodes.set(k, data.id);
        created.insights += 1;
      }
      parent = nodes.get(k)!;
    }
    return parent!;
  }

  const { data: existing, error: exErr } = await sb
    .from("research_file")
    .select("id, ext_id, transcript_enc, updated_at")
    .not("ext_id", "is", null);
  if (exErr) throw exErr;
  const existingIds = new Set((existing ?? []).map((r) => r.ext_id as string));
  const existingByExt = new Map((existing ?? []).map((r) => [r.ext_id as string, r]));
  let backfilled = 0;
  let redated = 0;

  let added = 0, skipped = 0, factCount = 0, uttCount = 0, transcriptCount = 0;
  for (const p of parsed) {
    if (existingIds.has(p.extId)) {
      skipped += 1;
      // Backfill transcript for files imported earlier without one.
      const row = existingByExt.get(p.extId);
      if (row && !row.transcript_enc && p.transcript) {
        const { error: tErr } = await sb.rpc("admin_set_transcript", { p_research_id: row.id, p_text: p.transcript });
        if (tErr) console.error(`  transcript backfill failed for ${p.title}: ${tErr.message}`);
        else backfilled += 1;
      }
      // Restore original Centou timestamp if it was overwritten.
      if (row && p.updatedAt && new Date(row.updated_at as string).getTime() !== new Date(p.updatedAt).getTime()) {
        const { error: dErr } = await sb
          .from("research_file")
          .update({ updated_at: p.updatedAt, created_at: p.updatedAt })
          .eq("id", row.id);
        if (dErr) console.error(`  date restore failed for ${p.title}: ${dErr.message}`);
        else redated += 1;
      }
      continue;
    }
    const fid = await folderId(p.folderName);
    const ins = {
      workspace_id: ws,
      folder_id: fid,
      title: p.title,
      subject: p.subject,
      background: p.backgroundMd ? markdownToTiptap(p.backgroundMd) : null,
      overview: p.overviewMd ? markdownToTiptap(p.overviewMd) : null,
      status: p.status,
      ext_id: p.extId,
      created_by: uid,
      updated_by: uid,
      ...(p.updatedAt ? { created_at: p.updatedAt } : {}),
    };
    const { data: rf, error } = await sb.from("research_file").insert(ins).select("id").single();
    if (error) { console.error(`✗ ${p.title}: ${error.message}`); continue; }
    const researchId = rf.id as string;

    if (p.transcript) {
      const { error: tErr } = await sb.rpc("admin_set_transcript", { p_research_id: researchId, p_text: p.transcript });
      if (tErr) console.error(`  transcript failed for ${p.title}: ${tErr.message}`);
      else transcriptCount += 1;
    }

    // utterances: table rows first, then one per fact not matched to a row
    const rows: { speaker: string; insight_text: string; note: string }[] = [...p.utterances];
    const rowIndexForFact = new Map<number, number>();
    p.facts.forEach((f, i) => {
      const idx = rows.findIndex((r, j) => r.insight_text === f.text && ![...rowIndexForFact.values()].includes(j));
      if (idx >= 0) rowIndexForFact.set(i, idx);
      else {
        rows.push({ speaker: "", insight_text: f.text, note: f.note });
        rowIndexForFact.set(i, rows.length - 1);
      }
    });
    let uttIds: string[] = [];
    if (rows.length) {
      const { data: utts, error: uErr } = await sb
        .from("utterance")
        .insert(rows.map((r, i) => ({ workspace_id: ws, research_id: researchId, sort_order: i, ...r })))
        .select("id");
      if (uErr) console.error(`  utterances failed for ${p.title}: ${uErr.message}`);
      else { uttIds = (utts ?? []).map((u) => u.id as string); uttCount += uttIds.length; }
    }

    if (p.facts.length) {
      const factRows = [];
      for (let i = 0; i < p.facts.length; i++) {
        const f = p.facts[i];
        const uttIdx = rowIndexForFact.get(i)!;
        factRows.push({
          workspace_id: ws,
          research_id: researchId,
          utterance_id: uttIds[uttIdx] ?? null,
          insight_id: await insightIdForPath(f.path),
          text: f.text,
          speaker: rows[uttIdx]?.speaker ?? "",
          note: f.note || rows[uttIdx]?.note || "",
          created_by: uid,
        });
      }
      const { error: fErr } = await sb.from("fact").insert(factRows);
      if (fErr) console.error(`  facts failed for ${p.title}: ${fErr.message}`);
      else factCount += factRows.length;
    }
    // keep original updated_at (trigger overwrote it on insert? no: trigger is before update only)
    if (p.updatedAt) await sb.from("research_file").update({ updated_at: p.updatedAt, updated_by: uid }).eq("id", researchId);
    added += 1;
    existingIds.add(p.extId);
  }

  console.log(`追加 ${added} 件／スキップ ${skipped} 件（うち議事録を補完 ${backfilled} 件、更新日時を復元 ${redated} 件）`);
  console.log(`  議事録 ${transcriptCount}、発話 ${uttCount}、ファクト ${factCount}、インサイト新規 ${created.insights}、フォルダ ${folders.size}`);
}

main().catch((e) => {
  console.error("import 失敗:", e.message ?? e);
  process.exit(1);
});
