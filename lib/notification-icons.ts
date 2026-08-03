import {
  Bell, Handshake, ArrowRightLeft, CheckCircle2, XCircle, MessageSquare,
  CalendarClock, FileSignature, ShieldCheck, BadgeCheck, Ban, Users, Crown,
  SearchCheck, type LucideIcon,
} from "lucide-react";

/**
 * One icon per notification kind, shared by the bell dropdown and the
 * notifications page so the two can never drift. Colour is carried by the
 * icon alone: row backgrounds already encode unread/read.
 */
export const TYPE_ICON: Record<string, { Icon: LucideIcon; color: string }> = {
  deal_opened:      { Icon: Handshake,      color: "var(--cr-copper)" },
  deal_stage:       { Icon: ArrowRightLeft, color: "var(--cr-ink-3)"  },
  deal_closed:      { Icon: CheckCircle2,   color: "var(--cr-up)"     },
  deal_passed:      { Icon: XCircle,        color: "var(--cr-ink-4)"  },
  message:          { Icon: MessageSquare,  color: "var(--cr-copper)" },
  follow_up_due:    { Icon: CalendarClock,  color: "var(--cr-copper)" },
  contract_status:  { Icon: FileSignature,  color: "var(--cr-ink-3)"  },
  nda_signed:       { Icon: ShieldCheck,    color: "var(--cr-up)"     },
  listing_approved: { Icon: BadgeCheck,     color: "var(--cr-up)"     },
  listing_rejected: { Icon: Ban,            color: "var(--cr-down)"   },
  team_added:       { Icon: Users,          color: "var(--cr-copper)" },
  tier_changed:     { Icon: Crown,          color: "var(--cr-copper)" },
  search_match:     { Icon: SearchCheck,    color: "var(--cr-copper)" },
};

// Unknown types still render plainly rather than disappearing -- a
// notification raised by a newer deploy than the running bundle.
export const FALLBACK_ICON = { Icon: Bell, color: "var(--cr-ink-4)" };
