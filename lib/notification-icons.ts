import {
  Bell, Handshake, ArrowRightLeft, CheckCircle2, XCircle, MessageSquare,
  CalendarClock, FileSignature, ShieldCheck, BadgeCheck, Ban, Users, Crown,
  SearchCheck, Bookmark, Megaphone, FileQuestion, Share2, HelpCircle, MessageCircleReply, Receipt, Flag, Sparkles, type LucideIcon,
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
  listing_saved:    { Icon: Bookmark,       color: "var(--cr-copper)" },
  listing_update:   { Icon: Megaphone,      color: "var(--cr-copper)" },
  doc_request:      { Icon: FileQuestion,   color: "var(--cr-copper)" },
  deal_shared:      { Icon: Share2,         color: "var(--cr-copper)" },
  question_asked:   { Icon: HelpCircle,     color: "var(--cr-copper)" },
  question_answered:{ Icon: MessageCircleReply, color: "var(--cr-up)" },
  verified:         { Icon: BadgeCheck,     color: "var(--cr-up)"     },
  complaint_update: { Icon: Flag,         color: "var(--cr-copper)" },
  interest:         { Icon: Sparkles,     color: "var(--cr-copper)" },
  fee_due:          { Icon: Receipt,        color: "var(--cr-down)"   },
};

// Unknown types still render plainly rather than disappearing -- a
// notification raised by a newer deploy than the running bundle.
export const FALLBACK_ICON = { Icon: Bell, color: "var(--cr-ink-4)" };
