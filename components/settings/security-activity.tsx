"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { MonitorSmartphone, History, Loader2 } from "lucide-react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { daysSince } from "@/lib/utils";

/**
 * Where you're signed in, and when you signed in.
 *
 * Sessions come straight from auth.sessions via the my_sessions() RPC — no
 * service role in the path; the function scopes to auth.uid() so it cannot be
 * pointed anywhere else. Revoking deletes the session row, which kills its
 * refresh token: the device is out at the latest when its current hour's
 * access token expires. Revoking the session you are on is allowed and is
 * treated as "sign me out here too".
 *
 * The login history is our own login_events table — GoTrue's audit log is
 * empty in production and auth.sessions forgets a sign-in at sign-out.
 */
type Session = { id: string; created_at: string; last_seen: string; user_agent: string | null; ip: string | null; aal: string | null };
type LoginEvent = { id: string; ip: string | null; user_agent: string | null; created_at: string };

/** "Safari · Mac", from a raw UA string. Best-effort; raw beats wrong. */
function describeAgent(ua: string | null, unknown: string): string {
  if (!ua) return unknown;
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) && /Version\//.test(ua) ? "Safari" :
    /Firefox\//.test(ua) ? "Firefox" : null;
  const os =
    /iPhone|iPad/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Macintosh/.test(ua) ? "Mac" :
    /Windows/.test(ua) ? "Windows" :
    /Linux/.test(ua) ? "Linux" : null;
  if (!browser && !os) return unknown;
  return [browser, os].filter(Boolean).join(" · ");
}

export function SecurityActivity() {
  const { t } = useTranslation();
  const supabase = useRef(createClient()).current;
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [selfSessionId, setSelfSessionId] = useState<string | null>(null);
  const [logins, setLogins] = useState<LoginEvent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // The session making this request, from the caller's own JWT.
    supabase.auth.getSession().then(({ data }) => {
      try {
        const token = data.session?.access_token;
        if (!token) return;
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (typeof payload.session_id === "string") setSelfSessionId(payload.session_id);
      } catch { /* unmarked is fine */ }
    });
    supabase.rpc("my_sessions").then(({ data }) => setSessions((data as Session[] | null) ?? []));
    fetch("/api/account/logins").then((r) => (r.ok ? r.json() : null)).then((j) => setLogins(j?.logins ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revoke(id: string) {
    setBusy(id);
    const { data, error } = await supabase.rpc("revoke_my_session", { sid: id });
    setBusy(null);
    if (error || data !== true) { notify.error(t("security.revokeFailed")); return; }
    if (id === selfSessionId) {
      // We just revoked ourselves: finish the job locally and leave.
      await supabase.auth.signOut();
      window.location.href = "/auth/login";
      return;
    }
    notify.success(t("security.revoked"));
    setSessions((prev) => prev?.filter((s) => s.id !== id) ?? prev);
  }

  const h: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" };
  const title: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" };
  const sub: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", lineHeight: 1.6 };
  const row: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: "10px", padding: "9px 0", borderBottom: "1px solid var(--cr-rule)", flexWrap: "wrap" };
  const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-4)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* ── Active sessions ── */}
      <div>
        <div style={h}>
          <MonitorSmartphone style={{ width: 14, height: 14, color: "var(--cr-copper)" }} />
          <p style={title}>{t("security.sessionsTitle")}</p>
        </div>
        <p style={{ ...sub, marginBottom: "8px" }}>{t("security.sessionsSub")}</p>
        {sessions === null ? (
          <Loader2 style={{ width: 14, height: 14, color: "var(--cr-ink-4)" }} className="animate-spin" />
        ) : sessions.map((s) => (
          <div key={s.id} style={row}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>
              {describeAgent(s.user_agent, t("security.unknownDevice"))}
            </span>
            {s.id === selfSessionId && (
              <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "9px", borderRadius: "3px", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("security.thisDevice")}
              </span>
            )}
            {s.aal === "aal2" && (
              <span style={{ background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", color: "var(--cr-up)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "9px", borderRadius: "3px", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                2FA
              </span>
            )}
            {s.ip && <span style={mono}>{s.ip}</span>}
            <span style={{ ...mono, marginInlineStart: "auto" }}>
              {t("security.lastActive", { count: daysSince(s.last_seen) })}
            </span>
            <button
              onClick={() => revoke(s.id)}
              disabled={busy === s.id}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-down)", textDecoration: "underline", textUnderlineOffset: "2px", opacity: busy === s.id ? 0.5 : 1 }}
            >
              {s.id === selfSessionId ? t("security.signOutHere") : t("security.revoke")}
            </button>
          </div>
        ))}
      </div>

      {/* ── Recent sign-ins ── */}
      <div>
        <div style={h}>
          <History style={{ width: 14, height: 14, color: "var(--cr-copper)" }} />
          <p style={title}>{t("security.loginsTitle")}</p>
        </div>
        <p style={{ ...sub, marginBottom: "8px" }}>{t("security.loginsSub")}</p>
        {logins === null ? (
          <Loader2 style={{ width: 14, height: 14, color: "var(--cr-ink-4)" }} className="animate-spin" />
        ) : logins.length === 0 ? (
          <p style={sub}>{t("security.noLogins")}</p>
        ) : logins.map((l) => (
          <div key={l.id} style={row}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-2)" }}>
              {describeAgent(l.user_agent, t("security.unknownDevice"))}
            </span>
            {l.ip && <span style={mono}>{l.ip}</span>}
            <span style={{ ...mono, marginInlineStart: "auto" }}>
              {new Date(l.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
