"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, Upload, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";

const DOC_TYPES = [
  { value: "pitch_deck",      labelKey: "dashboard.docPitchDeck" },
  { value: "financial_model", labelKey: "dashboard.docFinModel"  },
  { value: "cap_table",       labelKey: "dashboard.docCapTable"  },
  { value: "other",           labelKey: "dashboard.docOther"     },
];

// ── House register: shared presentation constants ─────────────

const MONO: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontVariantNumeric: "tabular-nums",
};

const BODY: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 300,
};

const LABEL_TYPE: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 500,
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
};

const CARD: React.CSSProperties = {
  background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
};

const BTN_OUTLINE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  padding: "0 16px",
  borderRadius: "999px",
  background: "transparent",
  border: "1px solid var(--cr-paper-4)",
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 500,
  fontSize: "13px",
  color: "var(--cr-ink)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

// Per-row quiet action: a full 40px round target, hairline outline,
// icon inside -- never a bare 16px glyph.
const ICON_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "40px",
  height: "40px",
  borderRadius: "999px",
  background: "transparent",
  border: "1px solid var(--cr-paper-4)",
  cursor: "pointer",
  flexShrink: 0,
};

const FIELD_LABEL = "mb-2 block text-[11px] font-medium uppercase tracking-[0.07em] text-cr-i3";

/**
 * C28: outstanding document requests. A request used to be a bell and
 * nothing else; now the founder sees exactly what is being waited on, from
 * whom, and can mark it declined (uploading the type fulfils it
 * automatically — see /api/upload).
 */
