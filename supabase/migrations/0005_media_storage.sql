-- 0005: エディタ画像の保存先（Supabase Storage）
-- private バケット。オブジェクトパスの先頭フォルダ = workspace_id で、メンバーだけが読み書きできる。
-- パス規約: {workspace_id}/{research_id}/{uuid}.webp

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'research-media',
  'research-media',
  false,
  10485760, -- 10MB（クライアントで縮小してから送るので通常は数百KB）
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "research_media_select" on storage.objects;
drop policy if exists "research_media_insert" on storage.objects;
drop policy if exists "research_media_delete" on storage.objects;

create policy "research_media_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'research-media'
    and (storage.foldername(name))[1] in (select id::text from public.current_workspace_ids() as id)
  );

create policy "research_media_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'research-media'
    and (storage.foldername(name))[1] in (select id::text from public.current_workspace_ids() as id)
  );

create policy "research_media_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'research-media'
    and (storage.foldername(name))[1] in (select id::text from public.current_workspace_ids() as id)
  );
