import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Server-only Supabase clients — only import in Server Components and Route Handlers
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as any)
            );
          } catch {}
        },
      },
    }
  );
}

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        // Next patches global fetch and caches GET responses. supabase-js uses
        // fetch underneath, so without this a query issued from a route handler
        // can be answered from Next's cache rather than the database -- and
        // stays answered that way for the life of the server process.
        //
        // Found via the follow-up cron: it returned an identical row count on
        // every call regardless of the data, changing only when the server
        // restarted. `export const dynamic = "force-dynamic"` does not cover
        // this; it governs rendering, not the fetches underneath.
        //
        // This client is the service-role one used for reads and writes that
        // must reflect current state, so caching is never what we want here.
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
