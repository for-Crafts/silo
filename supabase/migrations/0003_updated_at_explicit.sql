-- Keep an explicitly provided updated_at (e.g. from data migration); otherwise stamp now().
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at = now();
  end if;
  return new;
end $$;
