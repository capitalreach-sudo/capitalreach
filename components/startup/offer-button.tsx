"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { OfferComposer, type OfferAsk } from "@/components/deals/offer-composer";

/**
 * The listing's entry point, where "message this startup" used to be.
 *
 * An investor can no longer open a conversation with a founder by writing one.
 * They open it with an offer, and the founder's yes is what unlocks the thread
 * -- so this button is the whole of the investor's side of that rule, and it
 * has to be honest about which of the three states they are in:
 *
 *   nothing yet     "Make an offer"   -- the primary action on the listing
 *   offer waiting   "Offer sent"      -- quiet, and it links to the offer
 *   contact open    "Open conversation"
 *
 * A fourth state falls out of the same read: when the founder has countered,
 * the ball is on the investor's side of the table and the button says so
 * rather than inviting a second offer that the one-open-proposal rule would
 * refuse anyway.
 *
 * The state comes from the API rather than from props, because the verdict is
 * lib/contact-policy's to give: a button that decided for itself would be one
 * deploy away from disagreeing with the route that refuses the message.
 */

const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

const PRIMARY: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: "var(--cr-copper)", border: "1px solid var(--cr-copper-d)",
  borderRadius: "999px", padding: "0 24px", minHeight: "40px", cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
  color: "var(--cr-band-ink)", textDecoration: "none",
};

const QUIET: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: "transparent", border: "1px solid var(--cr-paper-4)",
  borderRadius: "999px", padding: "0 20px", minHeight: "40px", cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
  color: "var(--cr-ink)", textDecoration: "none",
};

interface ListingState {
  scope: "listing";
  role: "investor" | "none";
  contactOpen: boolean;
  proposal: {
    id: string;
    fromSide: "startup" | "investor";
    status: string;
    amount: number | null;
    currency: string | null;
  } | null;
  dealId: string | null;
  threadId: string | null;
}

interface Props {
  startupId: string;
  companyName: string;
  /** The round as advertised, so the composer opens prefilled. */
  ask?: OfferAsk | null;
  /** The listing page knows whether this investor accepted the
   *  non-circumvention terms, and owns the modal that collects them. */
  acked?: boolean;
  onNeedsAck?: () => void;
  /** Told after an offer lands, so the page can refresh what it shows. */
  onSent?: () => void;
}

export function OfferButton({ startupId, companyName, ask, acked = true, onNeedsAck, onSent }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<ListingState | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/proposals?startupId=${startupId}`);
      if (!res.ok) return;
      setState((await res.json()) as ListingState);
    } catch { /* the listing still works without its button */ }
  }, [startupId]);
  useEffect(() => { void load(); }, [load]);

  useEscapeKey(open, () => setOpen(false));

  // Nothing is rendered until the answer is known. A button that said "Make an
  // offer" for one frame to somebody who already made one is worse than a
  // button that arrives a moment late.
  if (!state || state.role !== "investor") return null;

  const pending = state.proposal && state.proposal.status === "pending" ? state.proposal : null;

  function startOffer() {
    // The terms are the listing page's modal to collect; asking for them here
    // would be a second copy of a legal flow.
    if (!acked && onNeedsAck) { onNeedsAck(); return; }
    setOpen(true);
  }

  const caption = (text: string) => (
    <span style={{ ...LABEL, textTransform: "none", letterSpacing: "0.02em", fontSize: "11px" }}>{text}</span>
  );

  let control;
  if (state.contactOpen) {
    // An accepted offer, or a deal that already existed: the conversation is
    // the thing they want, and the pipeline is where it lives if no thread has
    // been opened yet.
    const href = state.threadId
      ? `/dashboard/messages?thread=${state.threadId}`
      : state.dealId ? `/deals?deal=${state.dealId}` : "/deals";
    control = (
      <Link href={href} style={QUIET}>
        {state.threadId ? t("offerButton.conversation") : t("offerButton.pipeline")}
      </Link>
    );
  } else if (pending && pending.fromSide === "startup") {
    control = (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: "6px" }}>
        <Link href="/deals" style={{ ...QUIET, borderColor: "var(--cr-copper-br)", color: "var(--cr-copper)" }}>
          {t("offerButton.countered")}
        </Link>
        {caption(t("offerButton.counteredNote"))}
      </span>
    );
  } else if (pending) {
    control = (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: "6px" }}>
        <Link href="/deals" style={QUIET}>{t("offerButton.sent")}</Link>
        {caption(t("offerButton.waiting"))}
      </span>
    );
  } else {
    control = (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: "6px" }}>
        <button type="button" onClick={startOffer} style={PRIMARY} className="btn-copper-shimmer">
          {t("offerButton.make")}
        </button>
        {caption(t("offerButton.caption"))}
      </span>
    );
  }

  return (
    <>
      {control}
      {open && (
        <div
          role="dialog" aria-modal="true" aria-label={t("offerComposer.eyebrow")}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 90,
            background: "color-mix(in srgb, var(--cr-ink) 55%, transparent)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "clamp(16px, 5vh, 64px) 16px", overflowY: "auto",
          }}
        >
          <div style={{ width: "min(640px, 100%)" }}>
            <OfferComposer
              startupId={startupId}
              companyName={companyName}
              ask={ask}
              onCancel={() => setOpen(false)}
              // Only stand down if the page has a modal to hand this to.
              // Closing the composer to show nothing would lose what they
              // typed and leave them with no way forward.
              onAckRequired={() => { if (onNeedsAck) { setOpen(false); onNeedsAck(); } }}
              onSent={() => { setOpen(false); void load(); onSent?.(); }}
            />
          </div>
        </div>
      )}
    </>
  );
}
