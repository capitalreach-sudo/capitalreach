import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * Canonical address for a single deal.
 *
 * The board at /deals?deal=<id> already scrolls to and highlights the deal,
 * and every notification links there; this route makes the address clean and
 * shareable (paste /deals/<uuid> anywhere) by validating and forwarding.
 *
 * Access is the board's own: the lookup runs on the RLS-bound client, so a
 * deal the caller may not see 404s here exactly as it would render nothing
 * there -- owner, team member (023) and admin policies all apply unchanged.
 */
export default async function DealPermalink({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?redirect=/deals/${params.id}`);

  const { data: deal } = await supabase
    .from("deals")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();

  if (!deal) notFound();
  redirect(`/deals?deal=${deal.id}`);
}
