# Staging environment

Right now local development and production share one Supabase project
(`zhhcsnvkjkxexijiocly`). Every migration run against it is live immediately,
and any test that writes data writes to real user data. This document sets up a
second project so that stops being true.

## Why this matters here specifically

Two migrations (005 and 008) sat unapplied against production for a while
without anyone noticing:

- **008** made every investor profile return 404, because the page selected
  `profiles` columns that did not exist.
- **005** left the tier CHECK constraints on their old values, so the database
  rejected the exact tier names (`starter`, `growth`, `pro`) the Stripe webhook
  writes on a successful payment. A founder could have been charged and left on
  the free plan.

Neither broke the build. Both were only visible at runtime. A staging project
plus `npm run db:verify` catches this class of problem before users do.

## One-time setup

### 1. Create the staging Supabase project

In the Supabase dashboard: **New project**, name it something like
`capitalreach-staging`, same region as production. Note the project ref.

### 2. Apply the whole schema

```bash
npm run db:bootstrap        # regenerates supabase/bootstrap.sql from migrations
```

Open `supabase/bootstrap.sql`, copy it, paste into the staging project's SQL
editor, and run once. It concatenates every migration in order and each one is
idempotent, so re-running is harmless.

Do **not** use `supabase/migrations/000_combined_for_dashboard.sql` — it is a
hand-maintained bundle that stopped being updated around migration 003 and is
exactly how a database ends up silently missing everything after that. It is
kept only for history.

### 3. Verify it took

```bash
SUPABASE_URL=https://<staging-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key> \
npm run db:verify
```

Expect `All checks passed.` The script exits non-zero on failure, so it can gate
a deploy.

### 4. Point Vercel preview deployments at staging

Vercel → project → **Settings → Environment Variables**. For each of the
following, add the **staging** value scoped to *Preview* only, leaving the
*Production* value alone:

| Variable | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview |
| `NEXT_PUBLIC_APP_URL` | Preview |

Use Stripe **test mode** keys for Preview as well, so a test checkout cannot
charge a real card.

### 5. Point local development at staging

Copy your production values out of `.env.local` somewhere safe first, then
replace the Supabase values with the staging ones. From then on `npm run dev`
talks to staging, and destructive testing is free.

## Day-to-day flow

1. Write the migration in `supabase/migrations/NNN_name.sql`.
2. Run it in the **staging** SQL editor. Confirm with `npm run db:verify`.
3. Exercise the feature against staging.
4. Merge to `main`. Vercel deploys production.
5. Run the same migration in the **production** SQL editor.
6. Run `npm run db:verify` against production.

Step 6 is the one that would have caught 005 and 008.

## Known gap

Migrations are still applied by pasting SQL, which is what allows one to be
skipped. The durable fix is the Supabase CLI:

```bash
npx supabase link --project-ref <ref>
npm run db:migrate            # supabase db push, already in package.json
```

That requires a database password or access token, so it is left for you to run
rather than wired up here. Until then, `npm run db:verify` is the safety net.
