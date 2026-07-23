-- ============================================================
-- Schema bazy danych — Lekcja 05 (Warsztat 1: Supabase)
-- Projekt: moj-agent  (ref: bbjvudhgrttppauedwnk, region: Central EU / Frankfurt)
--
-- Ten plik odtwarza całą strukturę bazy z W1_SUPABASE_SETUP.md.
-- Uruchomienie: Supabase Dashboard -> SQL Editor -> wklej -> Run.
-- RLS wyłączone celowo (włączymy w Lekcji 07).
-- ============================================================

-- ------------------------------------------------------------
-- 1) conversations — lista rozmów
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null    default now(),
  title       text,                                          -- nazwa rozmowy
  updated_at  timestamptz not null    default now()          -- ostatnia aktywność
);
alter table public.conversations disable row level security;

-- ------------------------------------------------------------
-- 2) messages — wiadomości w rozmowach
-- ------------------------------------------------------------
create table if not exists public.messages (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null    default now(),
  conversation_id  uuid,                                     -- powiązanie z conversations
  role             text,                                     -- 'user' lub 'assistant'
  content          text                                      -- treść wiadomości
);
alter table public.messages disable row level security;

-- Opcjonalnie: klucz obcy do conversations (W1 opisuje powiązanie).
-- Odkomentuj, jeśli chcesz wymusić integralność i kaskadowe usuwanie:
-- alter table public.messages
--   add constraint messages_conversation_id_fkey
--   foreign key (conversation_id) references public.conversations (id) on delete cascade;

-- ------------------------------------------------------------
-- 3) user_profiles — profil użytkownika
-- ------------------------------------------------------------
create table if not exists public.user_profiles (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null    default now(),
  name         text,                                         -- imię użytkownika
  preferences  jsonb       not null    default '{}'::jsonb   -- preferencje (ulubione jedzenie, miasto, itp.)
);
alter table public.user_profiles disable row level security;
