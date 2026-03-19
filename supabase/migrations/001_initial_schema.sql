-- IPL Fantasy League 2026 — Initial Schema

-- ─────────────────────────────────────────
-- CLEAN SLATE: drop everything for re-runs
-- ─────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.get_my_league_ids();
drop table if exists public.weekly_selections cascade;
drop table if exists public.gameweeks cascade;
drop table if exists public.player_performances cascade;
drop table if exists public.ipl_matches cascade;
drop table if exists public.league_members cascade;
drop table if exists public.leagues cascade;
drop table if exists public.ipl_players cascade;
drop table if exists public.profiles cascade;

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────
-- PROFILES (extends Supabase auth.users)
-- ─────────────────────────────────────────
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────
-- IPL PLAYERS (static seed data)
-- ─────────────────────────────────────────
create table public.ipl_players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ipl_team text not null,
  role text not null check (role in ('batsman', 'bowler', 'all_rounder', 'wicket_keeper')),
  nationality text,
  base_price int not null default 200,  -- in lakhs
  is_overseas boolean default false,
  image_url text,
  cricinfo_id text unique,
  created_at timestamptz default now() not null
);

alter table public.ipl_players enable row level security;

create policy "Players are viewable by authenticated users"
  on public.ipl_players for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────
-- LEAGUES
-- ─────────────────────────────────────────
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8)),
  commissioner_id uuid references public.profiles(id) not null,
  max_teams int default 10 not null,
  budget_per_team int default 10000 not null,  -- in lakhs (₹100 crore = 10000)
  status text default 'setup' not null check (status in ('setup', 'live', 'completed')),
  created_at timestamptz default now() not null
);

alter table public.leagues enable row level security;

-- NOTE: "Leagues viewable by members" policy is added AFTER league_members table
-- to avoid forward-reference error.

create policy "Users can create leagues"
  on public.leagues for insert
  to authenticated
  with check (commissioner_id = auth.uid());

create policy "Commissioner can update league"
  on public.leagues for update
  to authenticated
  using (commissioner_id = auth.uid());

-- ─────────────────────────────────────────
-- LEAGUE MEMBERS
-- ─────────────────────────────────────────
create table public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references public.leagues(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  team_name text,
  budget_remaining int,
  total_points numeric default 0 not null,
  joined_at timestamptz default now() not null,
  unique(league_id, user_id)
);

alter table public.league_members enable row level security;

-- Security definer function avoids infinite recursion in the RLS policy below.
-- Without this, the policy would query league_members to check if the user is a
-- member, which triggers the policy again → infinite recursion.
create or replace function public.get_my_league_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select league_id from public.league_members where user_id = auth.uid()
$$;

create policy "Members viewable by league members"
  on public.league_members for select
  to authenticated
  using (
    league_id in (select public.get_my_league_ids())
  );

create policy "Users can join leagues"
  on public.league_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Members can update their own record"
  on public.league_members for update
  to authenticated
  using (user_id = auth.uid());

-- Leagues select policy (added here, after league_members exists)
create policy "Leagues viewable by members"
  on public.leagues for select
  to authenticated
  using (
    id in (
      select league_id from public.league_members where user_id = auth.uid()
    )
    or commissioner_id = auth.uid()
  );

-- ─────────────────────────────────────────
-- IPL MATCHES (schedule)
-- ─────────────────────────────────────────
create table public.ipl_matches (
  id uuid primary key default gen_random_uuid(),
  match_number int unique not null,
  team1 text not null,
  team2 text not null,
  venue text,
  scheduled_at timestamptz,
  status text default 'upcoming' not null check (status in ('upcoming', 'live', 'completed')),
  result text,
  created_at timestamptz default now() not null
);

alter table public.ipl_matches enable row level security;

create policy "Matches viewable by authenticated users"
  on public.ipl_matches for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────
-- PLAYER MATCH PERFORMANCES
-- ─────────────────────────────────────────
create table public.player_performances (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.ipl_matches(id) on delete cascade not null,
  player_id uuid references public.ipl_players(id) not null,
  -- Batting
  runs int default 0,
  balls_faced int default 0,
  fours int default 0,
  sixes int default 0,
  is_duck boolean default false,
  -- Bowling
  wickets int default 0,
  overs_bowled numeric(4,1) default 0,
  runs_conceded int default 0,
  maidens int default 0,
  -- Fielding
  catches int default 0,
  stumpings int default 0,
  run_outs_direct int default 0,
  run_outs_assist int default 0,
  -- Computed
  is_playing_xi boolean default false,
  fantasy_points numeric default 0,
  updated_at timestamptz default now() not null,
  unique(match_id, player_id)
);

alter table public.player_performances enable row level security;

create policy "Performances viewable by authenticated users"
  on public.player_performances for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────
-- REALTIME: enable relevant tables
-- ─────────────────────────────────────────
alter publication supabase_realtime add table public.league_members;
