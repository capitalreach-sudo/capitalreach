"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useMessagingAvailable } from "@/hooks/useMessagingAvailable";

/**
 * The navbar messages icon with an unread count, matching the bell's badge.
 * Absent unless this member has messaging at all (a sealed deal, or an
 * admin), including while that is still being asked. Renders the plain icon
 * when the count endpoint fails -- a wrong zero is worse than no badge.
 */
export function MessagesIcon() {
  const available = useMessagingAvailable();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (available !== true) return;
    fetch("/api/messages/unread")
      .then((r) => (r.ok ? r.json() : { unread: 0 }))
      .then((d) => setUnread(d.unread ?? 0))
      .catch(() => {});
  }, [available]);

  if (available !== true) return null;

  return (
    <Link href="/dashboard/messages"
      style={{ color: "var(--cr-ink-4)", transition: "color 150ms ease", lineHeight: 1, position: "relative", display: "flex" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-2)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-4)")}
    >
      <MessageSquare className="h-4 w-4" />
      {unread > 0 && (
        <span style={{ position: "absolute", top: "-5px", right: "-6px", minWidth: "16px", height: "16px", padding: "0 4px", borderRadius: "999px", background: "var(--cr-copper)", color: "var(--cr-on-accent)", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
