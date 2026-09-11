"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
 * And a fifth, which only became load-bearing when contact started requiring
 * an offer: an investor who has not certified their status is refused by the
 * POST, so before this state existed they filled in amount, equity, valuation,
 * instrument and conditions and THEN learned they were ineligible, with no
 * link to the page that fixes it. The requirement belongs in front of the
 * composer, not behind it.
 *
 * A sixth arrived with seal-before-contact (120): between "the founder said
 * yes" and "you may talk" there is now a record both sides sign, and an
 * investor sitting in that gap has contact CLOSED with a deal already on the
 * table. Read through contactOpen alone that is indistinguishable from a
 * stranger, so the listing invited a second offer at somebody whose first one
 * had been accepted, and the POST answered 409 after a page of terms. The
 * verdict's `reason` is what separates the two, which is why this reads it
 * rather than the boolean alone.
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
  /** The verdict's own word for WHY. contactOpen carries the yes or no, and
   *  every yes reads the same, but the refusals do not: one of them is a
   *  stranger and one of them is a deal waiting for a signature. A refusal
   *  this button cannot name falls through to the primary action, which is an
   *  offer the POST is going to refuse. */
  reason?: "policy_off" | "deal_exists" | "deal_sealed" | "offer_accepted"
    | "admin" | "needs_accepted_offer" | "needs_seal";
  proposal: {
    id: string;
    fromSide: "startup" | "investor";
    status: string;
    amount: number | null;
    currency: string | null;
  } | null;
  dealId: string | null;
  /** The route sends it; without it the seal state cannot tell a live deal
   *  from one that was closed or passed. */
  dealStatus?: string | null;
  threadId: string | null;
  /** POST refuses an offer without this, and an offer is the only way in. */
  accredited?: boolean;
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
  /** Bumped by the page once the terms it collects have been accepted. The
   *  modal belongs to the listing, so the composer cannot reopen itself, and
   *  an investor who has just signed something should not have to find this
   *  button a second time. */
  openSignal?: number;
  /** A paused or closed round is refused by the POST. Without this the listing
   *  showed its primary action and reported the refusal only after amount,
   *  equity, valuation and instrument had been filled in. */
  roundOpen?: boolean;
}

export function OfferButton({ startupId, companyName, ask, acked = true, onNeedsAck, onSent, openSignal, roundOpen = true }: Props) {
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

  // Seeded with the incoming value so a mount is never mistaken for a signal.
  const lastSignal = useRef(openSignal);
  useEffect(() => {
    if (lastSignal.current === openSignal) return;
    lastSignal.current = openSignal;
    setOpen(true);
  }, [openSignal]);

  useEscapeKey(open, () => setOpen(false));

  // Nothing is rendered until the answer is known. A button that said "Make an
  // offer" for one frame to somebody who already made one is worse than a
  // button that arrives a moment late.
  if (!state || state.role !== "investor") return null;

  const pending = state.proposal && state.proposal.status === "pending" ? state.proposal : null;
  // Only for a deal that is still going somewhere. contact-policy's lookup has
  // no status filter, so it returns needs_seal for a CLOSED or PASSED deal too
  // -- and sending that investor to a signing panel for a deal nobody intends
  // to complete is the same dead link this state exists to remove, just
  // pointing somewhere else.
  const LIVE_DEAL = !["closed", "passed"].includes(String(state.dealStatus ?? ""));
  const needsSeal = state.reason === "needs_seal" && LIVE_DEAL;

  // A paused or closed round has no offer to make. The listing puts a waitlist
  // in this same row, which is the honest action there. An offer already on
  // the table, a conversation already open, or a record still short of one
  // signature all outlive the round's state -- a founder pausing the round
  // does not undo an offer they accepted while it was open.
  if (!roundOpen && !pending && !state.contactOpen && !needsSeal) return null;

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
  } else if (needsSeal) {
    // Placed under the pending states on purpose: lib/contact-policy counts a
    // deal in ANY status, including one already closed or passed, and the POST
    // does not -- so a pair with a dead deal and a live offer between them is
    // in both states at once, and the live offer is the one with a next move.
    //
    // ?deal= is not decoration: that card unfolds its signing panel when it is
    // reached this way, so the link lands on the signature itself.
    const href = state.dealId ? `/deals?deal=${state.dealId}` : "/deals";
    control = (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: "6px", maxWidth: "320px" }}>
        <Link href={href} style={{ ...QUIET, borderColor: "var(--cr-copper-br)", color: "var(--cr-copper)" }}>
          {t("offerButton.seal")} →
        </Link>
        {caption(t("offerButton.sealNote"))}
      </span>
    );
  } else if (state.accredited === false) {
    // Copper outline, the same register the countered state uses: the ball is
    // on this side of the table. Plain grey here read as a disabled control
    // standing where the offer button was supposed to be, which is the one
    // reading of this state that must not be available.
    control = (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: "6px", maxWidth: "320px" }}>
        <Link href="/dashboard/investor/settings#accreditation"
          style={{ ...QUIET, borderColor: "var(--cr-copper-br)", color: "var(--cr-copper)" }}>
          {t("offerButton.certify")} →
        </Link>
        {caption(t("offerButton.certifyNote"))}
      </span>
    );
  } else {
    control = (
      // Capped: the caption is a sentence, and an uncapped column stretches
      // the row it shares with every other action on the listing.
      <span style={{ display: "inline-flex", flexDirection: "column", gap: "6px", maxWidth: "320px" }}>
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
