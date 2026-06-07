
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('deal-sourcer-daily-alerts') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deal-sourcer-daily-alerts');

SELECT cron.schedule(
  'deal-sourcer-daily-alerts',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--6692d8d8-4a01-4f1d-8da1-a6b2b05d8dd9.lovable.app/api/public/run-search-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrcGVidmxpbGR5a3R1cGFod3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDM3ODUsImV4cCI6MjA5NjQxOTc4NX0.HeNXzZTqU1WVfVjnIwEXXZRAq5Sh59Ax3xnpm0uzxk8'
    ),
    body := '{}'::jsonb
  );
  $$
);
