"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import {
  Send, MessageSquare, Plus, Search, X, ArrowLeft,
  CheckCheck, Building2, Loader2, Users, AlertCircle, Paperclip, Archive, Search as SearchIcon } from "lucide-react";
import { getInitials } from "@/lib/utils";
import type { Profile, Thread, ThreadStatus, Message } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return t("dashboard.timeJustNow");
  if (diff < 3600)  return t("dashboard.timeMinAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("dashboard.timeHourAgo", { n: Math.floor(diff / 3600) });
  return t("dashboard.timeDayAgo", { n: Math.floor(diff / 86400) });
}

const STATUS_KEYS: Record<string, { labelKey: string; bg: string; color: string; border: string }> = {
  active:         { labelKey: "dashboard.statusActiveThread", bg: "var(--cr-up-bg)",   color: "var(--cr-up)",    border: "rgba(45,106,79,0.25)"   },
  due_diligence:  { labelKey: "dashboard.statusDueDiligence",  bg: "var(--cr-copper-bg)", color: "var(--cr-copper)", border: "var(--cr-copper-br)" },
  archived:       { labelKey: "dashboard.statusArchived",       bg: "var(--cr-paper-3)", color: "var(--cr-ink-4)", border: "var(--cr-rule)"         },
};

interface SearchAccount {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  avatar_url: string | null;
  entity_name?: string;
  entity_slug?: string;
  entity_type?: string;
  kind: "investor" | "startup";
}

interface Props {
  profile: Profile;
  threads: Thread[];
  myStartupId?: string | null;
  /** C32: the caller's own investor id, for naming investor↔investor threads. */
  myInvestorId?: string | null;
  unreadThreadIds?: string[];
}

