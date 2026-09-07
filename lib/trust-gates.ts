import { createAdminClient } from "@/lib/supabase-server";
import { effectiveTrustLevel, type TrustLevel, type SubjectType } from "@/lib/trust";

/**
 * Where verification stops being a badge and starts being a wall.
 *
 * A trust ladder that gates nothing is decoration: the whole point is that
 * certain acts -- the ones that can actually hurt somebody -- require a rung.
 * Browsing stays open, because a market nobody can look at is a dead market.
 *
 *   publish a listing   -> level 3, a register confirms the company AND that
 *                          this person may act for it. Stops the attack you
 *                          cannot undo: a real startup listed by a stranger.
 *   message a founder   -> level 2, a verified human. Advance-fee scams need
 *                          an anonymous sender.
 *   open a data room    -> level 2. An NDA against an unidentified name is
 *                          unenforceable paper.
 */
export type GatedAction = "publish" | "message" | "dataroom";

export type GateMode = "off" | "new" | "all";

export interface GateConfig {
  mode: GateMode;
  /** Accounts created on or after this are in scope while mode is "new". */
  since: Date | null;
  levels: Record<GatedAction, TrustLevel>;
}

const CONFIG_KEYS = [
  "trust_gates", "trust_gates_since",
  "gate_publish_level", "gate_message_level", "gate_dataroom_level",
];

const DEFAULTS: Record<GatedAction, TrustLevel> = { publish: 3, message: 2, dataroom: 2 };

function coerceLevel(v: string | undefined, fallback: TrustLevel): TrustLevel {
  const n = parseInt(v ?? "", 10);
  return (Number.isFinite(n) && n >= 0 && n <= 4 ? n : fallback) as TrustLevel;
}

export async function getGateConfig(): Promise<GateConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("platform_config").select("key, value").in("key", CONFIG_KEYS);
    const map: Record<string, string> = {};
    for (const r of data ?? []) map[r.key] = r.value;

    const raw = map["trust_gates"];
    const mode: GateMode = raw === "all" || raw === "off" ? raw : raw === "new" ? "new" : "off";
    const sinceRaw = map["trust_gates_since"];
    const since = sinceRaw ? new Date(sinceRaw) : null;

    return {
      mode,
      since: since && !Number.isNaN(since.getTime()) ? since : null,
      levels: {
        publish:  coerceLevel(map["gate_publish_level"],  DEFAULTS.publish),
        message:  coerceLevel(map["gate_message_level"],  DEFAULTS.message),
        dataroom: coerceLevel(map["gate_dataroom_level"], DEFAULTS.dataroom),
      },
    };
  } catch {
    // A gate that fails open is not a gate -- but a gate that fails closed on
    // a database blip locks the whole platform out of its own conversations.
    // "off" keeps the product working and the signals still record; the
    // config read failing is itself the thing to alert on.
    return { mode: "off", since: null, levels: DEFAULTS };
  }
}

export interface GateSubject {
  type: SubjectType;
  id: string;
  trustLevel: number | null;
  trustExpiresAt: string | null;
  /** When the ACCOUNT was created -- what "new" is measured against. */
  createdAt: string | null;
}

export type GateVerdict =
  | { allowed: true; reason: "gate_off" | "grandfathered" | "level_met" }
  | { allowed: false; reason: "level_required"; required: TrustLevel; held: TrustLevel; action: GatedAction };

/**
 * The whole decision, in one pure function so it can be reasoned about and
 * tested without a database.
 *
 * `held` runs through effectiveTrustLevel, so an EXPIRED verification does not
 * hold a gate open. That is deliberate: a lapsed check is exactly how a
 * hijacked account keeps its privileges.
 */
export function evaluateGate(
  action: GatedAction,
  subject: GateSubject,
  config: GateConfig,
): GateVerdict {
  if (config.mode === "off") return { allowed: true, reason: "gate_off" };

  const required = config.levels[action];
  if (required <= 0) return { allowed: true, reason: "gate_off" };

  if (config.mode === "new" && config.since && subject.createdAt) {
    const created = new Date(subject.createdAt);
    // Everyone who was already here when the gates went up keeps working.
    // They are reachable by the verification prompts, not by a locked door.
    if (!Number.isNaN(created.getTime()) && created < config.since) {
      return { allowed: true, reason: "grandfathered" };
    }
  }

  const held = effectiveTrustLevel(subject.trustLevel, subject.trustExpiresAt);
  if (held >= required) return { allowed: true, reason: "level_met" };
  return { allowed: false, reason: "level_required", required, held, action };
}

/** i18n keys for the refusal, so every gate refuses in the same words. */
export const GATE_MESSAGE_KEY: Record<GatedAction, string> = {
  publish:  "gate.publishBlocked",
  message:  "gate.messageBlocked",
  dataroom: "gate.dataroomBlocked",
};

/**
 * The shape every gated route returns when it refuses. 403 with a route to
 * the fix -- a refusal that does not say how to proceed is just a wall.
 */
export function gateRefusal(verdict: Extract<GateVerdict, { allowed: false }>) {
  return {
    error: "verification_required",
    action: verdict.action,
    requiredLevel: verdict.required,
    heldLevel: verdict.held,
    messageKey: GATE_MESSAGE_KEY[verdict.action],
    verifyUrl: "/verify",
  };
}

/** Load a startup as a gate subject. Owner account age is what "new" measures. */
export async function startupGateSubject(startupId: string): Promise<GateSubject | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("startups")
    .select("id, owner_id, trust_level, trust_expires_at, created_at")
    .eq("id", startupId)
    .maybeSingle();
  if (!data) return null;
  // The listing's own creation date would let somebody sidestep the gate by
  // making a fresh listing on an old account -- but that account has been
  // here all along, and grandfathering is about not punishing existing
  // members. Account age is the honest measure.
  const { data: prof } = await admin
    .from("profiles").select("created_at").eq("id", data.owner_id).maybeSingle();
  return {
    type: "startup",
    id: data.id,
    trustLevel: data.trust_level,
    trustExpiresAt: data.trust_expires_at,
    createdAt: prof?.created_at ?? data.created_at,
  };
}

/** Load an investor as a gate subject, by their auth user id. */
export async function investorGateSubject(userId: string): Promise<GateSubject | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("investors")
    .select("id, trust_level, trust_expires_at, created_at")
    .eq("owner_id", userId)
    .maybeSingle();
  if (!data) return null;
  const { data: prof } = await admin
    .from("profiles").select("created_at").eq("id", userId).maybeSingle();
  return {
    type: "investor",
    id: data.id,
    trustLevel: data.trust_level,
    trustExpiresAt: data.trust_expires_at,
    createdAt: prof?.created_at ?? data.created_at,
  };
}
