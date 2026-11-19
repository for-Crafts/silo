-- 0007: リサーチ詳細を「1 枚の自由ページ」に。ページに挿入できるテンプレート。
--
-- 1) research_file.body … ページ本文（Tiptap JSON）。発話表は本文中の { "type": "utteranceTable" } ブロック。
--    既存の background / overview は body にまとめて移す（列は残すが、以後は使わない）。
-- 2) research_template … ワークスペース共有のテンプレート。ページ内の好きな位置に挿入できる。

-- ---------------------------------------------------------------
-- 1) 本文
-- ---------------------------------------------------------------
alter table research_file add column if not exists body jsonb;

grant select (body) on research_file to authenticated;
grant insert (body) on research_file to authenticated;
grant update (body) on research_file to authenticated;

create or replace function _silo_heading(t text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'heading', 'attrs', jsonb_build_object('level', 2),
                            'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', t)))
$$;

-- 既存のリサーチ：背景 → インタビュー概要 → 録画データ（発話表）の順で 1 ページにする
update research_file r
set body = jsonb_build_object(
  'type', 'doc',
  'content',
    jsonb_build_array(_silo_heading('背景'))
    || coalesce(r.background -> 'content', '[]'::jsonb)
    || jsonb_build_array(_silo_heading('インタビュー概要'))
    || coalesce(r.overview -> 'content', '[]'::jsonb)
    || jsonb_build_array(_silo_heading('録画データ'), jsonb_build_object('type', 'utteranceTable'))
)
where r.body is null;

drop function _silo_heading(text);

-- ---------------------------------------------------------------
-- 2) テンプレート
-- ---------------------------------------------------------------
create table if not exists research_template (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  name text not null default '',
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  sort_order int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists research_template_ws_idx on research_template(workspace_id, sort_order);

drop trigger if exists research_template_set_updated_at on research_template;
create trigger research_template_set_updated_at before update on research_template
  for each row execute function set_updated_at();

alter table research_template enable row level security;
drop policy if exists "research_template_member_select" on research_template;
drop policy if exists "research_template_writer_insert" on research_template;
drop policy if exists "research_template_writer_update" on research_template;
drop policy if exists "research_template_writer_delete" on research_template;
create policy "research_template_member_select" on research_template for select to authenticated
  using (workspace_id in (select current_workspace_ids()));
create policy "research_template_writer_insert" on research_template for insert to authenticated
  with check (can_write_workspace(workspace_id));
create policy "research_template_writer_update" on research_template for update to authenticated
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "research_template_writer_delete" on research_template for delete to authenticated
  using (can_write_workspace(workspace_id));

-- 最初の 1 件：Centou のリサーチページと同じ構成
insert into research_template (workspace_id, name, sort_order, content)
select w.id, 'インタビュー記録', 0, $json$
{"type":"doc","content":[
  {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"背景"}]},
  {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph"}]}]},
  {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"インタビュー概要"}]},
  {"type":"bulletList","content":[
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"インタビュワー："}]}]},
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"対象者："}]}]}
  ]},
  {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"データ"}]},
  {"type":"bulletList","content":[
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"録画データ："}]}]},
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"社内メモ："}]}]}
  ]},
  {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"録画データ"}]},
  {"type":"utteranceTable"}
]}
$json$::jsonb
from workspace w
where not exists (select 1 from research_template t where t.workspace_id = w.id);