// ── Shared element styles ─────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px",
  display: "block",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MessagesClient({ profile, threads: initialThreads, myStartupId, myInvestorId = null, unreadThreadIds = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [selectedThread, setSelectedThread] = useState<Thread | null>(initialThreads[0] || null);
  const [messages, setMessages]             = useState<Message[]>([]);
  const [newMessage, setNewMessage]         = useState("");
  const [sending, setSending]               = useState(false);
  const [search, setSearch]                 = useState("");
  const [showNewModal, setShowNewModal]     = useState(false);
  useEscapeKey(showNewModal, () => setShowNewModal(false));
  const [newBody, setNewBody]               = useState("");
  const [targetKind, setTargetKind]         = useState<"investor" | "startup">("investor");
  const [accountSearch, setAccountSearch]   = useState("");
  const [accountResults, setAccountResults] = useState<SearchAccount[]>([]);
  const [accountSearching, setAccountSearching] = useState(false);
  const [selectedAccount, setSelectedAccount]   = useState<SearchAccount | null>(null);
  const [accountDropOpen, setAccountDropOpen]   = useState(false);
  const [sendingNew, setSendingNew]             = useState(false);
  const [sendNewError, setSendNewError]         = useState("");
  const [mobileShowChat, setMobileShowChat]     = useState(false);
  const [statusFilter, setStatusFilter]         = useState("all");
  const [sortBy, setSortBy]                     = useState("recent");

  const bottomRef        = useRef<HTMLDivElement>(null);
  const supabaseRef      = useRef(createClient());
  const supabase         = supabaseRef.current;
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load + subscribe to messages when thread changes
  useEffect(() => {
    if (!selectedThread) return;
    // Opening a thread is reading it: clears these messages from the navbar
    // badge. Fire-and-forget is fine client-side.
    fetch("/api/messages/unread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: selectedThread.id }),
    }).catch(() => {});
    supabase.from("messages").select("*").eq("thread_id", selectedThread.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) notify.error(t("dashboard.errLoadMessagesFailed"));
        setMessages((data as Message[]) || []);
      });

    const ch = supabase.channel(`thread:${selectedThread.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${selectedThread.id}` },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages(prev => prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming]);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedThread?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Deep link from a deal card (?startupId=&investorId=) — select the matching
  // thread once on mount. Fails silently if no thread exists for that pair yet.
  useEffect(() => {
    const startupId = searchParams.get("startupId");
    const investorId = searchParams.get("investorId");
    if (!startupId || !investorId) return;
    const match = initialThreads.find(th => th.startup_id === startupId && th.investor_id === investorId);
    if (match) setSelectedThread(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Account search — also runs with an empty query so the dropdown shows a
  // browsable list of available accounts immediately, not just after typing.
  useEffect(() => {
    if (!accountDropOpen) return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setAccountSearching(true);
      const q          = accountSearch.trim();
      const targetRole = profile.role === "investor" ? "startup" : targetKind;
      try {
        if (targetRole === "startup" && profile.role === "investor") {
          const [profileRes, startupRes] = await Promise.all([
            supabase.from("profiles").select("id,full_name,email,role,avatar_url").eq("role","startup").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(10),
            supabase.from("startups").select("owner_id,name,slug").or(`status.eq.active,status.eq.pending_review`).ilike("name",`%${q}%`).limit(10),
          ]);
          const merged = new Map<string, SearchAccount>();
          (profileRes.data || []).forEach(p => merged.set(p.id, { ...(p as SearchAccount), kind: "startup" }));
          const ownerIds = (startupRes.data || []).map(s => s.owner_id).filter(Boolean);
          if (ownerIds.length > 0) {
            const { data: owners } = await supabase.from("profiles").select("id,full_name,email,role,avatar_url").in("id", ownerIds);
            (owners || []).forEach(owner => {
              const s = startupRes.data?.find(s => s.owner_id === owner.id);
              merged.set(owner.id, { ...(owner as SearchAccount), entity_name: s?.name, entity_slug: s?.slug, kind: "startup" });
            });
          }
          setAccountResults(Array.from(merged.values()).slice(0, 10));
        } else if (targetRole === "startup" && profile.role === "startup") {
          // Startup searching for another startup (peer messaging)
          const { data: startupRes } = await supabase
            .from("startups").select("owner_id,name,slug")
            .neq("owner_id", profile.id)
            .or(`status.eq.active,status.eq.pending_review`)
            .ilike("name", `%${q}%`).limit(10);
          const ownerIds = (startupRes || []).map(s => s.owner_id).filter(Boolean);
          const merged = new Map<string, SearchAccount>();
          if (ownerIds.length > 0) {
            const { data: owners } = await supabase.from("profiles").select("id,full_name,email,role,avatar_url").in("id", ownerIds);
            (owners || []).forEach(owner => {
              const s = startupRes?.find(s => s.owner_id === owner.id);
              merged.set(owner.id, { ...(owner as SearchAccount), entity_name: s?.name, entity_slug: s?.slug, kind: "startup" });
            });
          }
          setAccountResults(Array.from(merged.values()).slice(0, 10));
        } else {
          const [profileRes, investorRes] = await Promise.all([
            supabase.from("profiles").select("id,full_name,email,role,avatar_url").eq("role","investor").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(10),
            supabase.from("investors").select("owner_id,slug,type,display_name,firm_name").or(`display_name.ilike.%${q}%,firm_name.ilike.%${q}%`).limit(10),
          ]);
          const merged = new Map<string, SearchAccount>();
          (profileRes.data || []).forEach(p => merged.set(p.id, { ...(p as SearchAccount), kind: "investor" }));
          const ownerIds = (investorRes.data || []).map(i => i.owner_id).filter(Boolean);
          if (ownerIds.length > 0) {
            const { data: owners } = await supabase.from("profiles").select("id,full_name,email,role,avatar_url").in("id", ownerIds);
            (owners || []).forEach(owner => {
              const inv = investorRes.data?.find(i => i.owner_id === owner.id);
              merged.set(owner.id, { ...(owner as SearchAccount), entity_name: inv?.firm_name || inv?.display_name || owner.full_name || undefined, entity_slug: inv?.slug, entity_type: inv?.type, kind: "investor" });
            });
          }
          const profileIds = (profileRes.data || []).map(p => p.id);
          if (profileIds.length > 0) {
            const { data: invData } = await supabase.from("investors").select("owner_id,slug,type,display_name,firm_name").in("owner_id", profileIds);
            (invData || []).forEach(inv => {
              const ex = merged.get(inv.owner_id);
              if (ex && !ex.entity_name) merged.set(inv.owner_id, { ...ex, entity_name: inv.firm_name || inv.display_name || undefined, entity_slug: inv.slug, entity_type: inv.type, kind: "investor" });
            });
          }
          setAccountResults(Array.from(merged.values()).slice(0, 10));
        }
      } finally { setAccountSearching(false); }
    }, 300);
  }, [accountSearch, accountDropOpen, targetKind]);

  const otherStartup = (th: Thread) => th.startup_id === myStartupId ? th.recipient_startup : th.startup;

  // C32: an investor↔investor thread is named after the *other* investor,
  // with the company it is about as the sub-label.
  const otherInvestor = (th: Thread) => {
    const t2 = th as unknown as { investor_id?: string; recipient_investor_id?: string; investor?: { slug: string; display_name: string | null; firm_name: string | null; type?: string } | null; recipient_investor?: { slug: string; display_name: string | null; firm_name: string | null; type?: string } | null };
    if (!t2.recipient_investor_id) return null;
    return t2.investor_id === myInvestorId ? t2.recipient_investor ?? null : t2.investor ?? null;
  };

  const getLabel = (th: Thread) => {
    const co = otherInvestor(th);
    if (co) return co.display_name || co.firm_name || co.slug?.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || t("dashboard.investorLabel");
    if (th.recipient_startup_id) {
      return otherStartup(th)?.name || t("dashboard.startupLabel");
    }
    if (profile.role === "startup") {
      const inv = th.investor;
      return inv?.display_name || inv?.firm_name || inv?.slug?.replace(/-/g," ").replace(/\b\w/g,(c:string)=>c.toUpperCase()) || t("dashboard.investorLabel");
    }
    return th.startup?.name || t("dashboard.startupLabel");
  };
  const getSubLabel = (th: Thread) => {
    if (otherInvestor(th)) return th.startup?.name || "";
    if (th.recipient_startup_id) {
      return otherStartup(th)?.slug || "";
    }
    if (profile.role === "startup") {
      const type = th.investor?.type || "";
      return type.replace(/_/g," ").replace(/\b\w/g,(c:string)=>c.toUpperCase());
    }
    return th.startup?.slug || "";
  };

  const filteredThreads = initialThreads.filter(t => {
    const label = getLabel(t);
    const searchMatch = !search || label.toLowerCase().includes(search.toLowerCase());
    const statusMatch = statusFilter === "all" || t.status === statusFilter;
    const archiveMatch = showArchived ? archivedIds.has(t.id) : !archivedIds.has(t.id);
    return searchMatch && statusMatch && archiveMatch;
  }).sort((a, b) => {
    if (sortBy === "name") return getLabel(a).localeCompare(getLabel(b));
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // Opening a thread reads it (the effect above marks read server-side), so
  // the dot clears locally at the same moment.
  const [unreadSet, setUnreadSet] = useState<Set<string>>(() => new Set(unreadThreadIds));
  function selectThread(t: Thread) {
    setSelectedThread(t);
    setMobileShowChat(true);
    setUnreadSet((prev) => { if (!prev.has(t.id)) return prev; const n = new Set(prev); n.delete(t.id); return n; });
  }

  // Per-user archive (migration 052) + in-thread message search. Archived
  // threads leave the default list but stay one toggle away -- an archive
  // you cannot see into is a trash can.
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [msgQuery, setMsgQuery] = useState("");
  useEffect(() => {
    fetch("/api/messages/archive").then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.archived) setArchivedIds(new Set(j.archived as string[])); })
      .catch(() => {});
  }, []);
  async function toggleArchive(threadId: string) {
    const isArchived = archivedIds.has(threadId);
    // Optimistic; a failed request just puts the row back on reload.
    setArchivedIds(prev => {
      const next = new Set(prev);
      if (isArchived) next.delete(threadId); else next.add(threadId);
      return next;
    });
    await fetch("/api/messages/archive", {
      method: isArchived ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId }),
    }).catch(() => {});
  }

  // One pending attachment at a time; picking a file arms it, send ships it.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  async function sendMessage(e: { preventDefault(): void }) {
    e.preventDefault();
    if ((!newMessage.trim() && !attachedFile) || !selectedThread) return;
    setSending(true);

    if (attachedFile) {
      // Through the API, not a direct insert: the file has to reach storage
      // and the row has to point at it, and the route owns that pairing
      // (including deleting the object if the insert fails).
      const fd = new FormData();
      fd.append("file", attachedFile);
      fd.append("threadId", selectedThread.id);
      fd.append("body", newMessage.trim());
      const res = await fetch("/api/messages/attach", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(json.error || t("dashboard.errSendMessageFailed"));
      } else {
        const sent = json.message as Message;
        setMessages(prev => prev.some(m => m.id === sent.id) ? prev : [...prev, sent]);
        setNewMessage("");
        setAttachedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await supabase.from("threads").update({ updated_at: sent.created_at }).eq("id", selectedThread.id);
      }
      setSending(false);
      return;
    }

    // Through the API (not a direct insert): the reply route notifies the
    // other participant (bell + email preview), enforces the length cap, and
    // bumps the thread — a browser-side insert did none of that.
    const body = newMessage.trim();
    const res = await fetch("/api/messages/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: selectedThread.id, body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.message) {
      notify.error(json.error || t("dashboard.errSendMessageFailed"));
    } else {
      const sent = json.message as Message;
      setMessages(prev => prev.some(m => m.id === sent.id) ? prev : [...prev, sent]);
      setNewMessage("");
    }
    setSending(false);
  }

  async function updateStatus(status: ThreadStatus) {
    if (!selectedThread) return;
    const { error } = await supabase.from("threads").update({ status }).eq("id", selectedThread.id);
    if (error) { notify.error(t("errors.generic")); return; }
    setSelectedThread({ ...selectedThread, status });
  }

  function closeNewModal() {
    setShowNewModal(false); setSelectedAccount(null); setAccountSearch("");
    setNewBody(""); setAccountResults([]); setSendNewError(""); setTargetKind("investor");
  }

  async function sendNewMessage() {
    if (!selectedAccount || !newBody.trim()) return;
    setSendingNew(true); setSendNewError("");
    try {
      let threadId: string | undefined;

      if (selectedAccount.kind === "startup") {
        // Peer messaging: both sides are startups.
        if (!myStartupId) { setSendNewError(t("dashboard.errCompleteStartup")); setSendingNew(false); return; }
        const { data: otherStartupData } = await supabase.from("startups").select("id").eq("owner_id", selectedAccount.id).maybeSingle();
        if (!otherStartupData) { setSendNewError(t("dashboard.errStartConvo")); setSendingNew(false); return; }
        const { data: existing } = await supabase.from("threads").select("id")
          .or(`and(startup_id.eq.${myStartupId},recipient_startup_id.eq.${otherStartupData.id}),and(startup_id.eq.${otherStartupData.id},recipient_startup_id.eq.${myStartupId})`)
          .maybeSingle();
        threadId = existing?.id;
        if (!threadId) {
          const { data: newThread, error } = await supabase.from("threads")
            .insert({ startup_id: myStartupId, recipient_startup_id: otherStartupData.id, status: "active" })
            .select().single();
          if (error || !newThread) { setSendNewError(t("dashboard.errStartConvo")); setSendingNew(false); return; }
          threadId = newThread.id;
        }
      } else if (profile.role === "investor") {
        // Investor messaging a startup: route through the same gated API used
        // by the startup detail page's "Message" button, so tier limits and
        // rate limiting apply consistently regardless of entry point.
        const { data: startupData } = await supabase.from("startups").select("id").eq("owner_id", selectedAccount.id).maybeSingle();
        if (!startupData) { setSendNewError(t("dashboard.errNoStartupYet")); setSendingNew(false); return; }
        const { data: investorData } = await supabase.from("investors").select("id").eq("owner_id", profile.id).maybeSingle();
        if (!investorData) { setSendNewError(t("dashboard.errCompleteInvestor")); setSendingNew(false); return; }
        const res = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startupId: startupData.id, investorId: investorData.id, body: newBody.trim() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setSendNewError(err.error || t("dashboard.errStartConvo"));
          setSendingNew(false);
          return;
        }
        closeNewModal();
        router.refresh();
        return;
      } else {
        // Startup messaging an investor for the first time — no tier gate
        // exists on this direction today (only investor-initiated contact
        // is rate-limited), so this stays a direct insert.
        const { data: startupData } = await supabase.from("startups").select("id").eq("owner_id", profile.id).maybeSingle();
        const { data: investorData } = await supabase.from("investors").select("id").eq("owner_id", selectedAccount.id).maybeSingle();
        if (!startupData) { setSendNewError(t("dashboard.errCompleteStartup")); setSendingNew(false); return; }
        if (!investorData) { setSendNewError(t("dashboard.errNoInvestorYet")); setSendingNew(false); return; }
        const { data: existing } = await supabase.from("threads").select("id").eq("startup_id", startupData.id).eq("investor_id", investorData.id).maybeSingle();
        threadId = existing?.id;
        if (!threadId) {
          const { data: newThread, error } = await supabase.from("threads").insert({ startup_id: startupData.id, investor_id: investorData.id, status: "active" }).select().single();
          if (error || !newThread) { setSendNewError(t("dashboard.errStartConvo")); setSendingNew(false); return; }
          threadId = newThread.id;
        }
      }

      const { error: msgError } = await supabase.from("messages").insert({ thread_id: threadId, sender_id: profile.id, body: newBody.trim() });
      if (msgError) { setSendNewError(t("dashboard.errSendMessageFailed")); setSendingNew(false); return; }
      closeNewModal();
      router.refresh();
    } catch (err: any) { setSendNewError(err?.message || t("dashboard.errSomethingWrong2")); }
    setSendingNew(false);
  }

  useEffect(() => { setMsgQuery(""); }, [selectedThread?.id]);

  const selectedStatusKey = STATUS_KEYS[selectedThread?.status || "active"] || STATUS_KEYS.active;
  const selectedStatusInfo = { ...selectedStatusKey, label: t(selectedStatusKey.labelKey) };

  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 40px 60px" }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div className="ruled-label" style={{ marginBottom: "10px" }}>{t("dashboard.inbox")}</div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(24px,3vw,32px)", color: "var(--cr-ink)", letterSpacing: "-0.02em" }}>
              {t("dashboard.messages")}
            </h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
              {initialThreads.length === 0 ? t("dashboard.noConversationsYet") : initialThreads.length === 1 ? t("dashboard.conversationCountOne") : t("dashboard.conversationsCount", { count: initialThreads.length })}
            </p>
          </div>
          <button onClick={() => setShowNewModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "9px 18px", cursor: "pointer" }}>
            <Plus style={{ width: 14, height: 14 }} /> {t("dashboard.newMessageBtn")}
          </button>
        </div>

        {/* Main 2-col layout */}
        <div style={{ display: "flex", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", overflow: "hidden", height: "620px" }}>

          {/* ── Sidebar ── */}
          <div style={{ width: "300px", flexShrink: 0, display: mobileShowChat ? "none" : "flex", flexDirection: "column", borderRight: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)" }}>
            {/* Search */}
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--cr-rule)" }}>
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--cr-ink-4)" }} />
                <button onClick={() => setShowArchived(v => !v)}
                  aria-pressed={showArchived}
                  style={{ background: showArchived ? "var(--cr-copper-bg)" : "transparent", border: showArchived ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: showArchived ? 600 : 400, fontSize: "11px", color: showArchived ? "var(--cr-copper)" : "var(--cr-ink-4)", padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap", marginBottom: "8px" }}>
                  {showArchived ? t("messages.showingArchived", { count: archivedIds.size }) : t("messages.viewArchived", { count: archivedIds.size })}
                </button>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("dashboard.searchConversations")}
                  style={{ width: "100%", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", paddingLeft: "30px", paddingRight: "10px", paddingTop: "7px", paddingBottom: "7px", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>

            {/* Status filters */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--cr-rule)", display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[
                { v: "all", lk: "dashboard.filterAll" },
                { v: "active", lk: "dashboard.filterActive" },
                { v: "due_diligence", lk: "dashboard.filterDueDiligence" },
                { v: "archived", lk: "dashboard.filterArchived" },
              ].map(f => (
                <button key={f.v} onClick={() => setStatusFilter(f.v)}
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: statusFilter === f.v ? 500 : 300, fontSize: "11px", padding: "4px 10px", borderRadius: "3px", border: statusFilter === f.v ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)", background: statusFilter === f.v ? "var(--cr-copper-bg)" : "transparent", color: statusFilter === f.v ? "var(--cr-copper)" : "var(--cr-ink-4)", cursor: "pointer" }}>
                  {t(f.lk)}
                </button>
              ))}
            </div>

            {/* Thread list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {filteredThreads.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "24px", textAlign: "center", gap: "12px" }}>
                  <MessageSquare style={{ width: 32, height: 32, color: "var(--cr-ink-4)" }} />
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("dashboard.noConversationsYet")}</p>
                </div>
              ) : filteredThreads.map(thread => {
                const isSelected = selectedThread?.id === thread.id;
                const st = thread.status || "active";
                return (
                  <button key={thread.id} onClick={() => selectThread(thread)}
                    style={{ width: "100%", textAlign: "left", padding: "14px 16px", borderBottom: "1px solid var(--cr-rule)", background: isSelected ? "var(--cr-paper-3)" : "transparent", borderLeft: isSelected ? "2px solid var(--cr-copper)" : "2px solid transparent", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "4px", background: "var(--cr-paper-4)", border: "1px solid var(--cr-rule)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "13px", color: "var(--cr-copper)" }}>
                        {getInitials(getLabel(thread))}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                          <p style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: unreadSet.has(thread.id) ? 700 : 600, fontSize: "13px", color: "var(--cr-ink)" }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getLabel(thread)}</span>
                            {unreadSet.has(thread.id) && (
                              <span aria-label={t("messages.unreadAria")} style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--cr-copper)", flexShrink: 0 }} />
                            )}
                          </p>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", flexShrink: 0 }}>{timeAgo(thread.updated_at, t)}</span>
                        </div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px", textTransform: "capitalize" }}>{getSubLabel(thread)}</p>
                        {st !== "active" && (
                          <span style={{ background: STATUS_KEYS[st]?.bg || "var(--cr-paper-3)", color: STATUS_KEYS[st]?.color || "var(--cr-ink-4)", border: `1px solid ${STATUS_KEYS[st]?.border || "var(--cr-rule)"}`, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", borderRadius: "3px", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.05em", display: "inline-block", marginTop: "4px" }}>
                            {STATUS_KEYS[st] ? t(STATUS_KEYS[st].labelKey) : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Chat pane ── */}
          {selectedThread ? (
            <div style={{ flex: 1, display: (!mobileShowChat) ? "none" : "flex", flexDirection: "column", minWidth: 0 }} className="md:flex">
              {/* Chat header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button onClick={() => setMobileShowChat(false)} aria-label={t("common.back")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}>
                    <ArrowLeft style={{ width: 16, height: 16 }} />
                  </button>
                  <div style={{ width: 32, height: 32, borderRadius: "3px", background: "var(--cr-paper-4)", border: "1px solid var(--cr-rule)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "12px", color: "var(--cr-copper)" }}>
                    {getInitials(getLabel(selectedThread))}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>{getLabel(selectedThread)}</p>
                      <span style={{ background: selectedStatusInfo.bg, color: selectedStatusInfo.color, border: `1px solid ${selectedStatusInfo.border}`, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", borderRadius: "3px", padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {selectedStatusInfo.label}
                      </span>
                    </div>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "capitalize" }}>{getSubLabel(selectedThread)}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  <button onClick={() => toggleArchive(selectedThread.id)}
                    aria-label={archivedIds.has(selectedThread.id) ? t("messages.unarchive") : t("messages.archive")}
                    title={archivedIds.has(selectedThread.id) ? t("messages.unarchive") : t("messages.archive")}
                    style={{ background: archivedIds.has(selectedThread.id) ? "var(--cr-copper-bg)" : "var(--cr-paper-3)", border: archivedIds.has(selectedThread.id) ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule-dark)", borderRadius: "4px", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Archive style={{ width: 13, height: 13, color: archivedIds.has(selectedThread.id) ? "var(--cr-copper)" : "var(--cr-ink-4)" }} />
                  </button>
                  {profile.role === "startup" && selectedThread.status === "active" && (
                    <button onClick={() => updateStatus("due_diligence")}
                      style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", padding: "5px 10px", cursor: "pointer" }}>
                      {t("dashboard.moveToDueDiligence")}
                    </button>
                  )}
                  {profile.role === "startup" && selectedThread.status === "due_diligence" && (
                    <button onClick={() => updateStatus("active")}
                      style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", padding: "5px 10px", cursor: "pointer" }}>
                      {t("dashboard.backToActive")}
                    </button>
                  )}
                  {(selectedThread.recipient_startup_id ? otherStartup(selectedThread)?.slug : selectedThread.startup?.slug) && (
                    <a href={`/startups/${selectedThread.recipient_startup_id ? otherStartup(selectedThread)?.slug : selectedThread.startup?.slug}`}
                      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
                      {t("dashboard.viewStartup2")} →
                    </a>
                  )}
                </div>
              </div>

              {/* Messages area */}
              {/* In-thread search: threads become unusable at fifty messages
                  without it. Filters the loaded messages client-side -- they
                  are all already here. Cleared automatically on thread switch. */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 20px", borderBottom: "1px solid var(--cr-rule)", background: "var(--cr-paper)" }}>
                <SearchIcon style={{ width: 12, height: 12, color: "var(--cr-ink-4)", flexShrink: 0 }} />
                <input value={msgQuery} onChange={e => setMsgQuery(e.target.value)}
                  placeholder={t("messages.searchInThread")}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink)" }} />
                {msgQuery.trim() && (
                  <button onClick={() => setMsgQuery("")}
                    style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-copper)", textDecoration: "underline", textUnderlineOffset: "2px", padding: 0 }}>
                    {t("messages.clearSearch")}
                  </button>
                )}
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "8px", background: "var(--cr-paper)" }}>
                {messages.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "var(--cr-ink-4)" }}>
                    <MessageSquare style={{ width: 28, height: 28 }} />
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px" }}>{t("dashboard.startConversation")}</p>
                  </div>
                )}
                {(() => {
                  // One explicit receipt under the newest own message the
                  // counterpart has read; the per-bubble check colour carries
                  // the rest.
                  const lastReadOwnId = [...messages].reverse().find(m => m.sender_id === profile.id && m.read_at)?.id;
                  const visibleMessages = msgQuery.trim()
                    ? messages.filter(m =>
                        m.body.toLowerCase().includes(msgQuery.trim().toLowerCase()) ||
                        (m.attachment_name ?? "").toLowerCase().includes(msgQuery.trim().toLowerCase()))
                    : messages;
                  if (visibleMessages.length === 0 && msgQuery.trim()) {
                    return (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "10px", color: "var(--cr-ink-4)" }}>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px" }}>{t("messages.noMatches", { query: msgQuery.trim() })}</p>
                        <button onClick={() => setMsgQuery("")}
                          style={{ background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "5px 14px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)" }}>
                          {t("messages.clearSearch")}
                        </button>
                      </div>
                    );
                  }
                  return visibleMessages.map((msg, i) => {
                  const isOwn = msg.sender_id === profile.id;
                  const showTime = i === 0 || (new Date(msg.created_at).getTime() - new Date(visibleMessages[i - 1].created_at).getTime()) > 5 * 60 * 1000;
                  return (
                    <div key={msg.id}>
                      {showTime && (
                        <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                          <span style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", padding: "3px 10px" }}>
                            {new Date(msg.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: isOwn ? "flex-end" : "flex-start" }}>
                        <div style={{
                          maxWidth: "70%", borderRadius: "4px", padding: "10px 14px",
                          background: isOwn ? "var(--cr-copper)" : "var(--cr-paper-2)",
                          border: isOwn ? "none" : "1px solid var(--cr-rule-dark)",
                          color: isOwn ? "#fff" : "var(--cr-ink)",
                        }}>
                          {msg.attachment_path && (
                            <a href={`/api/messages/attachment?id=${msg.id}`}
                              style={{ display: "inline-flex", alignItems: "center", gap: "7px", marginBottom: msg.body && msg.body !== msg.attachment_name ? "6px" : 0, padding: "7px 10px", borderRadius: "4px", background: isOwn ? "rgba(255,255,255,0.15)" : "var(--cr-paper-3)", border: isOwn ? "1px solid rgba(255,255,255,0.25)" : "1px solid var(--cr-rule-dark)", color: "inherit", textDecoration: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", maxWidth: "100%" }}>
                              <Paperclip style={{ width: 12, height: 12, flexShrink: 0 }} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.attachment_name}</span>
                            </a>
                          )}
                          {/* A file-only message stores the filename as its body; showing both would say it twice. */}
                          {(!msg.attachment_path || (msg.body && msg.body !== msg.attachment_name)) && (
                            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.body}</p>
                          )}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px", marginTop: "4px" }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "10px", color: isOwn ? "rgba(255,255,255,0.6)" : "var(--cr-ink-4)" }}>
                              {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {isOwn && <CheckCheck aria-label={msg.read_at ? t("messages.seen") : undefined} style={{ width: 11, height: 11, color: msg.read_at ? "#fff" : "rgba(255,255,255,0.4)" }} />}
                          </div>
                        </div>
                      </div>
                      {isOwn && msg.id === lastReadOwnId && (
                        <p style={{ textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", color: "var(--cr-ink-4)", marginTop: "3px" }}>
                          {t("messages.seen")}
                        </p>
                      )}
                    </div>
                  );
                  });
                })()}
                <div ref={bottomRef} />
              </div>

              {/* Compose */}
              <form onSubmit={sendMessage} style={{ padding: "12px 16px", borderTop: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)", display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
                {/* Canned openers: three good first messages, one click each.
                    Inserted, not sent -- the sender still edits and owns it. */}
                {!newMessage && (
                  <select value="" aria-label={t("messages.templates")}
                    onChange={e => { if (e.target.value) setNewMessage(t(e.target.value)); }}
                    style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-4)", padding: "9px 6px", outline: "none", maxWidth: "90px" }}>
                    <option value="">{t("messages.templates")}</option>
                    <option value="messages.tplIntro">{t("messages.tplIntroLabel")}</option>
                    <option value="messages.tplMetrics">{t("messages.tplMetricsLabel")}</option>
                    <option value="messages.tplCall">{t("messages.tplCallLabel")}</option>
                  </select>
                )}
                <input ref={fileInputRef} type="file" hidden
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.docx,.pptx"
                  onChange={e => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 10 * 1024 * 1024) { notify.error(t("messages.attachTooBig")); e.target.value = ""; return; }
                    setAttachedFile(f);
                  }} />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  aria-label={t("messages.attachFile")}
                  style={{ width: 38, height: 38, background: attachedFile ? "var(--cr-copper-bg)" : "var(--cr-paper-3)", border: attachedFile ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule-dark)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <Paperclip style={{ width: 14, height: 14, color: attachedFile ? "var(--cr-copper)" : "var(--cr-ink-4)" }} />
                </button>
                <textarea value={newMessage} onChange={e => setNewMessage(e.target.value.slice(0, 2000))}
                  maxLength={2000}
                  placeholder={attachedFile ? t("messages.attachCaptionPh", { name: attachedFile.name }) : t("dashboard.composePlaceholder")}
                  rows={1} style={{ flex: 1, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "9px 12px", resize: "none", minHeight: "38px", maxHeight: "120px", outline: "none", boxSizing: "border-box" }}
                  onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (newMessage.trim() || attachedFile) sendMessage(e); } }}
                  onFocus={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
                  onBlur={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}
                />
                <button type="submit" disabled={(!newMessage.trim() && !attachedFile) || sending}
                  style={{ width: 38, height: 38, background: "var(--cr-copper)", border: "none", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: (!newMessage.trim() && !attachedFile) || sending ? 0.5 : 1 }}>
                  {sending ? <Loader2 style={{ width: 15, height: 15, color: "#fff" }} /> : <Send style={{ width: 15, height: 15, color: "#fff" }} />}
                </button>
              </form>
              {/* Character budget only when it matters (>1500 of 2000). */}
              {newMessage.length > 1500 && (
                <p aria-live="polite" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: newMessage.length >= 2000 ? "var(--cr-down)" : "var(--cr-ink-4)", textAlign: "right", padding: "4px 12px 0" }}>
                  {newMessage.length} / 2000
                </p>
              )}
              {/* Messages are part of the deal record — say so where they are written. */}
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", textAlign: "center", padding: "6px 12px 8px" }}>
                {t("messages.legalNote")}
              </p>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)" }}>
              <div style={{ textAlign: "center" }}>
                <MessageSquare style={{ width: 36, height: 36, color: "var(--cr-ink-4)", margin: "0 auto 12px" }} />
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", color: "var(--cr-ink-3)" }}>{t("dashboard.selectConversation")}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginTop: "4px" }}>{t("dashboard.orStartNew")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── New Message Modal ── */}
      {showNewModal && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,22,18,0.55)", padding: "16px" }}>
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "28px", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "20px", color: "var(--cr-ink)" }}>{t("dashboard.newMessageModalTitle")}</h2>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                  {profile.role === "investor" ? t("dashboard.searchStartupHint") : targetKind === "investor" ? t("dashboard.searchInvestorHint") : t("dashboard.searchStartupHint")}
                </p>
              </div>
              <button onClick={closeNewModal} aria-label={t("common.close")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Recipient type toggle — only startups can choose between investor and peer startup */}
              {profile.role === "startup" && !selectedAccount && (
                <div style={{ display: "flex", gap: "6px" }}>
                  {(["investor", "startup"] as const).map(k => (
                    <button key={k}
                      onClick={() => { setTargetKind(k); setAccountSearch(""); setAccountResults([]); setSendNewError(""); }}
                      style={{
                        flex: 1, height: "36px", borderRadius: "4px",
                        border: targetKind === k ? "1px solid var(--cr-copper)" : "1px solid var(--cr-rule-dark)",
                        background: targetKind === k ? "var(--cr-copper-bg)" : "transparent",
                        color: targetKind === k ? "var(--cr-copper)" : "var(--cr-ink-3)",
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", cursor: "pointer",
                      }}>
                      {k === "investor" ? t("nav.investors") : t("nav.startups")}
                    </button>
                  ))}
                </div>
              )}

              {/* To field */}
              <div>
                <span style={labelStyle}>{t("dashboard.toLabel")}</span>
                <div style={{ position: "relative" }}>
                  {selectedAccount ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", border: "1px solid var(--cr-copper)", borderRadius: "4px", padding: "10px 12px", background: "var(--cr-copper-bg)" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "3px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "12px", color: "var(--cr-copper)", flexShrink: 0 }}>
                        {getInitials(selectedAccount.entity_name || selectedAccount.full_name || selectedAccount.email)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {selectedAccount.entity_name || selectedAccount.full_name || selectedAccount.email}
                        </p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "capitalize" }}>
                          {selectedAccount.entity_type?.replace(/_/g, " ") || selectedAccount.role}
                        </p>
                      </div>
                      <button onClick={() => { setSelectedAccount(null); setAccountSearch(""); setAccountResults([]); setSendNewError(""); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}>
                        <X style={{ width: 15, height: 15 }} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Search style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--cr-ink-4)", pointerEvents: "none" }} />
                      <input value={accountSearch}
                        onChange={e => { setAccountSearch(e.target.value); setAccountDropOpen(true); setSendNewError(""); }}
                        onFocus={() => setAccountDropOpen(true)}
                        placeholder={profile.role === "investor" ? t("dashboard.searchStartupsPh") : targetKind === "investor" ? t("dashboard.searchInvestorsPh") : t("dashboard.searchStartupsPh")}
                        autoFocus
                        style={{ width: "100%", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", paddingLeft: "30px", paddingRight: "12px", paddingTop: "9px", paddingBottom: "9px", outline: "none", boxSizing: "border-box" }} />
                    </>
                  )}

                  {/* Dropdown */}
                  {!selectedAccount && accountDropOpen && (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "4px", zIndex: 10, maxHeight: "220px", overflowY: "auto" }}>
                      {accountSearching ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", gap: "8px", color: "var(--cr-ink-4)" }}>
                          <Loader2 style={{ width: 14, height: 14 }} /> <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px" }}>{t("dashboard.searching")}</span>
                        </div>
                      ) : accountResults.length === 0 ? (
                        <p style={{ padding: "16px 12px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("dashboard.noResultsFound")}</p>
                      ) : (
                        <>
                          {!accountSearch.trim() && (
                            <p style={{ padding: "8px 12px 4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {t("dashboard.suggestedAccounts")}
                            </p>
                          )}
                          {accountResults.map(a => (
                        <button key={a.id} onClick={() => { setSelectedAccount(a); setAccountDropOpen(false); setAccountSearch(""); }}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", borderRadius: "3px", textAlign: "left" }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--cr-paper-3)")}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: "3px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "12px", color: "var(--cr-copper)", flexShrink: 0 }}>
                            {getInitials(a.entity_name || a.full_name || a.email)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.entity_name || a.full_name || a.email}
                            </p>
                            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "capitalize" }}>
                              {a.entity_type?.replace(/_/g," ") || a.role}{a.entity_name && a.full_name && a.entity_name !== a.full_name ? ` · ${a.full_name}` : ""}
                            </p>
                          </div>
                          {a.entity_name && (
                            <div style={{ width: 20, height: 20, borderRadius: "2px", background: "var(--cr-paper-4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {a.role === "startup" ? <Building2 style={{ width: 11, height: 11, color: "var(--cr-ink-3)" }} /> : <Users style={{ width: 11, height: 11, color: "var(--cr-ink-3)" }} />}
                            </div>
                          )}
                        </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {sendNewError && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", background: "rgba(180,50,50,0.06)", border: "1px solid rgba(180,50,50,0.2)", borderRadius: "4px", padding: "10px 12px" }}>
                  <AlertCircle style={{ width: 14, height: 14, color: "var(--cr-down)", flexShrink: 0, marginTop: "1px" }} />
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-down)" }}>{sendNewError}</p>
                </div>
              )}

              {/* Message body */}
              <div>
                <span style={labelStyle}>{t("dashboard.messageLabel")}</span>
                <textarea value={newBody} onChange={e => setNewBody(e.target.value)}
                  placeholder={selectedAccount ? t("dashboard.messageTo", { name: selectedAccount.entity_name || selectedAccount.full_name || selectedAccount.email }) : t("dashboard.selectRecipientFirst")}
                  rows={5} disabled={!selectedAccount}
                  style={{ width: "100%", background: selectedAccount ? "var(--cr-paper-3)" : "var(--cr-paper-4)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "10px 12px", resize: "none", outline: "none", boxSizing: "border-box", opacity: selectedAccount ? 1 : 0.5 }}
                  onFocus={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
                  onBlur={e   => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}
                />
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={closeNewModal}
                  style={{ flex: 1, height: "44px", background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
                  {t("dashboard.cancel")}
                </button>
                <button onClick={sendNewMessage} disabled={!selectedAccount || !newBody.trim() || sendingNew}
                  style={{ flex: 1, height: "44px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", opacity: !selectedAccount || !newBody.trim() || sendingNew ? 0.5 : 1 }}>
                  {sendingNew ? <><Loader2 style={{ width: 14, height: 14 }} /> {t("dashboard.sending2")}</> : <><Send style={{ width: 14, height: 14 }} /> {t("dashboard.sendMessageBtn")}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
