-- 0006: Claude 連携（AI-ready）
-- 1) Claude が出したファクト・インサイトは「提案（proposed）」として入り、人が採用／却下する
-- 2) ドキュメントの出どころ（人／Claude）と、引用したリサーチ・ファクト・インサイトを記録する
-- 3) 権限：admin・editor は読み書き、viewer は読むだけ（Claude もログインした本人の権限で動く）

-- ---------------------------------------------------------------
-- 1) 提案ステータス
-- ---------------------------------------------------------------
alter table fact
  add column if not exists status text not null default 'accepted'
    check (status in ('proposed', 'accepted', 'rejected')),
  add column if not exists source text not null default 'human'
    check (source in ('human', 'claude')),
  add column if not exists quote text not null default '';      -- 根拠となる原文（議事録からの引用）

alter table insight
  add column if not exists status text not null default 'accepted'
    check (status in ('proposed', 'accepted', 'rejected')),
  add column if not exists source text not null default 'human'
    check (source in ('human', 'claude')),
  add column if not exists rationale text not null default '',  -- なぜこのテーマに束ねたか
  add column if not exists proposed_fact_ids uuid[] not null default '{}'; -- 採用時にこのテーマへ移すファクト

create index if not exists fact_proposed_idx on fact(research_id) where status = 'proposed' and deleted_at is null;
create index if not exists insight_proposed_idx on insight(workspace_id) where status = 'proposed' and deleted_at is null;

-- 発話 1 行につき採用済みファクトは 1 件（提案は複数あってよい）
drop index if exists fact_one_per_utterance;
create unique index fact_one_per_utterance on fact(utterance_id)
  where utterance_id is not null and deleted_at is null and status = 'accepted';

-- ---------------------------------------------------------------
-- 2) ドキュメントの出どころと引用元
-- ---------------------------------------------------------------
alter table action
  add column if not exists source text not null default 'human'
    check (source in ('human', 'claude')),
  add column if not exists source_refs jsonb not null default '[]'::jsonb; -- [{kind:'research'|'fact'|'insight', id}]

-- ---------------------------------------------------------------
-- 3) 権限：viewer は読むだけ
-- ---------------------------------------------------------------
create or replace function can_write_workspace(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from member where workspace_id = ws and user_id = auth.uid() and role in ('admin', 'editor')
  )
$$;

do $$
declare t text;
begin
  foreach t in array array['folder','research_file','utterance','insight','fact','action'] loop
    execute format('drop policy if exists "%s_member_all" on %I', t, t);
    execute format('drop policy if exists "%s_member_select" on %I', t, t);
    execute format('drop policy if exists "%s_writer_insert" on %I', t, t);
    execute format('drop policy if exists "%s_writer_update" on %I', t, t);
    execute format('drop policy if exists "%s_writer_delete" on %I', t, t);
    execute format('create policy "%s_member_select" on %I for select to authenticated
             using (workspace_id in (select current_workspace_ids()))', t, t);
    execute format('create policy "%s_writer_insert" on %I for insert to authenticated
             with check (can_write_workspace(workspace_id))', t, t);
    execute format('create policy "%s_writer_update" on %I for update to authenticated
             using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id))', t, t);
    execute format('create policy "%s_writer_delete" on %I for delete to authenticated
             using (can_write_workspace(workspace_id))', t, t);
  end loop;
end $$;

-- 議事録の保存も書き込み権限が必要
create or replace function set_transcript(p_research_id uuid, p_text text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from research_file
    where id = p_research_id and can_write_workspace(workspace_id)
  ) then
    raise exception 'not allowed';
  end if;
  update research_file
  set transcript_enc = case when p_text is null or p_text = '' then null
                            else pgp_sym_encrypt(p_text, transcript_key()) end,
      updated_by = auth.uid()
  where id = p_research_id;
end $$;

-- 画像の保存先も同じ権限に揃える（0005 の insert/delete を上書き）
drop policy if exists "research_media_insert" on storage.objects;
drop policy if exists "research_media_delete" on storage.objects;
create policy "research_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'research-media' and can_write_workspace(((storage.foldername(name))[1])::uuid));
create policy "research_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'research-media' and can_write_workspace(((storage.foldername(name))[1])::uuid));
