-- ─────────────────────────────────────────────────────────────────────────────
-- PM TO DO — tabela zadań użytkownika.
-- Uruchom w Supabase → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      text        not null,               -- auth.uid() zalogowanego użytkownika
  title        text        not null,
  due_date     date,                               -- do kiedy zadanie ma być wykonane
  progress     integer     not null default 0
               check (progress >= 0 and progress <= 100),
  completed_at timestamptz,                        -- ustawiane, gdy progress osiągnie 100%
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indeksy pod typowe pytania: „moje zadania", „na dziś", „ostatnio ukończone".
create index if not exists tasks_user_due_idx       on public.tasks (user_id, due_date);
create index if not exists tasks_user_completed_idx on public.tasks (user_id, completed_at desc);

-- Spójnie z resztą projektu: izolacja danych na poziomie aplikacji (RLS wyłączone).
alter table public.tasks disable row level security;

-- Podgląd własnych zadań:
--   select title, due_date, progress, completed_at
--   from public.tasks
--   where user_id = '<twoje auth.uid>'
--   order by due_date nulls last;
