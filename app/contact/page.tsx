"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { brand } from "@/lib/brand";

// House Label type for the rule-separated contact rows.
const ROW_LABEL: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px",
  color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em",
  marginBottom: "4px",
};

const ROW_BODY: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
  color: "var(--cr-ink-3)", lineHeight: 1.65,
};

// Form field label -- Label type, overriding the ui/label defaults.
const FIELD_LABEL = "mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-cr-i3";

const FIELD_INPUT = "rounded-[var(--radius)] bg-cr-p2 border-cr-p4 text-cr-ink placeholder:text-cr-i4";

export default function ContactPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const defaultType = searchParams.get("type") ?? "general";

  const SUBJECTS = [
    { value: "institutional", label: t("contact.subjInstitutional") },
    { value: "billing", label: t("contact.subjBilling") },
    { value: "technical", label: t("contact.subjTechnical") },
    { value: "partnership", label: t("contact.subjPartnership") },
    { value: "general", label: t("contact.subjGeneral") },
  ];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(defaultType);
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, company }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: t("contact.toastFailedTitle"),
          description: data.error || t("contact.toastFailedDescFallback", { email: brand.support }),
          variant: "destructive",
        });
      } else {
        setSent(true);
      }
    } catch {
      toast({
        title: t("contact.toastNetworkErrorTitle"),
        description: t("contact.toastNetworkErrorDesc", { email: brand.support }),
        variant: "destructive",
      });
    }
    setLoading(false);
  }

  const isInstitutional = subject === "institutional";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--cr-paper)" }}>
      <Navbar />
      <main className="container mx-auto px-4 py-16 max-w-5xl flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* Left column */}
          <div className="lg:col-span-2">
            <div className="ruled-label" style={{ marginBottom: "16px" }}>{brand.name}</div>
            <h1
              style={{
                fontFamily:    "'Playfair Display', Georgia, serif",
                fontWeight:    700,
                fontStyle:     "italic",
                fontSize:      "clamp(30px, 4.5vw, 42px)",
                color:         "var(--cr-ink)",
                lineHeight:    1.08,
                letterSpacing: "-0.02em",
                textWrap:      "balance",
              }}
            >
              {t("contact.title")}
            </h1>
            <p style={{ ...ROW_BODY, fontSize: "14px", marginTop: "12px" }}>
              {t("contact.subtitle")}
            </p>

            {/* Contact facts as ledger rows -- rules, not chips. */}
            <div style={{ marginTop: "32px", borderBottom: "1px solid var(--cr-rule)" }}>
              <div style={{ borderTop: "1px solid var(--cr-rule)", padding: "16px 0" }}>
                <p style={ROW_LABEL}>{t("contact.emailUs")}</p>
                <a
                  href={`mailto:${brand.support}`}
                  className="text-cr-copper hover:text-cr-cu-l transition-colors"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px", textDecoration: "none" }}
                >
                  {brand.support}
                </a>
              </div>

              <div style={{ borderTop: "1px solid var(--cr-rule)", padding: "16px 0" }}>
                <p style={ROW_LABEL}>{t("contact.responseTime")}</p>
                <p style={ROW_BODY}>{t("contact.responseTimeDesc")}</p>
              </div>

              {isInstitutional && (
                <div style={{ borderTop: "1px solid var(--cr-rule)", padding: "16px 0" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span aria-hidden style={{ color: "var(--cr-copper)" }}>✦</span>
                    {t("contact.enterpriseTitle")}
                  </p>
                  <p style={ROW_BODY}>{t("contact.enterpriseDesc")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-3">
            {sent ? (
              <div
                className="p-8 text-center"
                style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule)", borderRadius: "var(--radius)", boxShadow: "var(--cr-card-shadow)" }}
              >
                <span aria-hidden style={{ display: "block", color: "var(--cr-copper)", fontSize: "22px", lineHeight: 1, marginBottom: "16px" }}>✦</span>
                <h2
                  style={{
                    fontFamily:    "'Playfair Display', Georgia, serif",
                    fontWeight:    700,
                    fontStyle:     "italic",
                    fontSize:      "clamp(22px, 3vw, 28px)",
                    color:         "var(--cr-ink)",
                    letterSpacing: "-0.01em",
                    marginBottom:  "8px",
                  }}
                >
                  {t("contact.messageSentTitle")}
                </h2>
                <p style={{ ...ROW_BODY, fontSize: "14px" }}>
                  {t("contact.messageSentDesc", { name: name.split(" ")[0] }).split("{email}")[0]}
                  <strong className="text-cr-i2" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px" }}>{email}</strong>
                  {t("contact.messageSentDesc", { name: name.split(" ")[0] }).split("{email}")[1]}
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="p-6 space-y-4"
                style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule)", borderRadius: "var(--radius)", boxShadow: "var(--cr-card-shadow)" }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className={FIELD_LABEL}>{t("contact.fullName")}</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" required className={FIELD_INPUT} />
                  </div>
                  <div>
                    <Label htmlFor="email" className={FIELD_LABEL}>{t("contact.emailLabel")}</Label>
                    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" required className={FIELD_INPUT} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="company" className={FIELD_LABEL}>{t("contact.companyLabel")}</Label>
                  <Input id="company" value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Ventures" className={FIELD_INPUT} />
                </div>

                <div>
                  <Label className={FIELD_LABEL}>{t("contact.subjectLabel")}</Label>
                  <div className="flex flex-wrap gap-3">
                    {SUBJECTS.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setSubject(s.value)}
                        className={`min-h-[40px] px-3 rounded-[3px] border text-[11px] font-medium uppercase tracking-[0.06em] transition-colors ${
                          subject === s.value
                            ? "bg-[var(--cr-copper-bg)] border-[var(--cr-copper-br)] text-cr-copper"
                            : "border-cr-p4 text-cr-i3 hover:border-cr-i4 hover:text-cr-i2"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="message" className={FIELD_LABEL}>{t("contact.messageLabel")}</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className={`h-32 ${FIELD_INPUT}`}
                    placeholder={
                      isInstitutional
                        ? t("contact.messagePlaceholderInstitutional")
                        : t("contact.messagePlaceholderGeneral")
                    }
                    required
                  />
                </div>

                {/* The one primary action on this view; token-driven Button default. */}
                <Button type="submit" className="w-full text-[13px] font-semibold" disabled={loading}>
                  {loading ? t("contact.sending") : t("contact.sendMessage")}
                </Button>

                <p className="text-center" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                  {t("contact.agreeToPrivacy")}{" "}
                  <a href="/privacy" className="text-cr-copper hover:underline">{t("auth.privacy")}</a>.
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
