import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";
import { DOC_TYPES } from "@/lib/upload-validation";

/**
 * An investor asks a founder for a document type that isn't uploaded yet.
 * Lands as a doc_request notification on the founder, linking to their
 * documents manager. No table of its own -- the notification is the request.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId, docType } = await req.json().catch(() => ({}));
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId required" }, { status: 400 });
  if (!(DOC_TYPES as readonly string[]).includes(docType)) {
    return NextResponse.json({ error: "invalid docType" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: inv }, { data: startup }] = await Promise.all([
    admin.from("investors").select("id, display_name, firm_name").eq("owner_id", user.id).maybeSingle(),
    admin.from("startups").select("owner_id, name, status").eq("id", startupId).maybeSingle(),
  ]);
  if (!inv) return NextResponse.json({ error: "Investors only" }, { status: 403 });
  if (!startup || startup.status !== "active") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const label = ({ pitch_deck: "pitch deck", financial_model: "financial model", cap_table: "cap table", other: "document" } as Record<string, string>)[docType];
  await notifyUser({
    userId: startup.owner_id,
    type: "doc_request",
    title: `${inv.display_name ?? inv.firm_name ?? "An investor"} requested your ${label}`,
    body: "Upload it from your documents manager to keep the conversation moving.",
    href: "/dashboard/startup/documents",
  });
  return NextResponse.json({ requested: true });
}
