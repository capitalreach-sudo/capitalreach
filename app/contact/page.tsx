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
import { Mail, MessageSquare, Building2, CheckCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

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
          description: data.error || t("contact.toastFailedDescFallback"),
          variant: "destructive",
        });
      } else {
        setSent(true);
      }
    } catch {
      toast({
        title: t("contact.toastNetworkErrorTitle"),
        description: t("contact.toastNetworkErrorDesc"),
        variant: "destructive",
      });
    }
    setLoading(false);
  }

  const isInstitutional = subject === "institutional";

  return (
    <div className="min-h-screen flex flex-col bg-base">
      <Navbar />
      <main className="container mx-auto px-4 py-16 max-w-5xl flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* Left column */}
          <div className="lg:col-span-2">
            <h1 className="text-3xl font-bold text-cr-ink mb-3">{t("contact.title")}</h1>
            <p className="text-cr-i3 mb-8 text-sm">
              {t("contact.subtitle")}
            </p>

            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-cr-copper/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-cr-copper/20">
                  <Mail className="h-4 w-4 text-cr-copper" />
                </div>
                <div>
                  <p className="font-medium text-cr-ink text-sm">{t("contact.emailUs")}</p>
                  <a href="mailto:support@capitalreach.com" className="text-sm text-cr-copper hover:text-cr-cu-l transition-colors">support@capitalreach.com</a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-cr-copper/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-cr-copper/20">
                  <MessageSquare className="h-4 w-4 text-cr-copper" />
                </div>
                <div>
                  <p className="font-medium text-cr-ink text-sm">{t("contact.responseTime")}</p>
                  <p className="text-sm text-cr-i3">{t("contact.responseTimeDesc")}</p>
                </div>
              </div>

              {isInstitutional && (
                <div className="bg-cr-copper/5 border border-cr-copper/15 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Building2 className="h-5 w-5 text-cr-copper flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-cr-ink text-sm mb-1">{t("contact.enterpriseTitle")}</p>
                      <p className="text-xs text-cr-i3">
                        {t("contact.enterpriseDesc")}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-3">
            {sent ? (
              <div className="bg-cr-paper border border-cr-p4 rounded-xl p-10 text-center">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                  <CheckCircle className="h-8 w-8 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-cr-ink mb-2">{t("contact.messageSentTitle")}</h2>
                <p className="text-cr-i3 text-sm">
                  {t("contact.messageSentDesc", { name: name.split(" ")[0] }).split("{email}")[0]}
                  <strong className="text-cr-i2">{email}</strong>
                  {t("contact.messageSentDesc", { name: name.split(" ")[0] }).split("{email}")[1]}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-cr-paper border border-cr-p4 rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-cr-i2 text-sm">{t("contact.fullName")}</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" required className="bg-cr-p2 border-cr-p4 text-cr-ink placeholder:text-cr-i4" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-cr-i2 text-sm">{t("contact.emailLabel")}</Label>
                    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" required className="bg-cr-p2 border-cr-p4 text-cr-ink placeholder:text-cr-i4" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="company" className="text-cr-i2 text-sm">{t("contact.companyLabel")}</Label>
                  <Input id="company" value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Ventures" className="bg-cr-p2 border-cr-p4 text-cr-ink placeholder:text-cr-i4" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-cr-i2 text-sm">{t("contact.subjectLabel")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {SUBJECTS.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setSubject(s.value)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          subject === s.value
                            ? "bg-cr-copper text-white border-cr-copper"
                            : "border-cr-p4 text-cr-i3 hover:border-cr-i4 hover:text-cr-i2"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="message" className="text-cr-i2 text-sm">{t("contact.messageLabel")}</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className="h-32 bg-cr-p2 border-cr-p4 text-cr-ink placeholder:text-cr-i4"
                    placeholder={
                      isInstitutional
                        ? t("contact.messagePlaceholderInstitutional")
                        : t("contact.messagePlaceholderGeneral")
                    }
                    required
                  />
                </div>

                <Button type="submit" className="w-full bg-cr-copper hover:bg-cr-cu-l text-white" disabled={loading}>
                  {loading ? t("contact.sending") : t("contact.sendMessage")}
                </Button>

                <p className="text-xs text-cr-i4 text-center">
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
