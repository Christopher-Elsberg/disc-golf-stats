import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Capture the recovery callback before Supabase initializes and removes
// the URL fragment. Some hosted projects fall back to their Site URL ("/")
// when /reset-password has not yet been allowlisted.
export const RECOVERY_REDIRECT_FLAG = "disc-golf-recovery-redirect";
if (typeof window !== "undefined" && window.location.pathname === "/") {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (fragment.get("type") === "recovery") {
    try {
      window.sessionStorage.setItem(RECOVERY_REDIRECT_FLAG, String(Date.now()));
    } catch {
      // Recovery is still detected by the redirect component if storage is off.
    }
  }
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,

      storage:
        typeof window !== "undefined"
          ? window.sessionStorage
          : undefined,
    },
  }
);
