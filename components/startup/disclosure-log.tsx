"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocale } from "@/components/providers/locale-provider";
import { TRUST_LADDER, effectiveTrustLevel, type TrustLevel } from "@/lib/trust";

/**
 * The founder's confidentiality record.
 *
 * One ledger per counterparty: who they were when they signed, the exact
 * wording they agreed to, when the obligation runs out, and every item they
 * opened afterwards as a dated row.
 *
 * Presented flat and quiet on purpose. Access is not misuse, and a page that
 * paints a data-room visit in alarm colours would be pushing a founder towards
 * a conclusion the record does not support. Verdigris marks a settled state
 * (an obligation in force); nothing here is green or red, because nothing here
 * is money moving.
 */

// ── House register ──────────────────────────────────────────────────────────

const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

const DATA: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
  fontWeight: 500, fontSize: "11px", letterSpacing: "0.02em", color: "var(--cr-ink-2)",
};

const BODY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
  lineHeight: 1.65, color: "var(--cr-ink-3)",
};

const CARD: CSSProperties = {
  background: "var(--cr-paper)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
};

const RULE: CSSProperties = { borderTop: "1px solid var(--cr-rule)" };

const BADGE: CSSProperties = {
  ...LABEL, fontSize: "9px", borderRadius: "3px", padding: "3px 6px",
  border: "1px solid var(--cr-rule-dark)", whiteSpace: "nowrap", flexShrink: 0,
};

// ── The shape the route returns ─────────────────────────────────────────────

interface Snapshot {
  name: string | null; firm: string | null; type: string | null;
  country: string | null; slug: string | null; trustLevel: number | null;
}

interface Introduction {
  firstContactAt: string; channel: string; tailEndsAt: string;
  tailLive: boolean; termsVersion: string | null;
}

interface Disclosure {
  id: string; itemType: string; itemLabel: string | null;
  occurredAt: string; ip: string; underThisNda: boolean;
}

interface Counterparty {
  ndaId: string;
  investor: { slug: string; name: string | null; type: string } | null;
  snapshot: Snapshot | null;
  trustLevelNow: number | null;
  trustExpiresAt: string | null;
  signedAt: string | null;
  method: string;
  version: string | null;
  textSha256: string | null;
  obligationsEndAt: string | null;
  obligationsEndDerived: boolean;
  obligationLive: boolean | null;
  introduction: Introduction | null;
  disclosures: Disclosure[];
}

interface Payload {
  startup: { id: string; name: string };
  counterparties: Counterparty[];
  truncated: boolean;
}

// The vocabularies the migration's CHECK constraints allow. Kept as explicit
// sets so an unrecognised value renders as itself rather than as a raw key.
const ITEM_TYPES = new Set([
  "data_room_open", "document", "financials", "metrics", "deck", "update", "message_thread",
]);
const CHANNELS = new Set([
  "message", "deal", "nda", "interest", "data_room", "introduction_request",
]);
const METHODS = new Set(["clickwrap", "docusign"]);

