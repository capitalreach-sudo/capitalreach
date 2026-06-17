"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Send, MessageSquare, Plus, Search, X, ArrowLeft,
  CheckCheck, Building2, Loader2, Users, AlertCircle,
} from "lucide-react";
import { getInitials } from "@/lib/utils";
import type { Profile, Thread, Message } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "Just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  active:         { label: "Active",         bg: "var(--cr-up-bg)",   color: "var(--cr-up)",    border: "rgba(45,106,79,0.25)"   },
  due_diligence:  { label: "Due Diligence",  bg: "var(--cr-copper-bg)", color: "var(--cr-copper)", border: "var(--cr-copper-br)" },
  archived:       { label: "Archived",       bg: "var(--cr-paper-3)", color: "var(--cr-ink-4)", border: "var(--cr-rule)"         },
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
}

interface Props {
  profile: Profile;
  threads: Thread[];
}

// ── Shared element styles ─────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px",
  display: "block",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MessagesClient({ profile, threads: initialThreads }: Props) {
  const router = useRouter();
  const [selectedThread, setSelectedThread] = useState<Thread | null>(initialThreads[0] || null);
  const [messages, setMessages]             = useState<Message[]>([]);
  const [newMessage, setNewMessage]         = useState("");
  const [sending, setSending]               = useState(false);
  const [search, setSearch]                 = useState("");
  const [showNewModal, setShowNewModal]     = useState(false);
  const [newBody, setNewBody]               = useState("");
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
    supabase.from("messages").select("*").eq("thread_id", selectedThread.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data as Message[]) || []));

    const ch = supabase.channel(`thread:${selectedThread.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${selectedThread.id}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedThread?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Account search
  useEffect(() => {
    if (!accountDropOpen) return;
    if (!accountSearch.trim()) { setAccountResults([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setAccountSearching(true);
      const q          = accountSearch.trim();
      const targetRole = profile.role === "investor" ? "startup" : "investor";
      try {
        if (targetRole === "startup") {
          const [profileRes, startupRes] = await Promise.all([
            supabase.from("profiles").select("id,full_name,email,role,avatar_url").eq("role","startup").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(6),
            supabase.from("startups").select("owner_id,name,slug").or(`status.eq.active,status.eq.pending_review`).ilike("name",`%${q}%`).limit(6),
          ]);
          const merged = new Map<string, SearchAccount>();
          (profileRes.data || []).forEach(p => merged.set(p.id, { ...(p as SearchAccount) }));
          const ownerIds = (startupRes.data || []).map(s => s.owner_id).filter(Boolean);
          if (ownerIds.length > 0) {
            const { data: owners } = await supabase.from("profiles").select("id,full_name,email,role,avatar_url").in("id", ownerIds);
            (owners || []).forEach(owner => {
              const s = startupRes.data?.find(s => s.owner_id === owner.id);
              merged.set(owner.id, { ...(owner as SearchAccount), entity_name: s?.name, entity_slug: s?.slug });
            });
          }
          setAccountResults(Array.from(merged.values()).slice(0, 8));
        } else {
          const [profileRes, investorRes] = await Promise.all([
            supabase.from("profiles").select("id,full_name,email,role,avatar_url").eq("role","investor").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(6),
            supabase.from("investors").select("owner_id,slug,type,display_name,firm_name").or(`display_name.ilike.%${q}%,firm_name.ilike.%${q}%`).limit(6),
          ]);
          const merged = new Map<string, SearchAccount>();
          (profileRes.data || []).forEach(p => merged.set(p.id, { ...(p as SearchAccount) }));
          const ownerIds = (investorRes.data || []).map(i => i.owner_id).filter(Boolean);
          if (ownerIds.length > 0) {
            const { data: owners } = await supabase.from("profiles").select("id,full_name,email,role,avatar_url").in("id", ownerIds);
            (owners || []).forEach(owner => {
              const inv = investorRes.data?.find(i => i.owner_id === owner.id);
              merged.set(owner.id, { ...(owner as SearchAccount), entity_name: inv?.firm_name || inv?.display_name || owner.full_name || undefined, entity_slug: inv?.slug, entity_type: inv?.type });
            });
          }
          const profileIds = (profileRes.data || []).map(p => p.id);
          if (profileIds.length > 0) {
            const { data: invData } = await supabase.from("investors").select("owner_id,slug,type,display_name,firm_name").in("owner_id", profileIds);
            (invData || []).forEach(inv => {
              const ex = merged.get(inv.owner_id);
              if (ex && !ex.entity_name) merged.set(inv.owner_id, { ...ex, entity_name: inv.firm_name || inv.display_name || undefined, entity_slug: inv.slug, entity_type: inv.type });
            });
          }
          setAccountResults(Array.from(merged.values()).slice(0, 8));
        }
      } finally { setAccountSearching(false); }
    }, 300);
  }, [accountSearch, accountDropOpen]);

  const getLabel = (t: Thread) => {
    if (profile.role === "startup") {
      const inv = (t as any).investor;
      return inv?.display_name || inv?.firm_name || inv?.slug?.replace(/-/g," ").replace(/\b\w/g,(c:string)=>c.toUpperCase()) || "Investor";
    }
    return (t as any).startup?.name || "Startup";
  };
  const getSubLabel = (t: Thread) => {
    if (profile.role === "startup") {
      const type = (t as any).investor?.type || "";
      return type.replace(/_/g," ").replace(/\b\w/g,(c:string)=>c.toUpperCase());
    }
    return (t as any).startup?.slug || "";
  };

  const filteredThreads = initialThreads.filter(t => {
    const label = getLabel(t);
    const searchMatch = !search || label.toLowerCase().includes(search.toLowerCase());
    const statusMatch = statusFilter === "all" || (t as any).status === statusFilter;
    return searchMatch && statusMatch;
  }).sort((a, b) => {
    if (sortBy === "name") return getLabel(a).localeCompare(getLabel(b));
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  function selectThread(t: Thread) { setSelectedThread(t); setMobileShowChat(true); }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedThread) return;
    setSending(true);
    await supabase.from("messages").insert({ thread_id: selectedThread.id, sender_id: profile.id, body: newMessage.trim() });
    setNewMessage("");
    setSending(false);
  }

  async function updateStatus(status: string) {
    if (!selectedThread) return;
    await supabase.from("threads").update({ status }).eq("id", selectedThread.id);
    setSelectedThread({ ...selectedThread, status: status as any });
  }

  function closeNewModal() {
    setShowNewModal(false); setSelectedAccount(null); setAccountSearch("");
    setNewBody(""); setAccountResults([]); setSendNewError("");
  }

  async function sendNewMessage() {
    if (!selectedAccount || !newBody.trim()) return;
    setSendingNew(true); setSendNewError("");
    try {
      const [startupOwnerId, investorOwnerId] = profile.role === "investor"
        ? [selectedAccount.id, profile.id]
        : [profile.id, selectedAccount.id];
      const [{ data: startupData }, { data: investorData }] = await Promise.all([
        supabase.from("startups").select("id").eq("owner_id", startupOwnerId).maybeSingle(),
        supabase.from("investors").select("id").eq("owner_id", investorOwnerId).maybeSingle(),
      ]);
      if (!startupData) { setSendNewError(profile.role === "investor" ? "This user hasn't set up a startup profile yet." : "Complete your startup profile setup first."); setSendingNew(false); return; }
      if (!investorData) { setSendNewError(profile.role === "startup" ? "This user hasn't set up an investor profile yet." : "Complete your investor profile setup first."); setSendingNew(false); return; }
      const { data: existing } = await supabase.from("threads").select("id").eq("startup_id", startupData.id).eq("investor_id", investorData.id).maybeSingle();
      let threadId = existing?.id;
      if (!threadId) {
        const { data: newThread, error } = await supabase.from("threads").insert({ startup_id: startupData.id, investor_id: investorData.id, status: "active" }).select().single();
        if (error || !newThread) { setSendNewError("Failed to start conversation. Please try again."); setSendingNew(false); return; }
        threadId = newThread.id;
      }
      await supabase.from("messages").insert({ thread_id: threadId, sender_id: profile.id, body: newBody.trim() });
      closeNewModal();
      router.refresh();
    } catch (err: any) { setSendNewError(err?.message || "Something went wrong."); }
    setSendingNew(false);
  }

  const selectedStatusInfo = STATUS_STYLE[(selectedThread as any)?.status || "active"] || STATUS_STYLE.active;

  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 40px 60px" }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div className="ruled-label" style={{ marginBottom: "10px" }}>Inbox</div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(24px,3vw,32px)", color: "var(--cr-ink)", letterSpacing: "-0.02em" }}>
              Messages
            </h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
              {initialThreads.length === 0 ? "No conversations yet" : `${initialThreads.length} conversation${initialThreads.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button onClick={() => setShowNewModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "9px 18px", cursor: "pointer" }}>
            <Plus style={{ width: 14, height: 14 }} /> New Message
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
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…"
                  style={{ width: "100%", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", paddingLeft: "30px", paddingRight: "10px", paddingTop: "7px", paddingBottom: "7px", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>

            {/* Status filters */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--cr-rule)", display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[{ v: "all", l: "All" }, { v: "active", l: "Active" }, { v: "due_diligence", l: "Due Diligence" }, { v: "archived", l: "Archived" }].map(f => (
                <button key={f.v} onClick={() => setStatusFilter(f.v)}
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: statusFilter === f.v ? 500 : 300, fontSize: "11px", padding: "4px 10px", borderRadius: "3px", border: statusFilter === f.v ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)", background: statusFilter === f.v ? "var(--cr-copper-bg)" : "transparent", color: statusFilter === f.v ? "var(--cr-copper)" : "var(--cr-ink-4)", cursor: "pointer" }}>
                  {f.l}
                </button>
              ))}
            </div>

            {/* Thread list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {filteredThreads.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "24px", textAlign: "center", gap: "12px" }}>
                  <MessageSquare style={{ width: 32, height: 32, color: "var(--cr-ink-4)" }} />
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>No conversations yet</p>
                </div>
              ) : filteredThreads.map(thread => {
                const isSelected = selectedThread?.id === thread.id;
                const st = (thread as any).status || "active";
                return (
                  <button key={thread.id} onClick={() => selectThread(thread)}
                    style={{ width: "100%", textAlign: "left", padding: "14px 16px", borderBottom: "1px solid var(--cr-rule)", background: isSelected ? "var(--cr-paper-3)" : "transparent", borderLeft: isSelected ? "2px solid var(--cr-copper)" : "2px solid transparent", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "4px", background: "var(--cr-paper-4)", border: "1px solid var(--cr-rule)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "13px", color: "var(--cr-copper)" }}>
                        {getInitials(getLabel(thread))}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getLabel(thread)}</p>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", flexShrink: 0 }}>{timeAgo(thread.updated_at)}</span>
                        </div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px", textTransform: "capitalize" }}>{getSubLabel(thread)}</p>
                        {st !== "active" && (
                          <span style={{ background: STATUS_STYLE[st]?.bg || "var(--cr-paper-3)", color: STATUS_STYLE[st]?.color || "var(--cr-ink-4)", border: `1px solid ${STATUS_STYLE[st]?.border || "var(--cr-rule)"}`, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", borderRadius: "3px", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.05em", display: "inline-block", marginTop: "4px" }}>
                            {STATUS_STYLE[st]?.label}
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
                  <button onClick={() => setMobileShowChat(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}>
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
                  {profile.role === "startup" && (selectedThread as any).status === "active" && (
                    <button onClick={() => updateStatus("due_diligence")}
                      style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", padding: "5px 10px", cursor: "pointer" }}>
                      Move to Due Diligence
                    </button>
                  )}
                  {profile.role === "startup" && (selectedThread as any).status === "due_diligence" && (
                    <button onClick={() => updateStatus("active")}
                      style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", padding: "5px 10px", cursor: "pointer" }}>
                      Back to Active
                    </button>
                  )}
                  {(selectedThread as any).startup?.slug && (
                    <a href={`/startups/${(selectedThread as any).startup.slug}`}
                      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
                      View startup →
                    </a>
                  )}
                </div>
              </div>

              {/* Messages area */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "8px", background: "var(--cr-paper)" }}>
                {messages.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "var(--cr-ink-4)" }}>
                    <MessageSquare style={{ width: 28, height: 28 }} />
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px" }}>No messages yet. Start the conversation.</p>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const isOwn = msg.sender_id === profile.id;
                  const showTime = i === 0 || (new Date(msg.created_at).getTime() - new Date(messages[i - 1].created_at).getTime()) > 5 * 60 * 1000;
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
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.body}</p>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px", marginTop: "4px" }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "10px", color: isOwn ? "rgba(255,255,255,0.6)" : "var(--cr-ink-4)" }}>
                              {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {isOwn && <CheckCheck style={{ width: 11, height: 11, color: "rgba(255,255,255,0.6)" }} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Compose */}
              <form onSubmit={sendMessage} style={{ padding: "12px 16px", borderTop: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)", display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
                <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  rows={1} style={{ flex: 1, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "9px 12px", resize: "none", minHeight: "38px", maxHeight: "120px", outline: "none", boxSizing: "border-box" }}
                  onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (newMessage.trim()) sendMessage(e as any); } }}
                  onFocus={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
                  onBlur={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}
                />
                <button type="submit" disabled={!newMessage.trim() || sending}
                  style={{ width: 38, height: 38, background: "var(--cr-copper)", border: "none", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: !newMessage.trim() || sending ? 0.5 : 1 }}>
                  {sending ? <Loader2 style={{ width: 15, height: 15, color: "#fff" }} /> : <Send style={{ width: 15, height: 15, color: "#fff" }} />}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)" }}>
              <div style={{ textAlign: "center" }}>
                <MessageSquare style={{ width: 36, height: 36, color: "var(--cr-ink-4)", margin: "0 auto 12px" }} />
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", color: "var(--cr-ink-3)" }}>Select a conversation</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginTop: "4px" }}>Or start a new one above</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── New Message Modal ── */}
      {showNewModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,22,18,0.55)", padding: "16px" }}>
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "28px", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "20px", color: "var(--cr-ink)" }}>New Message</h2>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                  {profile.role === "investor" ? "Search for a startup by company name or founder" : "Search for an investor by name or firm"}
                </p>
              </div>
              <button onClick={closeNewModal} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* To field */}
              <div>
                <span style={labelStyle}>To</span>
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
                        placeholder={profile.role === "investor" ? "Search startups by name or founder…" : "Search investors by name or firm…"}
                        autoFocus
                        style={{ width: "100%", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", paddingLeft: "30px", paddingRight: "12px", paddingTop: "9px", paddingBottom: "9px", outline: "none", boxSizing: "border-box" }} />
                    </>
                  )}

                  {/* Dropdown */}
                  {!selectedAccount && accountDropOpen && (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "4px", zIndex: 10, maxHeight: "220px", overflowY: "auto" }}>
                      {accountSearching ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", gap: "8px", color: "var(--cr-ink-4)" }}>
                          <Loader2 style={{ width: 14, height: 14 }} /> <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px" }}>Searching…</span>
                        </div>
                      ) : !accountSearch.trim() ? (
                        <p style={{ padding: "16px 12px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>
                          Start typing to search {profile.role === "investor" ? "startups" : "investors"}
                        </p>
                      ) : accountResults.length === 0 ? (
                        <p style={{ padding: "16px 12px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>No results found</p>
                      ) : accountResults.map(a => (
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
                <span style={labelStyle}>Message</span>
                <textarea value={newBody} onChange={e => setNewBody(e.target.value)}
                  placeholder={selectedAccount ? `Message ${selectedAccount.entity_name || selectedAccount.full_name || selectedAccount.email}…` : "Select a recipient above, then write your message…"}
                  rows={5} disabled={!selectedAccount}
                  style={{ width: "100%", background: selectedAccount ? "var(--cr-paper-3)" : "var(--cr-paper-4)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "10px 12px", resize: "none", outline: "none", boxSizing: "border-box", opacity: selectedAccount ? 1 : 0.5 }}
                  onFocus={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
                  onBlur={e   => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}
                />
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={closeNewModal}
                  style={{ flex: 1, height: "44px", background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={sendNewMessage} disabled={!selectedAccount || !newBody.trim() || sendingNew}
                  style={{ flex: 1, height: "44px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", opacity: !selectedAccount || !newBody.trim() || sendingNew ? 0.5 : 1 }}>
                  {sendingNew ? <><Loader2 style={{ width: 14, height: 14 }} /> Sending…</> : <><Send style={{ width: 14, height: 14 }} /> Send Message</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