function OutstandingRequests() {
  const { t } = useTranslation();
  const { toast } = useToast();
  type Req = { id: string; doc_type: string; message: string | null; status: string; created_at: string; investor: { slug: string; display_name: string | null; firm_name: string | null } | null };
  const [reqs, setReqs] = useState<Req[] | null>(null);
  useEffect(() => {
    fetch("/api/documents/request").then(r => r.ok ? r.json() : null).then(j => setReqs(j?.requests ?? [])).catch(() => setReqs([]));
  }, []);
  const open = (reqs ?? []).filter(r => r.status === "open");
  if (!reqs || open.length === 0) return null;
  const LABEL: Record<string, string> = { pitch_deck: "dashboard.docPitchDeck", financial_model: "dashboard.docFinModel", cap_table: "dashboard.docCapTable", other: "dashboard.docOther" };
  async function resolve(id: string, status: "declined") {
    const res = await fetch("/api/documents/request", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (!res.ok) { toast({ title: t("errors.generic"), variant: "destructive" }); return; }
    setReqs(prev => (prev ?? []).map(r => r.id === id ? { ...r, status } : r));
  }
  return (
    <section style={{ marginBottom: "24px" }}>
      <div className="ruled-label" style={{ marginBottom: "8px" }}>{t("docReq.outstandingTitle", { count: open.length })}</div>
      <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", lineHeight: 1.6, marginBottom: "12px" }}>{t("docReq.outstandingHint")}</p>
      {/* One flat card; requests separated by hairline rules, not boxes. The
          copper hairline border marks it as the thing being waited on. */}
      <div style={{ ...CARD, borderColor: "var(--cr-copper-br)" }}>
        {open.map((r, reqIdx) => (
          <div key={r.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "14px 20px", borderTop: reqIdx > 0 ? "1px solid var(--cr-rule)" : "none" }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", margin: 0 }}>{t(LABEL[r.doc_type] ?? "dashboard.docOther")}</p>
              <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "3px" }}>
                {r.investor
                  ? <Link href={`/investors/${r.investor.slug}`} style={{ color: "var(--cr-copper)", textDecoration: "none" }}>{r.investor.display_name || r.investor.firm_name || t("deals.investorFallback")}</Link>
                  : t("deals.investorFallback")}
                {" · "}<span style={{ ...MONO, fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)" }}>{new Date(r.created_at).toLocaleDateString()}</span>
              </p>
              {r.message && <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5, marginTop: "6px" }}>“{r.message}”</p>}
            </div>
            <button onClick={() => resolve(r.id, "declined")} style={{ ...BTN_OUTLINE, flexShrink: 0 }}>
              {t("docReq.decline")}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DocumentsPage() {
  const { t } = useTranslation();
  const [startup, setStartup] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docType, setDocType] = useState("pitch_deck");
  const [docLabel, setDocLabel] = useState("");
  const [requiresNda, setRequiresNda] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const { data: s } = await supabase.from("startups").select("id, name, subscription_tier").eq("owner_id", user.id).single();
      if (!s) {
        // No listing on this account. Only a genuine startup-role user belongs
        // in the create-a-listing wizard; an admin poking around (or anyone
        // else) was being dumped into onboarding, which read as the page being
        // broken. Route by role instead.
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        router.push(prof?.role === "admin" ? "/admin" : prof?.role === "investor" ? "/dashboard/investor" : "/onboarding/startup");
        return;
      }
      setStartup(s);
      const { data: docs } = await supabase.from("startup_documents").select("*").eq("startup_id", s.id);
      setDocuments(docs || []);
      setDocsLoading(false);
    })();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !startup) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("startupId", startup.id);
    formData.append("type", docType);
    formData.append("label", docLabel || file.name);
    formData.append("requiresNda", String(requiresNda));

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast({ title: t("dashboard.uploadFailed"), description: data.error, variant: "destructive" });
      } else {
        toast({ title: t("dashboard.docUploaded") });
        setDocuments(prev => [...prev, data.document]);
        if (fileRef.current) fileRef.current.value = "";
        setDocLabel("");
      }
    } catch {
      toast({ title: t("dashboard.uploadFailed"), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(docId: string) {
    const { error } = await supabase.from("startup_documents").delete().eq("id", docId);
    if (error) {
      toast({ title: t("errors.generic"), variant: "destructive" });
      return;
    }
    setDocuments(prev => prev.filter(d => d.id !== docId));
    toast({ title: t("dashboard.docRemoved") });
  }

  const isLimitedPlan = startup?.subscription_tier === "starter";
  const atLimit = isLimitedPlan && documents.length >= 3;

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "100vh", paddingBottom: "64px" }}>
        <div style={{ maxWidth: "672px", margin: "0 auto", padding: "40px 24px" }}>

          {/* Back + Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
            <Link href="/dashboard/startup" style={{ display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "40px", ...BODY, fontSize: "13px", color: "var(--cr-ink-4)", textDecoration: "none" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-4)")}>
              <ArrowLeft style={{ width: 14, height: 14 }} /> {t("common.back")}
            </Link>
            <div style={{ width: 1, height: 14, background: "var(--cr-rule-dark)" }} aria-hidden />
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "24px", color: "var(--cr-ink)", letterSpacing: "-0.02em" }}>
              {t("dashboard.docManager")}
            </h1>
          </div>

          <OutstandingRequests />

          {isLimitedPlan && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "12px 16px", marginBottom: "24px" }}>
              <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink)", lineHeight: 1.5, margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                <span aria-hidden style={{ color: "var(--cr-copper)", flexShrink: 0, lineHeight: 1 }}>✦</span>
                {t("dashboard.docLimitBanner", { count: documents.length })}
              </p>
              <Link href="/pricing" style={{ ...BTN_OUTLINE, textDecoration: "none" }}>{t("common.upgrade")}</Link>
            </div>
          )}

          {/* Upload form */}
          {!atLimit && (
            <section style={{ marginBottom: "32px" }}>
              <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("dashboard.uploadDocument")}</div>
              <form onSubmit={handleUpload} style={{ ...CARD, padding: "20px" }}>
                <div style={{ marginBottom: "16px" }}>
                  <Label className={FIELD_LABEL}>{t("dashboard.docType")}</Label>
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DOC_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{t(d.labelKey)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <Label className={FIELD_LABEL}>{t("dashboard.docLabelOptional")}</Label>
                  <Input value={docLabel} onChange={e => setDocLabel(e.target.value)} placeholder="Pitch Deck v3 — June 2026" />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <Label className={FIELD_LABEL}>{t("dashboard.docFile")}</Label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.xlsx,.xls,.mp4"
                    className="block w-full max-w-full cursor-pointer text-sm text-cr-i3 file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-solid file:border-cr-p4 file:bg-transparent file:px-4 file:py-2.5 file:text-[13px] file:font-medium file:text-cr-ink hover:file:bg-cr-p2"
                    required
                  />
                  <p className="mt-1 text-xs text-cr-i4">{t("dashboard.docFormats")}</p>
                </div>
                {/* NDA toggle: a rule-separated row inside the card, not a
                    tinted box-in-box. */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderTop: "1px solid var(--cr-rule)", padding: "14px 0", marginTop: "20px" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", margin: 0 }}>{t("dashboard.requireNda")}</p>
                    <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-3)", marginTop: "2px", lineHeight: 1.5 }}>{t("dashboard.requireNdaSub")}</p>
                  </div>
                  <Switch checked={requiresNda} onCheckedChange={setRequiresNda} />
                </div>
                {/* The one primary action on this view. */}
                <button
                  type="submit"
                  disabled={uploading}
                  className="btn-copper-shimmer inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border-0 bg-cr-copper text-[13px] font-semibold text-white hover:bg-cr-cu-d disabled:opacity-60"
                  style={{ fontFamily: "'DM Sans', sans-serif", cursor: uploading ? "default" : "pointer" }}
                >
                  <Upload style={{ width: 14, height: 14 }} aria-hidden />
                  {uploading ? t("dashboard.uploading") : t("dashboard.uploadDocument")}
                </button>
              </form>
            </section>
          )}

          {/* Document list */}
          <section>
            <div className="ruled-label" style={{ marginBottom: "12px" }}>
              {t("dashboard.uploadedDocuments")}
              <span style={{ ...MONO, fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)" }}>({documents.length})</span>
            </div>
            <div style={CARD}>
              {docsLoading ? null : documents.length === 0 ? (
                <div style={{ padding: "48px 24px", textAlign: "center" }}>
                  <span aria-hidden style={{ display: "block", color: "var(--cr-copper)", fontSize: "14px", lineHeight: 1, marginBottom: "12px" }}>✦</span>
                  <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-4)", margin: 0 }}>{t("startupDetail.noDocumentsUploaded")}</p>
                </div>
              ) : (
                <div>
                  {documents.map((doc, docIdx) => (
                    <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 20px", borderTop: docIdx > 0 ? "1px solid var(--cr-rule)" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
                        <span aria-hidden style={{ ...MONO, fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", flexShrink: 0 }}>
                          {String(docIdx + 1).padStart(2, "0")}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.label}</p>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "3px" }}>
                            <span style={{ ...LABEL_TYPE, color: "var(--cr-ink-4)" }}>{doc.type.replace(/_/g, " ")}</span>
                            {doc.requires_nda && (
                              <span style={{ ...LABEL_TYPE, color: "var(--cr-copper)", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "3px", padding: "2px 6px" }}>
                                {t("dashboard.ndaRequired")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                        <a href={`/api/documents/open?id=${doc.id}`} target="_blank" rel="noopener noreferrer" aria-label={t("common.open")} className="text-cr-copper hover:bg-cr-p2" style={{ ...ICON_BTN, textDecoration: "none" }}>
                          <ExternalLink style={{ width: 16, height: 16 }} />
                        </a>
                        <button onClick={() => deleteDocument(doc.id)} aria-label={t("common.delete")} className="text-cr-i4 hover:bg-cr-p2 hover:text-destructive" style={ICON_BTN}>
                          <Trash2 style={{ width: 16, height: 16 }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
