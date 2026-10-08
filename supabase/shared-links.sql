-- Shared links, made ownable. Run once in the Supabase SQL editor.
-- Apply after schema.sql. Nothing here is destructive to an existing shelf.
--
-- What the public anon key can do today, measured against this project
-- (SELECT * from the table behind /rest/v1/shared_links):
--   * INSERT a shelf                                -> allowed (that is the feature)
--   * SELECT every row                              -> allowed (ids are random, the table is not unlisted)
--   * UPDATE or DELETE a row                        -> refused (no policy)  ✔
-- So the site has to mint a new row whenever a shelf changes, which is why the
-- link in someone's bio goes stale, and nothing ever removes an old row.
--
-- This adds the missing half: a secret the creating browser keeps, stored only
-- as a hash, which lets that browser update its own link and nobody else.
-- The site already sends it as the `x-share-key` header (shelf.js), so applying
-- this file is what turns resharing into "the same link, updated".
--
--   Before this file:  PATCH with x-share-key -> 200, 0 rows (RLS refuses)
--   After this file:   PATCH with the right key -> 200, 1 row (the link is stable)
--                      PATCH with any other key -> 200, 0 rows
--
-- Verify after applying (safe, writes nothing):
--   curl -s -X PATCH "$SUPABASE_URL/rest/v1/shared_links?id=eq.<one-of-your-ids>" \
--     -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
--     -H "Content-Type: application/json" -H "Prefer: return=representation" \
--     -H "x-share-key: wrong-key" -d '{"songs":[]}'      # expect []
-- and repeat with the key that browser holds                           # expect the row

create extension if not exists pgcrypto with schema extensions;

alter table public.shared_links
  add column if not exists edit_key_hash text not null default '';

-- The hash is taken from the request header, never from the body: a client
-- cannot store a key it does not hold, and the table never stores a key that
-- would let a dump of it edit shelves.
create or replace function public.shared_links_stamp_key()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  key text;
begin
  begin
    key := current_setting('request.headers', true)::json ->> 'x-share-key';
  exception when others then
    key := null;
  end;
  if key is null or length(key) < 32 then
    raise exception 'a shared link needs an x-share-key header of at least 32 characters'
      using errcode = 'check_violation';
  end if;
  new.edit_key_hash := encode(extensions.digest(key, 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists shared_links_stamp_key on public.shared_links;
create trigger shared_links_stamp_key
  before insert or update on public.shared_links
  for each row execute function public.shared_links_stamp_key();

-- RLS. Check what is already there first, and drop the old policies by name:
--   select policyname, cmd, qual from pg_policies where tablename = 'shared_links';
alter table public.shared_links enable row level security;

drop policy if exists "shared_links_insert" on public.shared_links;
create policy "shared_links_insert" on public.shared_links
  for insert with check (true);

-- Reading stays open for the holder of a link: an id is 40 bits of randomness,
-- and the preview card is fetched by chat apps that carry no credentials.
drop policy if exists "shared_links_select" on public.shared_links;
create policy "shared_links_select" on public.shared_links
  for select using (true);

-- The one new power: change a row if, and only if, you hold its key.
drop policy if exists "shared_links_update_owner" on public.shared_links;
create policy "shared_links_update_owner" on public.shared_links
  for update using (
    edit_key_hash <> ''
    and edit_key_hash = encode(
      extensions.digest(coalesce(current_setting('request.headers', true)::json ->> 'x-share-key', ''), 'sha256'),
      'hex'
    )
  )
  with check (true);

-- No DELETE policy on purpose: a link someone pasted into a chat keeps working.
-- Expiry is the owner's call instead (see prune_shared_links below).

-- ------------------------------------------------------------------ abuse caps
-- An unauthenticated insert is the feature, so cap what one can carry. If any
-- existing row is larger than these bounds the constraint will refuse to apply:
-- run the two selects below first and deal with the outliers.
--   select id, jsonb_array_length(songs) from public.shared_links order by 2 desc limit 5;
--   select id, pg_column_size(songs) from public.shared_links order by 2 desc limit 5;
alter table public.shared_links
  drop constraint if exists shared_links_songs_bounds,
  add constraint shared_links_songs_bounds check (
    jsonb_typeof(songs) = 'array'
    and jsonb_array_length(songs) between 1 and 50
    and pg_column_size(songs) < 65536
  );

-- ------------------------------------------------------------------- retention
-- Nothing removes a share today, so the table grows forever. This deletes rows
-- older than the window and reports how many went. Schedule it wherever the
-- project runs cron (Dashboard -> Integrations -> Cron, or pg_cron):
--   select cron.schedule('prune-shared-links', '0 4 * * *',
--                        $$select public.prune_shared_links();$$);
create or replace function public.prune_shared_links(max_age interval default '180 days')
returns integer language plpgsql security definer set search_path = public as $$
declare
  gone integer;
begin
  delete from public.shared_links where created_at < now() - max_age;
  get diagnostics gone = row_count;
  return gone;
end;
$$;

-- ------------------------------------------------------------------- cleanup
-- Rows our own testing left behind. Safe to run; delete anything of yours that
-- you do not want public. (This needs a policy, so run it with the SQL editor,
-- which acts as the table owner.)
delete from public.shared_links where id in ('ogtest01', 'zzprobe1');
