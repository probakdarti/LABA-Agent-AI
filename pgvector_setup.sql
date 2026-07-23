-- ============================================================
-- Lekcja 06 / Warsztat 1 — pgvector + tabela documents + funkcja wyszukiwania
--
-- STAN WYJŚCIOWY (wykryty): tabela `documents` już istnieje (utworzona ręcznie)
-- z kolumnami id, created_at, title, content — ale BEZ embedding, BEZ metadata,
-- z WŁĄCZONYM RLS i bez funkcji match_documents.
--
-- Ten skrypt dokłada tylko brakujące elementy (idempotentnie — można uruchomić
-- wielokrotnie bez błędu). Uruchom w Supabase → SQL Editor → Run.
-- ============================================================

-- 1) Rozszerzenie pgvector (baza umie wektory)
create extension if not exists vector;

-- 2) Brakujące kolumny w istniejącej tabeli documents
alter table public.documents
  add column if not exists embedding vector(768);            -- wektor Gemini text-embedding-004

alter table public.documents
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- 3) RLS wyłączony (na razie — jak w pozostałych tabelach; auth w L07)
alter table public.documents disable row level security;

-- 4) Funkcja wyszukiwania po podobieństwie (cosine distance <=>)
create or replace function match_documents(
  query_embedding vector(768),
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.title,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- (Opcjonalnie, dla wydajności przy większej liczbie dokumentów — nieobowiązkowe w W1:)
-- create index if not exists documents_embedding_hnsw
--   on public.documents using hnsw (embedding vector_cosine_ops);
