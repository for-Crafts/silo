export type Role = "admin" | "editor" | "viewer";

export type Member = {
  workspace_id: string;
  user_id: string;
  email: string;
  role: Role;
};

export type Folder = {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const RESEARCH_STATUSES = ["1. 内容の記載", "2. ファクトとの紐付け", "3. 完了"] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

/** Columns the client is allowed to read (transcript_enc is excluded by grant). */
export const RESEARCH_COLUMNS =
  "id, workspace_id, folder_id, title, subject, background, overview, tags, status, ext_id, created_by, updated_by, created_at, updated_at, deleted_at";

export type ResearchFile = {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  title: string;
  subject: string;
  background: unknown | null;
  overview: unknown | null;
  tags: string[];
  status: string;
  ext_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ResearchListItem = Omit<ResearchFile, "background" | "overview">;

export type Utterance = {
  id: string;
  workspace_id: string;
  research_id: string;
  sort_order: number;
  speaker: string;
  insight_text: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export type Insight = {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  title: string;
  tags: string[];
  importance: "高" | "中" | "低" | null;
  sort_order: number;
  is_inbox: boolean;
  /** proposed = Claude の提案（人が採用するまで正式データではない） */
  status?: "proposed" | "accepted" | "rejected";
  source?: "human" | "claude";
  rationale?: string;
  proposed_fact_ids?: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Fact = {
  id: string;
  workspace_id: string;
  research_id: string;
  utterance_id: string | null;
  insight_id: string | null;
  text: string;
  speaker: string;
  note: string;
  status?: "proposed" | "accepted" | "rejected";
  source?: "human" | "claude";
  quote?: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FactWithInsight = Fact & { insight: { id: string; title: string; is_inbox: boolean } | null };

/** インサイト画面のファクト行（元リサーチのタイトル付き） */
export type FactRow = Pick<Fact, "id" | "text" | "speaker" | "note" | "insight_id" | "research_id" | "updated_at"> & {
  research: { title: string } | null;
};

export type ActionTemplate = "blank" | "flow" | "persona" | "mindmap" | "doc";

export type ActionItem = {
  id: string;
  workspace_id: string;
  type: "board" | "doc";
  template: ActionTemplate | null;
  title: string;
  content: unknown;
  source?: "human" | "claude";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
