-- FavSongs backend — run once in the Supabase SQL editor.
-- Creates per-user shelves + songs with Row Level Security.
-- Nobody ever sees another person's private data: every policy is
-- scoped to auth.uid(), and the anon key can't bypass RLS.

-- One row per user's shelf (a user owns exactly their own rows).
create table if not exists public.shelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'My shelf' check (char_length(title) between 1 and 80),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- Songs inside a shelf. Service links only (validated client-side too).
create table if not exists public.shelf_songs (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid not null references public.shelves (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  artist text not null default '' check (char_length(artist) <= 120),
  album text not null default '' check (char_length(album) <= 120),
  art text not null default '' check (char_length(art) <= 500),
  url text not null default '' check (char_length(url) <= 500),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists shelf_songs_shelf_idx on public.shelf_songs (shelf_id, position);

-- Keep updated_at fresh without client writes.
create or replace function public.touch_shelf_updated_at()
returns trigger language plpgsql as $$
begin
  update public.shelves set updated_at = now() where id = new.shelf_id;
  return new;
end;
$$;
drop trigger if exists shelf_songs_touch on public.shelf_songs;
create trigger shelf_songs_touch
  after insert or update or delete on public.shelf_songs
  for each row execute function public.touch_shelf_updated_at();

alter table public.shelves enable row level security;
alter table public.shelf_songs enable row level security;

-- Owners: full access to their OWN shelf, nothing else.
drop policy if exists "owners manage own shelf" on public.shelves;
create policy "owners manage own shelf" on public.shelves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Anyone (even signed out) can read PUBLIC shelves — the discover feed.
drop policy if exists "public shelves are readable" on public.shelves;
create policy "public shelves are readable" on public.shelves
  for select using (is_public = true);

-- Songs inherit visibility through their shelf.
drop policy if exists "owners manage own songs" on public.shelf_songs;
create policy "owners manage own songs" on public.shelf_songs
  for all using (
    exists (
      select 1 from public.shelves s
      where s.id = shelf_songs.shelf_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shelves s
      where s.id = shelf_songs.shelf_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "songs of public shelves are readable" on public.shelf_songs;
create policy "songs of public shelves are readable" on public.shelf_songs
  for select using (
    exists (
      select 1 from public.shelves s
      where s.id = shelf_songs.shelf_id and s.is_public = true
    )
  );
