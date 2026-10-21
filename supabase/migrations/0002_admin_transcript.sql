-- Service-role only transcript writer, used by import scripts (no auth.uid() context).
create or replace function admin_set_transcript(p_research_id uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update research_file
  set transcript_enc = case when p_text is null or p_text = '' then null
                            else pgp_sym_encrypt(p_text, transcript_key()) end
  where id = p_research_id;
  if not found then raise exception 'research not found'; end if;
end $$;
revoke all on function admin_set_transcript(uuid, text) from public, anon, authenticated;
grant execute on function admin_set_transcript(uuid, text) to service_role;
