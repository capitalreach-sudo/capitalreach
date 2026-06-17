# CapitalReach — Setup Guide

Complete plain-English instructions for getting CapitalReach running locally and deploying to production.

---

## Prerequisites

Before you start, make sure you have:
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **npm** (comes with Node.js)
- **Git** — [git-scm.com](https://git-scm.com)
- **Supabase CLI** — `npm install -g supabase`
- **Vercel CLI** (optional) — `npm install -g vercel`

---

## 1. Clone & Install

```bash
cd ~/vaultrise
npm install
```

This installs all dependencies including Next.js, Supabase, Stripe, Resend, OpenAI, Trigger.dev, Upstash Redis, DocuSign, and Recharts.

---

## 2. Supabase Setup

### 2a. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name it `vaultrise`, choose a region close to your users
3. Save the **database password** somewhere secure
4. Wait for the project to provision (~2 minutes)

### 2b. Get your API keys
In your Supabase project:
- Go to **Settings → API**
- Copy **Project URL** → paste into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`
- Copy **anon public** key → paste as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Copy **service_role secret** key → paste as `SUPABASE_SERVICE_ROLE_KEY`

### 2c. Run database migrations
```bash
# Link to your Supabase project (run once)
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations
supabase db push
```

This creates all tables, RLS policies, indexes, and helper functions.

### 2d. Set up Storage buckets
In Supabase Dashboard → **Storage**:
1. Create bucket: `startup-assets` — **Private** (signed URLs only)
2. Create bucket: `avatars` — **Public**

Add these RLS policies to `startup-assets`:
- Authenticated users can upload to their own folder
- Startup owners can read their files
- Investors with signed URLs can read pitch decks

### 2e. Enable Google OAuth (optional)
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → Create an OAuth 2.0 Client
2. Add `https://YOUR_PROJECT.supabase.co/auth/v1/callback` as an authorized redirect URI
3. In Supabase → **Authentication → Providers → Google** → paste your Client ID and Secret

---

## 3. Stripe Setup

### 3a. Create a Stripe account
Go to [stripe.com](https://stripe.com) and create an account. Switch to **Test mode** for development.

### 3b. Get API keys
- Dashboard → **Developers → API keys**
- Copy **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Copy **Secret key** → `STRIPE_SECRET_KEY`

### 3c. Create subscription products & prices

In Stripe Dashboard → **Products**, create these products with **recurring monthly prices**:

| Product Name | Price | Save the Price ID as |
|---|---|---|
| CapitalReach Listed | $79/month | `STRIPE_STARTUP_LISTED_PRICE_ID` |
| CapitalReach Pro | $199/month | `STRIPE_STARTUP_PRO_PRICE_ID` |
| CapitalReach Premium | $499/month | `STRIPE_STARTUP_PREMIUM_PRICE_ID` |
| Investor Angel | $99/month | `STRIPE_INVESTOR_ANGEL_PRICE_ID` |
| Investor Pro | $299/month | `STRIPE_INVESTOR_PRO_PRICE_ID` |

### 3d. Set up the webhook

**For local development:**
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Forward webhooks to localhost
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
Copy the **webhook signing secret** it prints → `STRIPE_WEBHOOK_SECRET`

**For production:**
1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. URL: `https://capitalreach.com/api/webhooks/stripe`
3. Select these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `checkout.session.completed`
4. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### 3e. Set up Customer Portal
Stripe Dashboard → **Settings → Billing → Customer portal**:
- Enable: Cancel subscriptions, Update payment methods, Download invoices
- Set your brand logo and colors

---

## 4. Resend Email Setup

1. Go to [resend.com](https://resend.com) → Create account
2. **API Keys** → Create a new key → paste as `RESEND_API_KEY`
3. **Domains** → Add your domain (e.g. `capitalreach.com`) and verify DNS records
4. Set `RESEND_FROM_EMAIL=noreply@capitalreach.com`

**For local development:** Use `onboarding@resend.dev` as the FROM address (Resend's sandbox domain — no verification needed for testing).

### Preview email templates
```bash
npm run email:dev
```
Opens at `http://localhost:3001` — live preview of all React Email templates.

---

## 5. OpenAI Setup

1. Go to [platform.openai.com](https://platform.openai.com) → API Keys
2. Create a new key → paste as `OPENAI_API_KEY`
3. Make sure you have credits loaded (gpt-4o-mini is very cheap — ~$0.001/request)

---

## 6. Upstash Redis Setup

1. Go to [upstash.com](https://upstash.com) → Create a Redis database
2. Choose the region closest to your Vercel deployment
3. Copy **REST URL** → `UPSTASH_REDIS_REST_URL`
4. Copy **REST Token** → `UPSTASH_REDIS_REST_TOKEN`

---

## 7. Trigger.dev Setup

1. Go to [trigger.dev](https://trigger.dev) → Create account → New project named `vaultrise`
2. Copy your **Secret key** → `TRIGGER_SECRET_KEY`
3. Deploy your jobs:
```bash
npx trigger.dev@latest deploy
```

This registers all four scheduled jobs:
- `weekly-investor-digest` — Mondays 8am UTC
- `startup-score-sync` — Daily 2am UTC
- `investor-recommendations` — Daily 9am UTC
- `dunning-sequence` — Daily 6am UTC

---

## 8. DocuSign Setup

1. Create a [DocuSign Developer account](https://developers.docusign.com) (free)
2. Create an **Integration Key** (App Key) in Apps & Keys
3. Set up JWT authentication:
   - Generate an RSA key pair
   - Add the public key to your DocuSign app
   - Save the private key as `DOCUSIGN_SECRET_KEY` (base64 encoded)
4. Copy your **Integration Key** → `DOCUSIGN_INTEGRATION_KEY`
5. Copy your **Account ID** → `DOCUSIGN_ACCOUNT_ID`
6. Set `DOCUSIGN_REDIRECT_URI=https://capitalreach.com/api/nda/callback`

**Configure DocuSign Connect webhook:**
- DocuSign Admin → Connect → Add Configuration
- URL: `https://capitalreach.com/api/nda/webhook`
- Trigger: Envelope completed

---

## 9. Run Locally

Copy the environment template and fill in all values:
```bash
cp .env.local .env.local
# Edit .env.local with all your keys
```

Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Create your first admin user:**
1. Sign up at `/auth/signup`
2. In Supabase Dashboard → **Table Editor → profiles**
3. Find your row and change `role` to `admin`
4. You can now access `/admin`

---

## 10. Deploy to Vercel

### 10a. Push to GitHub
```bash
git init
git add .
git commit -m "Initial CapitalReach build"
git remote add origin https://github.com/YOUR_USERNAME/vaultrise.git
git push -u origin main
```

### 10b. Import to Vercel
1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repository
3. Framework: **Next.js** (auto-detected)
4. Add all environment variables from `.env.local`
5. Add `NEXT_PUBLIC_APP_URL=https://your-domain.com`
6. Click **Deploy**

### 10c. Update webhook URLs
After deployment, update these URLs with your production domain:
- Stripe webhook endpoint
- DocuSign Connect webhook
- Supabase OAuth redirect URLs

### 10d. Configure custom domain
Vercel Dashboard → **Domains** → Add your domain → Follow DNS instructions

---

## 11. Post-Deploy Checklist

- [ ] Run `supabase db push` against production
- [ ] Create Stripe webhook for production URL
- [ ] Verify Resend domain DNS records
- [ ] Test Stripe checkout with test card `4242 4242 4242 4242`
- [ ] Create first admin user in Supabase
- [ ] Deploy Trigger.dev jobs: `npx trigger.dev@latest deploy`
- [ ] Test startup onboarding end-to-end
- [ ] Test investor onboarding end-to-end
- [ ] Submit a test startup and approve it as admin
- [ ] Send a test message and verify email notification arrives
- [ ] Test success fee invoice generation

---

## 12. Environment Variables Reference

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=          # Your project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Public anon key
SUPABASE_SERVICE_ROLE_KEY=         # Secret service role key (server-only)

# Stripe
STRIPE_SECRET_KEY=                 # sk_live_... or sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= # pk_live_... or pk_test_...
STRIPE_WEBHOOK_SECRET=             # whsec_...
STRIPE_STARTUP_LISTED_PRICE_ID=    # price_...
STRIPE_STARTUP_PRO_PRICE_ID=       # price_...
STRIPE_STARTUP_PREMIUM_PRICE_ID=   # price_...
STRIPE_INVESTOR_ANGEL_PRICE_ID=    # price_...
STRIPE_INVESTOR_PRO_PRICE_ID=      # price_...

# OpenAI
OPENAI_API_KEY=                    # sk-...

# Resend
RESEND_API_KEY=                    # re_...
RESEND_FROM_EMAIL=                 # noreply@yourdomain.com

# Trigger.dev
TRIGGER_SECRET_KEY=                # tr_...

# Upstash Redis
UPSTASH_REDIS_REST_URL=            # https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=          # ...

# DocuSign
DOCUSIGN_INTEGRATION_KEY=          # UUID from DocuSign
DOCUSIGN_SECRET_KEY=               # Base64-encoded RSA private key
DOCUSIGN_ACCOUNT_ID=               # Your DocuSign account ID
DOCUSIGN_REDIRECT_URI=             # https://yourdomain.com/api/nda/callback

# App
NEXT_PUBLIC_APP_URL=               # https://yourdomain.com (no trailing slash)
```

---

## 13. Revenue Streams Summary

| Stream | How it works | Where to find it |
|---|---|---|
| **Startup subscriptions** | Monthly Stripe Billing (Listed $79, Pro $199, Premium $499) | Stripe Dashboard → Subscriptions |
| **Investor memberships** | Monthly Stripe Billing (Angel $99, Pro $299) | Stripe Dashboard → Subscriptions |
| **Success fees** | 2% of closed round, auto-invoiced via Stripe | Stripe Dashboard → Invoices |
| **AI reports (à la carte)** | $29/report for free/Angel investors | Stripe Dashboard → Payment Intents |

---

## 14. Architecture Overview

```
Browser
  └─→ Next.js App Router (Vercel Edge)
        ├─→ Supabase (PostgreSQL + Auth + Realtime + Storage)
        ├─→ Stripe (Billing + Webhooks)
        ├─→ Resend (Transactional email)
        ├─→ OpenAI (AI features)
        ├─→ Upstash Redis (Rate limiting + caching)
        ├─→ DocuSign (NDA signing)
        └─→ Trigger.dev (Background jobs)
```

---

## 15. Support

- Create a GitHub issue for bugs
- Email `support@capitalreach.com` for billing questions
- Admin panel at `/admin` for platform operations

---

*Generated by CapitalReach build system · Last updated: 2026*
