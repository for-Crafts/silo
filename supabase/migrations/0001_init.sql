-- silo: initial schema
-- Run this whole file in Supabase SQL Editor.

create extension if not exists pgcrypto;
create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------
create table workspace (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table member (
  workspace_id uuid not null references workspace(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','editor','viewer')) default 'editor',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on member(user_id);

create table folder (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table research_file (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  folder_id uuid references folder(id) on delete set null,
  title text not null default '',
  subject text not null default '',
  background jsonb,
  overview jsonb,
  transcript_enc bytea,
  tags text[] not null default '{}',
  status text not null default '1. 内容の記載',
  ext_id text unique,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on research_file(workspace_id, updated_at desc) where deleted_at is null;

create table utterance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  research_id uuid not null references research_file(id) on delete cascade,
  sort_order int not null default 0,
  speaker text not null default '',
  insight_text text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on utterance(research_id, sort_order);

create table insight (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  parent_id uuid references insight(id) on delete set null,
  title text not null default '',
  tags text[] not null default '{}',
  importance text check (importance in ('高','中','低')),
  sort_order int not null default 0,
  is_inbox boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on insight(workspace_id, parent_id);
create unique index insight_one_inbox_per_workspace on insight(workspace_id) where is_inbox;

create table fact (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  research_id uuid not null references research_file(id) on delete cascade,
  utterance_id uuid references utterance(id) on delete set null,
  insight_id uuid references insight(id) on delete set null,
  text text not null,
  speaker text not null default '',
  note text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on fact(insight_id);
create index on fact(research_id);
create unique index fact_one_per_utterance on fact(utterance_id) where utterance_id is not null and deleted_at is null;

create table action (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  type text not null check (type in ('board','doc')),
  template text,
  title text not null default '',
  content jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table audit_log (
  id bigserial primary key,
  workspace_id uuid not null,
  user_id uuid,
  table_name text not null,
  row_id uuid not null,
  op text not null,
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------
create or replace function current_workspace_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from member where user_id = auth.uid()
$$;

create or replace function is_workspace_admin(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from member where workspace_id = ws and user_id = auth.uid() and role = 'admin'
  )
$$;

-- ---------------------------------------------------------------
-- Triggers: updated_at
-- ---------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['folder','research_file','utterance','insight','fact','action'] loop
    execute format('create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Triggers: audit log
-- ---------------------------------------------------------------
create or replace function write_audit_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  insert into audit_log(workspace_id, user_id, table_name, row_id, op)
  values (r.workspace_id, auth.uid(), tg_table_name, r.id, lower(tg_op));
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['research_file','utterance','fact','insight','action'] loop
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function write_audit_log()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Transcript encryption (pgcrypto + Vault key)
-- Key is created once in Vault; never appears in code.
-- ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'silo_transcript_key') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'silo_transcript_key', 'silo: research transcript encryption key');
  end if;
end $$;

create or replace function transcript_key() returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'silo_transcript_key'
$$;
revoke all on function transcript_key() from public, anon, authenticated;

create or replace function set_transcript(p_research_id uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
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
language plpgsql stable security definer set search_path = public as $$
declare enc bytea;
begin
  select transcript_enc into enc from research_file
  where id = p_research_id and workspace_id in (select current_workspace_ids());
  if not found then raise exception 'not allowed'; end if;
  if enc is null then return null; end if;
  return pgp_sym_decrypt(enc, transcript_key());
end $$;

create or replace function has_transcript(p_research_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select transcript_enc is not null from research_file
  where id = p_research_id and workspace_id in (select current_workspace_ids())
$$;

-- Clients may never read the raw ciphertext column.
revoke all on research_file from anon, authenticated;
grant select (id, workspace_id, folder_id, title, subject, background, overview, tags, status, ext_id,
              created_by, updated_by, created_at, updated_at, deleted_at) on research_file to authenticated;
grant insert (id, workspace_id, folder_id, title, subject, background, overview, tags, status, ext_id,
              created_by, updated_by) on research_file to authenticated;
grant update (folder_id, title, subject, background, overview, tags, status,
              updated_by, deleted_at) on research_file to authenticated;
grant delete on research_file to authenticated;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['workspace','folder','research_file','utterance','insight','fact','action'] loop
    execute format('alter table %I enable row level security', t);
    if t = 'workspace' then
      execute 'create policy "workspace_member_all" on workspace for all to authenticated
               using (id in (select current_workspace_ids()))
               with check (id in (select current_workspace_ids()))';
    else
      execute format('create policy "%s_member_all" on %I for all to authenticated
               using (workspace_id in (select current_workspace_ids()))
               with check (workspace_id in (select current_workspace_ids()))', t, t);
    end if;
  end loop;
end $$;

alter table member enable row level security;
create policy "member_select" on member for select to authenticated
  using (workspace_id in (select current_workspace_ids()));
create policy "member_admin_insert" on member for insert to authenticated
  with check (is_workspace_admin(workspace_id));
create policy "member_admin_update" on member for update to authenticated
  using (is_workspace_admin(workspace_id)) with check (is_workspace_admin(workspace_id));
create policy "member_admin_delete" on member for delete to authenticated
  using (is_workspace_admin(workspace_id));

alter table audit_log enable row level security;
create policy "audit_insert" on audit_log for insert to authenticated
  with check (workspace_id in (select current_workspace_ids()));
create policy "audit_admin_select" on audit_log for select to authenticated
  using (is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------
-- Safety check: no table in public without RLS
-- ---------------------------------------------------------------
do $$
declare bad text;
begin
  select string_agg(tablename, ', ') into bad
  from pg_tables where schemaname = 'public' and not rowsecurity;
  if bad is not null then
    raise exception 'RLS disabled on: %', bad;
  end if;
end $$;
