import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { maskContactDetails } from "@/lib/message-safety";
import { isUuid } from "@/lib/utils";

/**
 * The founder's team, saved with the same contact-detail protection every
 * other piece of listing prose already gets.
 *
 * This table was, until now, written straight from the browser
 * (onboarding, and this route's own caller before it existed) relying on
 * founders_owner's RLS policy for ownership and nothing at all for content
 * -- a bio, a name, or a "previously at" line could carry a pasted email or
 * phone number and it would save and render completely unmasked, the exact
 * gap /api/startups/save exists to close for the listing's own prose. RLS
 * already scopes every row to the caller's own startup (startups.owner_id
 * = auth.uid()), so this route keeps writing through the caller's own
 * session rather than the service role -- only the masking step is new.
 */

interface FounderInput {
  id?: string;
  name: string;
  role: string;
  prev?: string | null;
  linkedin_url?: string | null;
  twitter_url?: string | null;
  photo_url?: string | null;
  bio?: string | null;
}

const FREE_TEXT_FIELDS = ["name", "role", "prev", "bio"] as const;

function maskFounder(f: FounderInput): { row: FounderInput; masked: boolean } {
  let masked = false;
  const row = { ...f };
  for (const key of FREE_TEXT_FIELDS) {
    const value = row[key];
    if (typeof value !== "string" || !value) continue;
    const res = maskContactDetails(value, { allowLinks: false });
    if (res.masked.length) { row[key] = res.text; masked = true; }
  }
  return { row, masked };
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const startupId = body?.startupId;
  const founders = body?.founders;
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId required" }, { status: 400 });
  if (!Array.isArray(founders)) return NextResponse.json({ error: "founders must be an array" }, { status: 400 });

  const valid = (founders as FounderInput[]).filter((f) => f?.name?.trim() && f?.role?.trim());
  let anyMasked = false;
  const toInsert = valid.map((f) => {
    const trimmed: FounderInput = {
      name: f.name.trim(), role: f.role.trim(),
      prev: f.prev?.trim() || null,
      linkedin_url: f.linkedin_url?.trim() || null,
      twitter_url: f.twitter_url?.trim() || null,
      photo_url: f.photo_url?.trim() || null,
      bio: f.bio?.trim() || null,
    };
    const { row, masked } = maskFounder(trimmed);
    if (masked) anyMasked = true;
    return { startup_id: startupId, ...row };
  });

  // Prior rows read first (RLS already scopes this to the caller's own
  // startup); the insert runs before the delete so a failed insert never
  // costs an existing team its rows.
  const { data: prior, error: priorError } = await supabase
    .from("startup_founders").select("id").eq("startup_id", startupId);
  if (priorError) return NextResponse.json({ error: "Could not load the current team" }, { status: 500 });
  const priorIds = (prior ?? []).map((r) => r.id as string);

  let written: unknown[] = [];
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("startup_founders")
      .insert(toInsert)
      .select("id, startup_id, name, role, prev, linkedin_url, twitter_url, photo_url, bio");
    if (error) return NextResponse.json({ error: "Could not save the team" }, { status: 500 });
    written = inserted ?? [];
  }
  if (priorIds.length > 0) {
    const { error } = await supabase.from("startup_founders").delete().in("id", priorIds);
    if (error) return NextResponse.json({ error: "Could not clear the previous team rows" }, { status: 500 });
  }

  return NextResponse.json({ founders: written, masked: anyMasked });
}
