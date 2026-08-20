"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
 * Two decisions worth defending:
 *
 *  - It is OFFERED, not imposed. The page paints the founder's own words and a
 *    one-click "read this in <language>". Silently swapping somebody's pitch
 *    for a model's rendering of it, in a document people make investment
 *    decisions from, is not a courtesy.
 *  - It is always labelled while active, with "show original" beside it. A
 *    reader must never be unsure whether they are looking at what the founder
 *    wrote.
 */

type Ctx = {
  fields: Record<string, string> | null;
  active: boolean;
  get: (key: string, original: string | null | undefined) => string | null | undefined;
};

const TranslationCtx = createContext<Ctx>({ fields: null, active: false, get: (_k, o) => o });

export function useTranslatedField(key: string, original: string | null | undefined) {
  return useContext(TranslationCtx).get(key, original);
}

export function TranslatedContent({
  entityType, entityId, sourceLocale, children,
}: {
  entityType: "startup" | "investor";
  entityId: string;
  /** The language the content is believed to be in, when it is known. */
  sourceLocale?: string | null;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [fields, setFields] = useState<Record<string, string> | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Nothing to offer when the reader is already in the content's language, and
  // English is the assumption when the content's language is unrecorded.
  const sameLanguage = (sourceLocale ?? "en") === locale;

  const run = useCallback(async () => {
    if (fields) { setActive(true); return; }
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
    }
  }, [entityType, entityId, locale, fields]);

  // A locale change invalidates what is on screen — a German translation
  // must not stay up when the reader switches to Korean.
  useEffect(() => { setFields(null); setActive(false); }, [locale]);

  const ctx = useMemo<Ctx>(() => ({
    fields, active,
    get: (key, original) => (active && fields?.[key] ? fields[key] : original),
  }), [fields, active]);

  return (
    <TranslationCtx.Provider value={ctx}>
      {!sameLanguage && !unavailable && (
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
            {active ? t("translate.machineNotice") : t("translate.offer")}
          </span>
          <button
            onClick={() => (active ? setActive(false) : run())}
            disabled={busy}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)" }}>
            {active ? t("translate.showOriginal") : t("translate.translateCta")}
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
