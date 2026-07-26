// Central environment configuration.
//
// Several integrations ship with placeholder values in .env.example so the app
// boots without them. Each module grew its own slightly different "is this a
// real value?" check (docusign.ts, openai.ts, redis.ts, stats.ts). This is the
// canonical version — new code should use it rather than adding a fifth.

const PLACEHOLDER_MARKERS = ["REPLACE_ME", "placeholder", "your-", "xxx", "changeme"];

/** True when the value is present and is not an obvious placeholder. */
export function isConfigured(value: string | undefined | null): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length === 0) return false;
  const lower = v.toLowerCase();
  return !PLACEHOLDER_MARKERS.some(marker => lower.includes(marker.toLowerCase()));
}

/** Reads an env var, returning undefined when unset or a placeholder. */
export function optionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return isConfigured(value) ? value : undefined;
}

/**
 * Reads an env var that the calling code cannot work without.
 * Throws at call time (not import time) so a missing key surfaces as a handled
 * request error rather than crashing the whole server on boot.
 */
export function requireEnv(key: string): string {
  const value = optionalEnv(key);
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `Set it in .env.local (local) or the Vercel project settings (deployed).`
    );
  }
  return value;
}

// ── Per-integration availability ─────────────────────────────────────────────
// Route handlers should check these and degrade gracefully rather than 500.

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",

  supabase: {
    url:            optionalEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey:        optionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: optionalEnv("SUPABASE_SERVICE_ROLE_KEY"),
  },

  stripe: {
    secretKey:     optionalEnv("STRIPE_SECRET_KEY"),
    webhookSecret: optionalEnv("STRIPE_WEBHOOK_SECRET"),
  },

  resend: {
    apiKey:    optionalEnv("RESEND_API_KEY"),
    fromEmail: process.env.RESEND_FROM_EMAIL || "noreply@capitalreach.com",
    // Deliberately has no default. capitalreach.com is not ours yet and has
    // live Zoho MX records, so a hardcoded support@capitalreach.com sent every
    // contact submission -- name, email, company, message -- to a mailbox
    // belonging to whoever owns that domain. A fallback here would silently
    // reintroduce that, so the route refuses to send when this is unset.
    contactInbox: optionalEnv("CONTACT_INBOX_EMAIL"),
  },

  openai: {
    apiKey: optionalEnv("OPENAI_API_KEY"),
  },

  redis: {
    url:   optionalEnv("UPSTASH_REDIS_REST_URL"),
    token: optionalEnv("UPSTASH_REDIS_REST_TOKEN"),
  },

  docusign: {
    integrationKey: optionalEnv("DOCUSIGN_INTEGRATION_KEY"),
  },
} as const;

// ── Feature availability flags ───────────────────────────────────────────────

export const isSupabaseConfigured = !!(env.supabase.url && env.supabase.anonKey);
export const isServiceRoleConfigured = !!env.supabase.serviceRoleKey;
export const isStripeConfigured   = !!env.stripe.secretKey;
export const isResendConfigured   = !!env.resend.apiKey;
export const isOpenAIConfigured   = !!env.openai.apiKey;
export const isRedisConfigured    = !!(env.redis.url && env.redis.token);
export const isDocuSignConfigured = !!env.docusign.integrationKey;

/**
 * Env vars the app genuinely cannot run without. Everything else degrades:
 * no Stripe means no billing, no Resend means no email, no OpenAI means the
 * AI routes return 503 — all handled, none fatal.
 */
export function assertCoreEnv(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }
}
