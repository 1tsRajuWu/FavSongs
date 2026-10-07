-- FavSongs likes — one row per (target, user). Targets are either a short
-- link id ("link") or a normalized song key ("song"). Run after schema.sql.

create table if not exists public.shelf_likes (
  target_type text not null check (target_type in ('link', 'song')),
  target_id text not null check (char_length(target_id) between 1 and 200),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (target_type, target_id, user_id)
);
create index if not exists shelf_likes_target_idx
  on public.shelf_likes (target_type, target_id);

alter table public.shelf_likes enable row level security;

-- Counts are public (needed to display them); writes are owner-only and
-- login-gated, so nobody can like twice or forge someone else's like.
drop policy if exists "likes are publicly countable" on public.shelf_likes;
create policy "likes are publicly countable" on public.shelf_likes
  for select using (true);

drop policy if exists "signed-in users can like once" on public.shelf_likes;
create policy "signed-in users can like once" on public.shelf_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "users can unlike their own likes" on public.shelf_likes;
create policy "users can unlike their own likes" on public.shelf_likes
  for delete using (auth.uid() = user_id);
