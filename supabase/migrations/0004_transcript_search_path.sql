-- pgcrypto lives in the "extensions" schema on Supabase; include it in search_path.
create or replace function set_transcript(p_research_id uuid, p_text text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from research_file
    where id = p_research_id and workspace_id in (select current_workspace_ids())
  ) then
    raise exception 'not allowed';
  end if;
  update research_file
  set transcript_enc = case when p_text is null or p_text = '' then null
                            else pgp_sym_encrypt(p_text, transcript_key()) end,
      updated_by = auth.uid()
  where id = p_research_id;
end $$;

create or replace function get_transcript(p_research_id uuid) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare enc bytea;
begin
  select transcript_enc into enc from research_file
  where id = p_research_id and workspace_id in (select current_workspace_ids());
  if not found then raise exception 'not allowed'; end if;
  if enc is null then return null; end if;
  return pgp_sym_decrypt(enc, transcript_key());
end $$;

create or replace function admin_set_transcript(p_research_id uuid, p_text text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update research_file
  set transcript_enc = case when p_text is null or p_text = '' then null
                            else pgp_sym_encrypt(p_text, transcript_key()) end
  where id = p_research_id;
  if not found then raise exception 'research not found'; end if;
end $$;
revoke all on function admin_set_transcript(uuid, text) from public, anon, authenticated;
grant execute on function admin_set_transcript(uuid, text) to service_role;
