import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { getLaunchStatus } from "@/lib/launchMode";
import { getStageStatus } from "@/lib/pricing-stage";
import { getLocale, getTranslator } from "@/lib/locale-server";
import { buildAccessContext, founderCan, isSuspended } from "@/lib/access";
import { TRUST_LADDER, effectiveTrustLevel, isExpired, type SubjectType, type TrustLevel } from "@/lib/trust";
import { domainVerifyRecord, DOMAIN_VERIFY_PREFIX, isFreemailDomain, normaliseDomain } from "@/lib/trust-signals";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { VerifyFlow, type CaseView } from "@/components/verify/verify-flow";
import type { EvidenceView } from "@/components/verify/evidence-item";

/**
 * The verification application, from the applicant's side.
 *
 * This page decides whether a real founder bothers, so it says three things
 * before it asks for anything: what we check, what we do not check, and how
 * long a decision takes. A trust surface that only lists what it can prove is
 * marketing.
 *
 * Everything sensitive is read here with the service role and handed down as
 * props. verification_evidence has RLS with no permissive policy (migration
 * 111) and the financial columns of `startups` are revoked from client keys
 * (migration 109), so the reads below are named-column, owner-scoped, and
 * nothing that reaches the browser carries a risk score or a storage path.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verification -- CapitalReach",
  description: "Put named, dated evidence behind your company or your investor profile.",
};

const LABEL = { fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--cr-ink-4)" };
const DATA = { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" as const, fontWeight: 500, fontSize: "12px", letterSpacing: "0.02em" };
const BODY = { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", lineHeight: 1.65, color: "var(--cr-ink-3)" };

/** Statuses in which a case still belongs to the applicant, not to history. */
const OPEN_STATUSES = ["draft", "submitted", "in_review", "needs_more"];

