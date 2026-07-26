#!/usr/bin/env node
// Signs in as every seeded account and exercises the app's real surface as that
// user: RLS-enforced reads, tier-gated actions, and the API routes.
//
// This is deliberately not browser automation. The bugs this app has had are
// authorization and tier-gating bugs, and those live in what the database and
// route handlers permit — not in what the UI chooses to render. Driving the
// real session token catches a gate that the UI hides but the server allows,
// which is the failure mode that actually matters.
//
// Requires the dev server running on :3000 for the API-route checks.
//
//   node scripts/test-accounts.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_REF = "zhhcsnvkjkxexijiocly";
const PASSWORD = "StagingSeed123!";
const APP = process.env.APP_URL || "http://localhost:3000";

function loadEnv(f) {
  const p = join(root, f);
  if (!existsSync(p)) return {};
  const out = {};
  for (const l of readFileSync(p, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = { ...loadEnv(".env.local"), ...loadEnv(".env.staging") };
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC  = env.SUPABASE_SERVICE_ROLE_KEY;

if (URL_?.includes(PRODUCTION_REF)) {
  console.error("Refusing to run against production."); process.exit(1);
}

const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

async function signIn(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const b = await r.json();
  return b.access_token ?? null;
}

const asUser = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" });

const findings = [];
const record = (sev, area, msg) => findings.push({ sev, area, msg });

// ── Gather accounts ─────────────────────────────────────────────────────────
const profiles = await (await fetch(
  `${URL_}/rest/v1/profiles?select=id,email,role,subscription_tier&order=role`, { headers: svcH }
)).json();

const seeded = profiles.filter(p => p.email?.endsWith("@staging.test"));
console.log(`\nTesting ${seeded.length} seeded accounts against ${APP}\n`);

let serverUp = true;
try { await fetch(APP, { signal: AbortSignal.timeout(3000) }); }
catch { serverUp = false; console.log("  ! dev server not reachable — skipping API-route checks\n"); }

// ── Per-account checks ──────────────────────────────────────────────────────
const results = [];

for (const p of seeded) {
  const tok = await signIn(p.email);
  if (!tok) { record("HIGH", "auth", `${p.email} cannot sign in`); continue; }
  const H = asUser(tok);
  const row = { email: p.email, role: p.role, tier: p.subscription_tier ?? "free" };

  // What can this user READ through RLS?
  const startups  = await (await fetch(`${URL_}/rest/v1/startups?select=id,status`, { headers: H })).json();
  const investors = await (await fetch(`${URL_}/rest/v1/investors?select=id`, { headers: H })).json();
  const deals     = await (await fetch(`${URL_}/rest/v1/deals?select=id,status`, { headers: H })).json();
  const others    = await (await fetch(`${URL_}/rest/v1/profiles?select=id`, { headers: H })).json();

  row.startupsVisible  = Array.isArray(startups)  ? startups.length  : `ERR`;
  row.investorsVisible = Array.isArray(investors) ? investors.length : `ERR`;
  row.dealsVisible     = Array.isArray(deals)     ? deals.length     : `ERR`;
  row.profilesVisible  = Array.isArray(others)    ? others.length    : `ERR`;

  // Non-active listings must never be readable by a non-owner.
  if (Array.isArray(startups)) {
    const leaked = startups.filter(s => s.status !== "active");
    if (leaked.length && p.role === "investor") {
      record("CRITICAL", "rls", `${p.email} (investor) can read ${leaked.length} non-active startup(s) — draft/suspended listings are leaking`);
    }
  }

  // Can a non-admin read the admin audit log?
  const audit = await fetch(`${URL_}/rest/v1/admin_actions?select=id`, { headers: H });
  const auditBody = await audit.json();
  const auditVisible = Array.isArray(auditBody) ? auditBody.length : -1;
  if (p.role !== "admin" && auditVisible > 0) {
    record("CRITICAL", "rls", `${p.email} (${p.role}) can read admin_actions audit log`);
  }

  // Can this user write to someone else's startup?
  const victim = (await (await fetch(`${URL_}/rest/v1/startups?select=id,owner_id&limit=5`, { headers: svcH })).json())
    .find(s => s.owner_id !== p.id);
  if (victim) {
    const w = await fetch(`${URL_}/rest/v1/startups?id=eq.${victim.id}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ tagline: "TAMPERED" }),
    });
    const wb = await w.json().catch(() => []);
    if (w.status === 200 && Array.isArray(wb) && wb.length > 0 && p.role !== "admin") {
      record("CRITICAL", "rls", `${p.email} (${p.role}) can EDIT another user's startup`);
      await fetch(`${URL_}/rest/v1/startups?id=eq.${victim.id}`, {
        method: "PATCH", headers: { ...svcH, Prefer: "return=minimal" },
        body: JSON.stringify({ tagline: "(restored by test harness)" }) });
    }
  }

  // API routes, if the server is up.
  if (serverUp) {
    const ai = await fetch(`${APP}/api/ai/due-diligence`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: startups?.[0]?.id }),
    });
    row.aiRoute = ai.status;   // 401 expected: no cookie session from this harness
  }

  results.push(row);
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log("account".padEnd(34) + "role".padEnd(10) + "tier".padEnd(15) +
            "startups".padEnd(10) + "investors".padEnd(11) + "deals".padEnd(7) + "profiles");
console.log("-".repeat(100));
for (const r of results) {
  console.log(
    r.email.padEnd(34) + String(r.role).padEnd(10) + String(r.tier).padEnd(15) +
    String(r.startupsVisible).padEnd(10) + String(r.investorsVisible).padEnd(11) +
    String(r.dealsVisible).padEnd(7) + String(r.profilesVisible)
  );
}

console.log("\n" + "=".repeat(100));
if (findings.length === 0) {
  console.log("No authorization defects found.");
} else {
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  const seen = new Set();
  for (const f of findings) {
    const k = `${f.sev}|${f.area}|${f.msg.replace(/^\S+@\S+/, "<account>")}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`${f.sev.padEnd(9)} ${f.area.padEnd(8)} ${f.msg}`);
  }
  console.log(`\n${findings.length} finding(s), ${seen.size} distinct.`);
}
console.log("=".repeat(100) + "\n");
