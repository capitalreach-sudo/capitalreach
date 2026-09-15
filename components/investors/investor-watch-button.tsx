"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";

/**
 * Save-to-watchlist for a fellow investor -- the investor-side mirror of
 * TargetButton (a founder saving an investor to their target list) and the
 * startup card's Bookmark action (an investor saving a startup). Backed by
 * /api/watchlist's targetInvestorId path (migration 139).
 *
 * Bookmark only. This never opens a thread and the watched investor is never
 * told -- watching a fellow investor is a private shortlist, not a contact
 * channel, same as the founder's target list is not one either.
 */
export function InvestorWatchButton({
  investorId,
  initiallySaved,
  variant = "icon",
  onToggle,
}: {
  investorId: string;
  initiallySaved: boolean;
  /** "pill" for the profile header's action row; "icon" for a directory card. */
  variant?: "pill" | "icon";
  /** Fires after a successful save/unsave, so a caller listing already-saved
   *  investors (the dashboard section) can drop the card the moment it's
   *  unwatched instead of leaving a stale-looking entry on screen. */
  onToggle?: (saved: boolean) => void;
}) {
  const { t } = useTranslation();
  // Renders before the dictionary carries these keys -- same guard the
  // profile page and admin client already use, so a missing key falls back
  // to plain English instead of a raw dot-path.
  const tf = (key: string, fallback: string) => {
    const out = t(key);
    return out === key ? fallback : out;
  };
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);

  async function toggle(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (busy) return;
    setBusy(true);
    const wasSaved = saved;
    let res: Response;
    try {
      res = await fetch("/api/watchlist", {
        method: wasSaved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetInvestorId: investorId }),
      });
    } catch {
      setBusy(false);
      notify.error(tf("errors.generic", "Something went wrong. Try again."));
      return;
    }
    setBusy(false);
    if (!res.ok) {
      if (res.status === 401) {
        notify.info(tf("watchlist.investorSaveNeedsAccount", "Sign in to save investors."));
        return;
      }
      const j = await res.json().catch(() => ({}));
      notify.error(j?.error || tf("errors.generic", "Something went wrong. Try again."));
      return;
    }
    setSaved(!wasSaved);
    onToggle?.(!wasSaved);
    notify[wasSaved ? "info" : "success"](
      wasSaved
        ? tf("watchlist.investorUnsaved", "Removed from your watchlist")
        : tf("watchlist.investorSaved", "Saved to your watchlist"),
    );
  }

  const label = saved
    ? tf("watchlist.investorRemove", "Remove from watchlist")
    : tf("watchlist.investorAdd", "Save to watchlist");

  if (variant === "pill") {
    return (
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        title={label}
        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] border transition-colors cursor-pointer ${
          saved
            ? "bg-cr-copper/10 border-cr-copper/40 text-cr-copper"
            : "bg-transparent border-cr-rule-dark text-cr-i3 hover:border-cr-copper/40 hover:text-cr-copper"
        }`}
        style={{ minHeight: "40px", padding: "0 12px" }}
      >
        <Bookmark className="h-3 w-3" style={{ fill: saved ? "currentColor" : "transparent" }} />
        {saved ? tf("watchlist.investorWatching", "Watching") : tf("watchlist.investorWatch", "Watch")}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      // Same icon-rail convention as the directory card's compare/target
      // buttons: the button carries the color (via currentColor), the icon
      // stays a bare h-4 w-4.
      className={`transition-colors ${saved ? "text-cr-copper" : "text-cr-p4 hover:text-cr-copper"}`}
      style={{ background: "none", border: "none", cursor: "pointer", padding: "12px", display: "flex" }}
    >
      <Bookmark className="h-4 w-4" style={{ fill: saved ? "currentColor" : "transparent" }} />
    </button>
  );
}
