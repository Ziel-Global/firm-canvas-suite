-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- Add embedding columns
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE public.case_notes ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for performance (hnsw is recommended for pgvector)
CREATE INDEX IF NOT EXISTS cases_embedding_idx ON public.cases USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS case_notes_embedding_idx ON public.case_notes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON public.documents USING hnsw (embedding vector_cosine_ops);

-- Smart search function that returns conceptually matching cases.
-- It is SECURITY INVOKER so it automatically applies the caller's RLS policies
-- on the `cases`, `case_notes`, and `documents` tables.
CREATE OR REPLACE FUNCTION public.search_cases_smart(
  query_text text,
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  similarity_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  case_id uuid,
  relevance_score float
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH case_scores AS (
    SELECT 
      c.id AS case_id,
      (1.0 - (c.embedding <=> query_embedding)) AS case_score
    FROM cases c
    WHERE c.embedding IS NOT NULL
  ),
  note_scores AS (
    SELECT 
      n.case_id,
      MAX(1.0 - (n.embedding <=> query_embedding)) AS note_score
    FROM case_notes n
    WHERE n.embedding IS NOT NULL
    GROUP BY n.case_id
  ),
  doc_scores AS (
    SELECT 
      d.case_id,
      MAX(1.0 - (d.embedding <=> query_embedding)) AS doc_score
    FROM documents d
    WHERE d.embedding IS NOT NULL
    GROUP BY d.case_id
  ),
  -- Get all distinct case IDs that the user has access to from the above
  accessible_cases AS (
    SELECT id FROM cases
  ),
  combined AS (
    SELECT 
      ac.id AS case_id,
      GREATEST(
        COALESCE(cs.case_score, 0), 
        COALESCE(ns.note_score, 0), 
        COALESCE(ds.doc_score, 0)
      ) AS max_score
    FROM accessible_cases ac
    LEFT JOIN case_scores cs ON cs.case_id = ac.id
    LEFT JOIN note_scores ns ON ns.case_id = ac.id
    LEFT JOIN doc_scores ds ON ds.case_id = ac.id
  )
  SELECT 
    cb.case_id,
    cb.max_score::float
  FROM combined cb
  WHERE cb.max_score > similarity_threshold
  ORDER BY cb.max_score DESC
  LIMIT match_count;
END;
$$;
