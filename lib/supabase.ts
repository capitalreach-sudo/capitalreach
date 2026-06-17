import { createBrowserClient } from "@supabase/ssr";

// Browser/client-side Supabase client — safe to import in "use client" components
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
