"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

/**
 * The navbar messages icon with an unread count, matching the bell's badge.
 * Renders the plain icon when signed out or when the count endpoint fails --
 * a wrong zero is worse than no badge.
 */
export function MessagesIcon() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    fetch("/api/messages/unread")
      .then((r) => (r.ok ? r.json() : { unread: 0 }))
      .then((d) => setUnread(d.unread ?? 0))
      .catch(() => {});
  }, []);

  return (
    <Link href="/dashboard/messages"
      style={{ color: "var(--cr-ink-4)", transition: "color 150ms ease", lineHeight: 1, position: "relative", display: "flex" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-2)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-4)")}
    >
      <MessageSquare className="h-4 w-4" />
      {unread > 0 && (
        <span style={{ position: "absolute", top: "-5px", right: "-6px", minWidth: "15px", height: "15px", padding: "0 3px", borderRadius: "8px", background: "var(--cr-copper)", color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