export default async function VerifyPage() {
  const locale = getLocale();
  const t = await getTranslator(locale);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/verify");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, subscription_tier, suspended, account_status, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/auth/login?redirect=/verify");

  const { isLaunch } = await getLaunchStatus();
  const ctx = buildAccessContext(profile, isLaunch);
  // A suspended account cannot transact, and verifying is a transaction with
  // a reviewer's time. /suspended explains it; a silent failure would not.
  if (isSuspended(ctx)) redirect("/suspended");

  const admin = createAdminClient();

  // Named columns only. A select star on `startups` drags the revoked
  // financial columns through a page that has no business with them.
  const [{ data: startup }, { data: investor }] = await Promise.all([
    admin.from("startups")
      .select("id, name, website, subscription_tier, trust_level, trust_reviewed_at, trust_expires_at")
      .eq("owner_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    admin.from("investors")
      .select("id, display_name, firm_name, website, subscription_tier, trust_level, trust_reviewed_at, trust_expires_at")
      .eq("owner_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);

  // The role decides which side is being verified when someone holds both.
  const preferInvestor = profile.role === "investor";
  const subjectType: SubjectType | null =
    preferInvestor && investor ? "investor"
    : startup ? "startup"
    : investor ? "investor"
    : null;

  const shell = (children: React.ReactNode) => (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "60vh" }}>{children}</main>
      <Footer />
    </>
  );

  if (!subjectType) {
    return shell(
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "96px 24px 96px", textAlign: "center" }}>
        <div aria-hidden style={{ color: "var(--cr-copper)", fontSize: "14px", marginBottom: "16px" }}>✦</div>
        <p style={{ ...BODY, marginBottom: "24px" }}>{t("verify.noSubjectBody")}</p>
        <Link
          href={preferInvestor ? "/onboarding/investor" : "/onboarding/startup"}
          style={{ ...DATA, color: "var(--cr-copper)", textDecoration: "none" }}
        >
          {preferInvestor ? t("verify.noSubjectCtaInvestor") : t("verify.noSubjectCtaStartup")} →
        </Link>
      </div>,
    );
  }

  const subject = subjectType === "startup" ? startup! : investor!;
  const subjectName = subjectType === "startup"
    ? (startup!.name ?? "")
    : (investor!.display_name || investor!.firm_name || "");

  // The most recent case, whatever became of it: an open one is the working
  // application, a decided one still carries the reason it was decided.
  const { data: latestCase } = await admin
    .from("verification_cases")
    .select("id, status, level_requested, level_granted, decision_note, expires_at, created_at, updated_at")
    .eq("owner_id", user.id)
    .eq("subject_type", subjectType)
    .eq("subject_id", subject.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const openCase = latestCase && OPEN_STATUSES.includes(latestCase.status) ? latestCase : null;
  // A closed case still has to be answered for. Without this, an applicant who
  // was rejected on Tuesday lands on a page offering to start an application,
  // with no sign that they already made one or why it failed.
  const decided = latestCase && !openCase ? latestCase : null;

  let evidence: EvidenceView[] = [];
  if (openCase) {
    const { data: rows } = await admin
      .from("verification_evidence")
      .select("id, kind, method, status, detail, checked_at")
      .eq("case_id", openCase.id)
      .order("created_at", { ascending: true });
    // storage_path is deliberately not selected: a path is a durable handle to
    // a document, and the applicant's browser has no use for one.
    evidence = (rows ?? []).map((row) => {
      const detail = row.detail && typeof row.detail === "object" ? (row.detail as Record<string, unknown>) : {};
      return {
        id: row.id,
        kind: row.kind,
        method: row.method,
        status: row.status,
        checkedAt: row.checked_at,
        filename: typeof detail.filename === "string" ? detail.filename : null,
        domain: typeof detail.domain === "string" ? detail.domain : null,
      };
    });
  }

  const caseView: CaseView | null = openCase
    ? {
        id: openCase.id,
        status: openCase.status,
        levelRequested: openCase.level_requested,
        levelGranted: openCase.level_granted,
        decisionNote: openCase.decision_note,
        createdAt: openCase.created_at,
        updatedAt: openCase.updated_at,
      }
    : null;

  const rawLevel = (subject.trust_level ?? 0) as TrustLevel;
  const shownLevel = effectiveTrustLevel(rawLevel, subject.trust_expires_at);
  const lapsed = rawLevel > 0 && isExpired(subject.trust_expires_at);

  const month = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(locale, { month: "short", year: "numeric" });
  };

  const day = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  };

  // The domain the applicant is most likely to prove. A freemail address is
  // never it: prefilling "gmail.com" invites a check that cannot pass and
  // reads as the platform not knowing the difference.
  const emailHost = normaliseDomain(profile.email);
  const suggestedDomain =
    normaliseDomain(subject.website) ??
    (emailHost && !isFreemailDomain(emailHost) ? emailHost : null);

  // Priority is a plan capability, so read it from the capability object --
  // during the founding stage launch mode lifts it for everyone, exactly as it
  // lifts every other paywall.
  const stage = await getStageStatus();
  const fastLane = stage.isFounding || (
    subjectType === "startup" &&
    founderCan({ ...ctx, tier: startup!.subscription_tier }).priorityReview
  );

  return shell(
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "96px 24px 0" }}>

      {/* ── The offer, before the form ────────────────────────────────── */}
      <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("verify.label")}</div>
      <h1 style={{
        fontFamily: "var(--font-serif), 'Playfair Display', Georgia, serif", fontWeight: 700,
        fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.1, letterSpacing: "-0.02em",
        color: "var(--cr-ink)", marginBottom: "16px",
      }}>
        {t("verify.title")}
      </h1>
      <p style={{ ...BODY, fontSize: "15px", maxWidth: "62ch", marginBottom: "48px" }}>
        {subjectType === "startup" ? t("verify.lede") : t("verify.ledeInvestor")}
      </p>

      {/* ── Where this subject stands today ───────────────────────────── */}
      <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("verify.standing")}</div>
      <div style={{
        borderTop: "1px solid var(--cr-rule-dark)", borderBottom: "1px solid var(--cr-rule-dark)",
        padding: "16px 0", marginBottom: "48px",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ ...DATA, fontSize: "13px", color: shownLevel > 0 ? "var(--verdigris)" : "var(--cr-ink-4)" }}>
            {String(shownLevel).padStart(2, "0")}
          </span>
          <span style={{
            fontFamily: "var(--font-serif), 'Playfair Display', Georgia, serif", fontWeight: 700,
            fontSize: "20px", color: shownLevel > 0 ? "var(--verdigris)" : "var(--cr-ink-2)",
          }}>
            {t(TRUST_LADDER[shownLevel].key)}
          </span>
          <span style={{ ...LABEL, marginInlineStart: "auto" }}>{subjectName}</span>
        </div>
        <p style={{ ...BODY, fontSize: "13px", marginTop: "6px", maxWidth: "62ch" }}>
          {t(TRUST_LADDER[shownLevel].meansKey)}
        </p>
        {lapsed && month(subject.trust_expires_at) && (
          <p style={{ ...DATA, color: "var(--cr-copper)", marginTop: "8px" }}>
            {t("trust.expiredOn", { date: month(subject.trust_expires_at) ?? "" })}
          </p>
        )}
        {!lapsed && month(subject.trust_expires_at) && (
          <p style={{ ...DATA, color: "var(--cr-ink-4)", marginTop: "8px" }}>
            {t("trust.validTo", { date: month(subject.trust_expires_at) ?? "" })}
          </p>
        )}
      </div>

      {/* ── The application that already happened ─────────────────────── */}
      {decided && (
        <>
          <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("verify.lastDecision")}</div>
          <div style={{ borderTop: "1px solid var(--cr-rule)", paddingTop: "12px", marginBottom: "48px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>
                {t(`verify.status.${decided.status}`)}
              </span>
              {day(decided.updated_at) && (
                <span style={{ ...DATA, color: "var(--cr-ink-4)" }}>{day(decided.updated_at)}</span>
              )}
            </div>
            {decided.decision_note && (
              <p style={{ ...BODY, fontSize: "13px", marginTop: "6px", maxWidth: "62ch" }}>{decided.decision_note}</p>
            )}
            <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "6px", maxWidth: "62ch" }}>
              {t("verify.reapply")}
            </p>
          </div>
        </>
      )}

      <VerifyFlow
        subjectType={subjectType}
        currentLevel={shownLevel}
        initialCase={caseView}
        initialEvidence={evidence}
        initialDomainRecord={openCase
          ? { host: `_${DOMAIN_VERIFY_PREFIX.split("-")[0]}`, value: domainVerifyRecord(openCase.id) }
          : null}
        suggestedDomain={suggestedDomain}
      />

      {/* ── The honest half, on the same page as the ask ───────────────── */}
      <div style={{
        background: "var(--cr-band-bg)", color: "var(--cr-band-ink)",
        borderTop: "1px solid var(--cr-copper-br)", borderBottom: "1px solid var(--cr-copper-br)",
        margin: "64px -24px 0", padding: "48px 24px",
      }}>
        <div style={{ maxWidth: "820px", margin: "0 auto", display: "grid", gap: "32px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {[
            { label: t("verify.checkTitle"), body: t("verify.checkBody") },
            { label: t("verify.notTitle"), body: t("verify.notBody") },
            { label: t("verify.timeTitle"), body: fastLane ? t("verify.timeBodyPriority") : t("verify.timeBody") },
          ].map((col) => (
            <div key={col.label}>
              <div style={{ ...LABEL, color: "var(--cr-copper)", marginBottom: "8px" }}>{col.label}</div>
              <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-band-ink-dim)" }}>{col.body}</p>
            </div>
          ))}
        </div>
        {stage.isFounding && (
          <p style={{
            ...DATA, color: "var(--cr-band-ink-dim)", maxWidth: "820px",
            margin: "24px auto 0", paddingTop: "16px",
            borderTop: "1px solid color-mix(in srgb, var(--cr-band-ink) 18%, transparent)",
          }}>
            {t("verify.foundingNote")}
          </p>
        )}
      </div>
    </div>,
  );
}
