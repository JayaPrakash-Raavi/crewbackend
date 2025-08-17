import { createClient } from "@supabase/supabase-js";

const url = (process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_KEY || "").trim();

if (!url || !key) {
  // Helpful message instead of a cryptic crash
  console.error("[Supabase] Missing env vars. Check SUPABASE_URL and SUPABASE_SERVICE_KEY in your backend .env.local");
  console.error("SUPABASE_URL present?", Boolean(url), "SUPABASE_SERVICE_KEY present?", Boolean(key));
  throw new Error("Supabase env vars missing");
}

export const supabaseAdmin = createClient(url, key);
