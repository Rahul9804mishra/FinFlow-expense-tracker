-- =====================================================
--  FINFLOW — Supabase Database Schema
--  Run this entire file in the Supabase SQL Editor
--  Dashboard → SQL Editor → New query → Paste → Run
-- =====================================================

-- ── Enable UUID extension (already on by default in Supabase) ──
create extension if not exists "uuid-ossp";

-- ── PROFILES table ──────────────────────────────────
-- Mirrors auth.users with extra app-level columns
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text,
  currency      text        not null default 'INR',
  accent        text        not null default 'indigo',
  savings_goal  numeric     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-create a profile row whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── EXPENSES table ───────────────────────────────────
create table if not exists public.expenses (
  id          text        primary key,   -- client-generated uid
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  name        text        not null,
  amount      numeric     not null check (amount > 0),
  date        date        not null,
  category    text        not null,
  type        text        not null default 'expense' check (type in ('expense','income')),
  note        text,
  tags        text[]      default '{}',
  recurring   text        check (recurring in ('daily','weekly','monthly') or recurring is null),
  created_at  timestamptz not null default now()
);

-- ── BUDGETS table ────────────────────────────────────
create table if not exists public.budgets (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  category    text        not null,
  amount      numeric     not null default 0,
  updated_at  timestamptz not null default now(),
  unique (user_id, category)
);

-- ── ROW LEVEL SECURITY ───────────────────────────────
-- Users can only see / touch their own rows

alter table public.profiles  enable row level security;
alter table public.expenses  enable row level security;
alter table public.budgets   enable row level security;

-- profiles
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- expenses
create policy "Users can view own expenses"
  on public.expenses for select using (auth.uid() = user_id);
create policy "Users can insert own expenses"
  on public.expenses for insert with check (auth.uid() = user_id);
create policy "Users can update own expenses"
  on public.expenses for update using (auth.uid() = user_id);
create policy "Users can delete own expenses"
  on public.expenses for delete using (auth.uid() = user_id);

-- budgets
create policy "Users can view own budgets"
  on public.budgets for select using (auth.uid() = user_id);
create policy "Users can upsert own budgets"
  on public.budgets for insert with check (auth.uid() = user_id);
create policy "Users can update own budgets"
  on public.budgets for update using (auth.uid() = user_id);
create policy "Users can delete own budgets"
  on public.budgets for delete using (auth.uid() = user_id);

-- ── INDEXES ──────────────────────────────────────────
create index if not exists idx_expenses_user_date  on public.expenses (user_id, date desc);
create index if not exists idx_expenses_user_type  on public.expenses (user_id, type);
create index if not exists idx_budgets_user        on public.budgets  (user_id);

-- =====================================================
--  DONE. Now go to:
--  Authentication → Providers → Google → Enable
--  and fill in your Google OAuth Client ID & Secret.
--  Then set Site URL and Redirect URLs in:
--  Authentication → URL Configuration
-- =====================================================
