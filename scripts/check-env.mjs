#!/usr/bin/env node
//
// Reports which integrations are actually configured, and what breaks for each
// one that is not. Mirrors the placeholder logic in lib/env.ts so this agrees
// with what the running app believes -- a value like "your-key-here" counts as
// unset in both places.
//
//   node scripts/check-env.mjs                 # checks .env.local
//   node scripts/check-env.mjs .env.staging    # checks another file
//   node scripts/check-env.mjs --env           # checks the live process env
//                                              # (use on Vercel via `vercel env pull`)
//
// Exits 1 when a REQUIRED variable is missing, so CI can gate on it.

import fs from "node:fs";
import path from "node:path";

const PLACEHOLDER_MARKERS = ["replace_me", "placeholder", "your-", "xxx", "changeme"];

function isConfigured(value) {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  const lower = v.toLowerCase();
  return !PLACEHOLDER_MARKERS.some((m) => lower.includes(m));
}

const arg = process.argv[2];
const useProcessEnv = arg === "--env";
const file = useProcessEnv ? null : path.resolve(process.cwd(), arg || ".env.local");

let vars;
if (useProcessEnv) {
  vars = process.env;
} else {
  if (!fs.existsSync(file)) {
    console.error(`No such env file: ${file}`);
    console.error(`Copy .env.example to .env.local and fill it in.`);
    process.exit(1);
  }
  vars = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

/** `all` = every listed var must be set; `any` = at least one. */
const GROUPS = [
  {
    name: "Core (required)",
    required: true,
    mode: "all",
    keys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    breaks: "The app will not boot — assertCoreEnv() throws.",
  },
  {
    name: "Service role",
    mode: "all",
    keys: ["SUPABASE_SERVICE_ROLE_KEY"],
    breaks: "Admin routes, cron jobs and anything bypassing RLS.",
  },
  {
    name: "Brand domain",
    mode: "all",
    keys: ["NEXT_PUBLIC_BRAND_DOMAIN"],
    breaks: "Every support@/noreply@ address. Has no default on purpose.",
  },
  {
    name: "Email (Resend)",
    mode: "all",
    keys: ["RESEND_API_KEY"],
    breaks: "All transactional email is skipped with a console warning. " +
            "Does NOT affect signup confirmation mail — that is Supabase's own SMTP.",
  },
  {
    name: "Contact form inbox",
    mode: "all",
    keys: ["CONTACT_INBOX_EMAIL"],
    breaks: "The contact route refuses to send rather than guessing an address.",
  },
  {
    name: "Billing (Stripe)",
    mode: "all",
    keys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    breaks: "Checkout and subscription webhooks.",
  },
  {
    name: "Stripe prices",
    mode: "all",
    keys: [
      "STRIPE_PRICE_FOUNDER_STARTER_MONTHLY",
      "STRIPE_PRICE_FOUNDER_GROWTH_MONTHLY",
      "STRIPE_PRICE_INVESTOR_ANGEL_MONTHLY",
      "STRIPE_PRICE_INVESTOR_PRO_MONTHLY",
    ],
    breaks: "Every paid checkout path. These are each plan's envKey in " +
            "lib/plans.ts and are the only price names the app reads.",
  },
  {
    name: "AI (OpenAI)",
    mode: "all",
    keys: ["OPENAI_API_KEY"],
    breaks: "/api/ai/* returns 503.",
  },
  {
    name: "Rate limiting (Upstash)",
    mode: "all",
    keys: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    breaks: "Falls back to in-memory limiting — per-instance, so ineffective " +
            "across serverless invocations.",
  },
  {
    name: "Contracts (DocuSign)",
    mode: "all",
    keys: ["DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_SECRET_KEY", "DOCUSIGN_ACCOUNT_ID"],
    breaks: "E-signature flows.",
  },
  {
    name: "Cron auth",
    mode: "all",
    keys: ["CRON_SECRET"],
    breaks: "Scheduled routes are left unauthenticated.",
  },
];

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m";
const DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

console.log(`\n${BOLD}Environment check${RESET} ${DIM}(${useProcessEnv ? "process env" : file})${RESET}\n`);

let missingRequired = 0;
let missingOptional = 0;

for (const g of GROUPS) {
  const set = g.keys.filter((k) => isConfigured(vars[k]));
  const ok = g.mode === "any" ? set.length > 0 : set.length === g.keys.length;

  const mark = ok ? `${GREEN}✓${RESET}` : g.required ? `${RED}✗${RESET}` : `${YELLOW}○${RESET}`;
  console.log(`${mark} ${BOLD}${g.name}${RESET} ${DIM}(${set.length}/${g.keys.length})${RESET}`);

  if (!ok) {
    if (g.required) missingRequired++; else missingOptional++;
    for (const k of g.keys.filter((k) => !isConfigured(vars[k]))) {
      const present = k in vars && vars[k]?.trim();
      console.log(`    ${DIM}-${RESET} ${k}${present ? ` ${DIM}(placeholder)${RESET}` : ""}`);
    }
    console.log(`    ${DIM}→ ${g.breaks}${RESET}`);
  }
  console.log();
}

console.log(
  missingRequired
    ? `${RED}${BOLD}${missingRequired} required group(s) missing — the app will not boot.${RESET}`
    : `${GREEN}${BOLD}All required variables are set.${RESET}`
);
if (missingOptional) {
  console.log(`${YELLOW}${missingOptional} optional integration(s) unconfigured — each degrades as noted above.${RESET}`);
}
console.log();

process.exit(missingRequired ? 1 : 0);
