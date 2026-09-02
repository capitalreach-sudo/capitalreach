"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocale } from "@/components/providers/locale-provider";

/**
 * Machine translation of a listing or an investor profile.
 *
 * The interface has spoken fifteen languages for a while; the pitch inside it
 * has always spoken whichever one the founder typed. A Japanese investor got a
 * perfectly localised page wrapped around text they could not read — which is
 * the half of the localisation that decides whether they engage at all.
 *
 * Behaviour, and why:
 *
 *  - AUTOMATIC when the listing is not in the viewer's language. If the server
 *    already had the translation cached it arrives with the page (initialFields)
 *    and there is no flash; otherwise the panel fetches it once on mount. Either
 *    way the reader does not have to know the feature exists to benefit from it.
 *  - ALWAYS LABELLED while a translation is showing, with "show original" beside
 *    it. A reader making an investment decision must never be unsure whether the
 *    words are the founder's or a model's. Auto-translation without that label
 *    would be misrepresentation; the label is what makes auto safe.
 *  - SILENT when it cannot help. Same language, or translation not configured on
 *    the server (available=false): no banner, no fetch, just the original.
 */

type Ctx = {
  fields: Record<string, string> | null;
  active: boolean;
  get: (key: string, original: string | null | undefined) => string | null | undefined;
};

const TranslationCtx = createContext<Ctx>({ fields: null, active: false, get: (_k, o) => o });

// Module-level so it dedups across component instances and StrictMode's
// dev-only double-mount, not just within one instance: the auto-translate
// effect can fire from several instances/remounts of the same entity before any
// cache write lands, and the request's own rate-limiter fails open when Redis
// is unconfigured. One in-flight translate per (entity, locale) per tab.
const pendingTranslations = new Set<string>();

export function useTranslatedField(key: string, original: string | null | undefined) {
  return useContext(TranslationCtx).get(key, original);
}

export function TranslatedContent({
  entityType, entityId, sourceLocale, initialFields = null, available = true, children,
}: {
  entityType: "startup" | "investor";
  entityId: string;
  /** The language the content is believed to be in, when it is known. */
  sourceLocale?: string | null;
  /** A translation the server already had cached for the viewer's locale. */
  initialFields?: Record<string, string> | null;
  /** Whether translation is configured on the server. False → stay silent. */
  available?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const locale = useLocale();

  // Nothing to offer when the reader is already in the content's language, and
  // English is the assumption when the content's language is unrecorded.
  const sameLanguage = (sourceLocale ?? "en") === locale;

  // initialFields was computed by the server for the locale it rendered — the
  // locale the client also starts at. It is only valid while that holds; after
  // an in-page locale change (static pages) it is stale and dropped.
  const seededLocaleRef = useRef(locale);
  const seedValid = !sameLanguage && available && !!initialFields;

  const [fields, setFields] = useState<Record<string, string> | null>(seedValid ? initialFields : null);
  const [active, setActive] = useState<boolean>(seedValid);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const fetchTranslation = useRef<() => Promise<void>>(async () => {});
  fetchTranslation.current = async () => {
    // Synchronous, module-level de-dupe: a state flag would be read too late to
    // stop a second concurrent call (see pendingTranslations above).
    const key = `${entityType}:${entityId}:${locale}`;
    if (pendingTranslations.has(key)) return;
    pendingTranslations.add(key);
    setBusy(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, locale }),
      });
      if (res.status === 503) { setUnavailable(true); return; }
      if (!res.ok) return;
      const j = await res.json();
      setFields(j.fields ?? {});
      setActive(true);
    } catch {
      // Silent: the original is on screen and readable either way.
    } finally {
      setBusy(false);
      pendingTranslations.delete(key);
    }
  };

  // Auto-translate. Runs on mount, and again whenever the locale changes (a
  // German translation must not stay up when the reader switches to Korean).
  // The seed covers the very first paint when the server had it cached, so this
  // only reaches the network on a cold cache or after a locale change.
  useEffect(() => {
    // Locale changed away from the server-seeded one: the seed is now stale.
    if (locale !== seededLocaleRef.current) {
      setFields(null);
      setActive(false);
    }
    if (sameLanguage || !available || unavailable) return;
    // Already have a valid translation for this locale (seed, or a prior fetch
    // that this same effect run has not cleared): show it, don't refetch.
    if (fields && locale === seededLocaleRef.current) { setActive(true); return; }
    void fetchTranslation.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, sameLanguage, available, unavailable]);

  const ctx = useMemo<Ctx>(() => ({
    fields, active,
    get: (key, original) => (active && fields?.[key] ? fields[key] : original),
  }), [fields, active]);

  const showBanner = !sameLanguage && available && !unavailable;

  return (
    <TranslationCtx.Provider value={ctx}>
      {showBanner && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
          background: active ? "var(--cr-copper-bg)" : "transparent",
          border: active ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
          borderRadius: "4px", padding: "7px 11px", marginBottom: "14px",
        }}>
          {busy
            ? <Loader2 style={{ width: 13, height: 13, color: "var(--cr-ink-4)" }} className="animate-spin" />
            : <Languages style={{ width: 13, height: 13, color: active ? "var(--cr-copper)" : "var(--cr-ink-4)" }} />}
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)" }}>
            {busy && !active ? t("translate.translating") : active ? t("translate.machineNotice") : t("translate.offer")}
          </span>
          <button
            onClick={() => {
              if (active) { setActive(false); return; }
              if (fields) { setActive(true); return; }
              void fetchTranslation.current();
            }}
            disabled={busy}
            style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer", padding: 0,
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)" }}>
            {active ? t("translate.showOriginal") : t("translate.showTranslation")}
          </button>
        </div>
      )}
      {children}
    </TranslationCtx.Provider>
  );
}

/** Renders one field, translated when a translation is showing. */
export function T({ field, children }: { field: string; children: string | null | undefined }) {
  const value = useTranslatedField(field, children);
  return <>{value}</>;
}
