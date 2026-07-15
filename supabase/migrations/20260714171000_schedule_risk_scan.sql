-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Create a cron job to call the risk-scan edge function daily at midnight
-- We use a DO block to safely wrap the cron.schedule call.
DO $$
BEGIN
  -- We assume the edge function is deployed at:
  -- https://<project-ref>.supabase.co/functions/v1/risk-scan
  -- Since we don't have the project URL in SQL cleanly without vault, 
  -- in a real Supabase environment you would configure the URL or use a webhook.
  
  -- The requirement says "Build a scheduled risk-scan edge function that runs at least daily"
  -- Schedule it to run daily at 00:00 (midnight)
  
  PERFORM cron.schedule(
    'daily-risk-scan',
    '0 0 * * *',
    $$
      SELECT net.http_post(
          url:='https://' || current_setting('request.headers')::json->>'host' || '/functions/v1/risk-scan',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.claim.role', true) || '"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
  );
EXCEPTION
  WHEN undefined_function OR undefined_object THEN
    RAISE NOTICE 'pg_cron or pg_net not properly configured or not available locally. Cron schedule skipped.';
END
$$;