function humanise(slug: string): string {
  return slug.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// ── Rows ────────────────────────────────────────────────────────────────────

/** Label left, value right, split by a hairline. The card's only structure. */
function Fact({ label, children, note }: { label: string; children: React.ReactNode; note?: string | null }) {
  return (
    <div style={{ ...RULE, padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px" }}>
        <span style={{ ...LABEL, flexShrink: 0 }}>{label}</span>
        <span style={{ textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{children}</span>
      </div>
      {note && (
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "4px" }}>{note}</p>
      )}
    </div>
  );
}

export function DisclosureLog({ startupId }: { startupId?: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const url = startupId
      ? `/api/startups/disclosures?startupId=${encodeURIComponent(startupId)}`
      : "/api/startups/disclosures";
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Payload) => setData(j))
      .catch(() => setFailed(true));
  }, [startupId]);

  const day = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  };

  /** Signatures and disclosures are timestamps, not dates: the hour is half of
   *  what makes an entry evidence, and the zone stops it being ambiguous. */
  const stamp = (iso: string | null | undefined, withZone = false): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(locale, {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      ...(withZone ? { timeZoneName: "short" as const } : {}),
    });
  };

  const itemLabel = (type: string): string =>
    ITEM_TYPES.has(type) ? t(`discLog.item.${type}`) : humanise(type);

  return (
    <div>
      {/* What the record is, before any of it -- a founder reading this page is
          usually reading it for the first time on a bad day. The opener and
          these two lines render before the fetch resolves: the section is real
          either way, and only the body underneath is unknown. */}
      <p style={{ ...BODY, marginBottom: "8px" }}>{t("discLog.lead")}</p>
      <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "32px" }}>
        {t("discLog.limits")}
      </p>

      <div className="ruled-label" style={{ marginBottom: "12px" }}>
        {t("discLog.counterparties")}
        {data && (
          <span style={{ ...DATA, fontWeight: 600, color: "var(--cr-copper)" }}>
            {String(data.counterparties.length).padStart(2, "0")}
          </span>
        )}
      </div>

      {/* No skeleton soup: an absent record is one quiet line, not grey bars. */}
      {failed ? (
        <p style={{ ...BODY, color: "var(--cr-ink-4)" }}>{t("discLog.error")}</p>
      ) : !data ? (
        <p style={{ ...DATA, color: "var(--cr-ink-4)" }}>{t("discLog.loading")}</p>
      ) : data.counterparties.length === 0 ? (
        <div style={{ ...CARD, padding: "48px 24px", textAlign: "center" }}>
          <span aria-hidden style={{ display: "block", color: "var(--cr-copper)", fontSize: "14px", lineHeight: 1, marginBottom: "12px" }}>✦</span>
          <p style={{ ...BODY, marginBottom: "12px" }}>{t("discLog.empty")}</p>
          <Link
            href="/dashboard/startup/documents"
            style={{ ...BODY, fontSize: "13px", fontWeight: 500, color: "var(--cr-copper)", textDecoration: "none" }}
          >
            {t("discLog.emptyAction")} →
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {data.counterparties.map((c, idx) => {
            const name = c.snapshot?.name ?? c.investor?.name ?? t("discLog.unnamed");
            const firm = c.snapshot?.firm ?? null;
            // The level THEN is the one that matters: a name is worth what was
            // verified about it on the day it was written down.
            const thenLevel = c.snapshot?.trustLevel;
            const nowLevel = effectiveTrustLevel(c.trustLevelNow, c.trustExpiresAt);
            const opened = c.disclosures.filter((d) => d.underThisNda);
            const before = c.disclosures.filter((d) => !d.underThisNda);

            return (
              <section key={c.ndaId} style={{ ...CARD, padding: "16px" }}>

                {/* Who, and whether the obligation still binds them. */}
                <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "12px", minWidth: 0 }}>
                    <span aria-hidden style={{ ...DATA, fontWeight: 600, color: "var(--cr-copper)", flexShrink: 0 }}>
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", margin: 0, overflowWrap: "anywhere" }}>
                        {c.investor?.slug ? (
                          <Link href={`/investors/${c.investor.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{name}</Link>
                        ) : name}
                      </p>
                      {(firm || c.snapshot?.country) && (
                        <p style={{ ...BODY, fontSize: "12px", marginTop: "2px" }}>
                          {[firm, c.snapshot?.country].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  {c.obligationLive !== null && (
                    <span style={{
                      ...BADGE,
                      color: c.obligationLive ? "var(--verdigris)" : "var(--cr-ink-4)",
                      borderColor: c.obligationLive
                        ? "color-mix(in srgb, var(--verdigris) 35%, transparent)"
                        : "var(--cr-rule-dark)",
                    }}>
                      {c.obligationLive ? t("discLog.obligationLive") : t("discLog.obligationEnded")}
                    </span>
                  )}
                </header>

                {/* The agreement itself. */}
                <div style={{ marginTop: "16px" }}>
                  <div style={{ ...LABEL, marginBottom: "4px" }}>{t("discLog.agreement")}</div>

                  <Fact label={t("discLog.agreedAt")}>
                    <span style={DATA}>{stamp(c.signedAt, true)}</span>
                  </Fact>

                  <Fact label={t("discLog.methodLabel")}>
                    <span style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-2)" }}>
                      {METHODS.has(c.method) ? t(`discLog.method.${c.method}`) : humanise(c.method)}
                    </span>
                  </Fact>

                  <Fact label={t("discLog.version")}>
                    <span style={DATA}>{c.version ?? "—"}</span>
                  </Fact>

                  {/* A version string is a label; the hash is the thing that
                      cannot be edited after the fact. */}
                  <Fact label={t("discLog.hash")} note={c.textSha256 ? t("discLog.hashNote") : t("discLog.hashMissing")}>
                    {c.textSha256 ? (
                      <span style={{ ...DATA, color: "var(--cr-ink)" }} title={c.textSha256}>
                        {`${c.textSha256.slice(0, 16)}…${c.textSha256.slice(-8)}`}
                      </span>
                    ) : <span style={{ ...DATA, color: "var(--cr-ink-4)" }}>—</span>}
                  </Fact>

                  <Fact
                    label={t("discLog.trustThen")}
                    note={c.snapshot ? null : t("discLog.snapshotMissing")}
                  >
                    <span style={{
                      ...BODY, fontSize: "12px",
                      color: thenLevel != null && thenLevel > 0 ? "var(--verdigris)" : "var(--cr-ink-4)",
                    }}>
                      {thenLevel != null
                        ? t(TRUST_LADDER[Math.min(4, Math.max(0, thenLevel)) as TrustLevel].key)
                        : t("discLog.notRecorded")}
                    </span>
                  </Fact>

                  {/* Only worth a row when it says something the row above did
                      not: a level that moved after the signature. */}
                  {thenLevel != null && thenLevel !== nowLevel && (
                    <Fact label={t("discLog.trustNow")}>
                      <span style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-3)" }}>
                        {t(TRUST_LADDER[nowLevel].key)}
                      </span>
                    </Fact>
                  )}

                  <Fact
                    label={t("discLog.obligationEnds")}
                    note={c.obligationsEndDerived ? t("discLog.obligationDerived") : null}
                  >
                    <span style={{ ...DATA, color: c.obligationsEndAt ? "var(--cr-ink-2)" : "var(--cr-ink-4)" }}>
                      {c.obligationsEndAt ? day(c.obligationsEndAt) : t("discLog.notRecorded")}
                    </span>
                  </Fact>
                </div>

                {/* When these two parties first met, and how. The basis of any
                    non-circumvention question, kept separate from the NDA
                    because they are different promises. */}
                <div style={{ marginTop: "20px" }}>
                  <div style={{ ...LABEL, marginBottom: "4px" }}>{t("discLog.introTitle")}</div>
                  {c.introduction ? (
                    <>
                      <Fact label={t("discLog.firstContact")}>
                        <span style={DATA}>{stamp(c.introduction.firstContactAt)}</span>
                      </Fact>
                      <Fact label={t("discLog.channelLabel")}>
                        <span style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-2)" }}>
                          {CHANNELS.has(c.introduction.channel)
                            ? t(`discLog.channel.${c.introduction.channel}`)
                            : humanise(c.introduction.channel)}
                        </span>
                      </Fact>
                      <Fact label={t("discLog.tailEnds")}>
                        <span style={{ ...DATA, color: c.introduction.tailLive ? "var(--verdigris)" : "var(--cr-ink-4)" }}>
                          {day(c.introduction.tailEndsAt)}
                        </span>
                      </Fact>
                    </>
                  ) : (
                    <p style={{ ...BODY, fontSize: "12px", ...RULE, paddingTop: "8px" }}>{t("discLog.noIntro")}</p>
                  )}
                </div>

                {/* What they actually received. */}
                <div style={{ marginTop: "20px" }}>
                  <div style={{ ...LABEL, marginBottom: "4px", display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <span>{t("discLog.disclosures")}</span>
                    <span style={{ ...DATA, fontSize: "10px", color: "var(--cr-copper)" }}>
                      {String(opened.length).padStart(2, "0")}
                    </span>
                  </div>
                  {opened.length === 0 ? (
                    <p style={{ ...BODY, fontSize: "12px", ...RULE, paddingTop: "8px" }}>{t("discLog.noDisclosures")}</p>
                  ) : (
                    <div>
                      {opened.map((d) => (
                        <div key={d.id} style={{
                          ...RULE, display: "flex", alignItems: "baseline",
                          justifyContent: "space-between", gap: "12px", padding: "8px 0",
                        }}>
                          <span style={{ minWidth: 0 }}>
                            <span style={{
                              display: "block", fontFamily: "'DM Sans', sans-serif",
                              fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-2)",
                              overflowWrap: "anywhere",
                            }}>
                              {d.itemLabel || itemLabel(d.itemType)}
                            </span>
                            <span style={{ ...LABEL, display: "block", fontSize: "9px", marginTop: "2px" }}>
                              {itemLabel(d.itemType)}
                              {d.ip !== "—" && <>{" · "}{t("discLog.ip")} {d.ip}</>}
                            </span>
                          </span>
                          <span style={{ ...DATA, color: "var(--cr-ink-4)", whiteSpace: "nowrap", flexShrink: 0 }}>
                            {stamp(d.occurredAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Access before the signature is a different fact, and is
                      labelled as one rather than folded into the total. */}
                  {before.length > 0 && (
                    <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", ...RULE, paddingTop: "8px", marginTop: "0" }}>
                      {t("discLog.beforeSigning", { count: before.length })}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {data?.truncated && (
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "16px" }}>
          {t("discLog.truncated")}
        </p>
      )}

      {/* The footnotes a lawyer asks about first. */}
      <div style={{ ...RULE, marginTop: "32px", paddingTop: "16px" }}>
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)" }}>{t("discLog.retentionNote")}</p>
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "8px" }}>{t("discLog.notAdvice")}</p>
      </div>
    </div>
  );
}
