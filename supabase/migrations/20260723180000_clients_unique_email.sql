-- Enforce unique client emails (case-insensitive). Empty/null emails remain
-- allowed more than once — only non-empty emails must be unique.

UPDATE public.clients
SET email = NULL
WHERE email IS NOT NULL AND btrim(email) = '';

UPDATE public.clients
SET email = lower(btrim(email))
WHERE email IS NOT NULL AND email <> lower(btrim(email));

-- Keep the earliest client for each email; clear email on later duplicates so
-- the unique index can be created.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(btrim(email))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.clients
  WHERE email IS NOT NULL AND btrim(email) <> ''
)
UPDATE public.clients c
SET email = NULL
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS clients_email_unique_ci
  ON public.clients (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';
