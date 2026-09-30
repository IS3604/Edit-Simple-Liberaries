window.ES_CONFIG = {
  SUPABASE_URL: "https://ddiwrhpaankvxnbjbbxl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkaXdyaHBhYW5rdnhuYmpiYnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwOTk0MjcsImV4cCI6MjEwNTY3NTQyN30.WTwB1o074RL0gl1BY2kJQpyz4sBFpLjcX17O_n2QcSQ",
  // Cloudflare Turnstile site key (public). Leave "" to switch the CAPTCHA off.
  TURNSTILE_SITE_KEY: "0x4AAAAAAFInMoAYUypljVbb",
  // Where NEW video uploads go: "supabase" or "b2" (Backblaze). Existing videos play from wherever they are.
  VIDEO_STORAGE: "b2",
  // Plan sizes used for the owner's "storage remaining" meters (change if you upgrade a plan)
  LIMITS: { DATABASE_MB: 500, SUPABASE_STORAGE_MB: 1024, B2_GB: 10 }
};
