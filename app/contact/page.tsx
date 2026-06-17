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

const SUBJECTS = [
  { value: "institutional", label: "Institutional / Enterprise Inquiry" },
  { value: "billing", label: "Billing & Subscriptions" },
  { value: "technical", label: "Technical Support" },
  { value: "partnership", label: "Partnership Opportunity" },
  { value: "general", label: "General Question" },
];

export default function ContactPage() {
  const searchParams = useSearchParams();
  const defaultType = searchParams.get("type") ?? "general";

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
          title: "Failed to send message",
          description: data.error || "Please email us directly at support@capitalreach.com",
          variant: "destructive",
        });
      } else {
        setSent(true);
      }
    } catch {
      toast({
        title: "Network error",
        description: "Could not reach the server. Please email us at support@capitalreach.com",
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
            <h1 className="text-3xl font-bold text-cr-ink mb-3">Get in Touch</h1>
            <p className="text-cr-i3 mb-8 text-sm">
              Whether you&apos;re a startup looking to raise, an investor deploying capital, or an enterprise exploring custom plans — we&apos;re here to help.
            </p>

            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-cr-copper/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-cr-copper/20">
                  <Mail className="h-4 w-4 text-cr-copper" />
                </div>
                <div>
                  <p className="font-medium text-cr-ink text-sm">Email Us</p>
                  <a href="mailto:support@capitalreach.com" className="text-sm text-cr-copper hover:text-cr-cu-l transition-colors">support@capitalreach.com</a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-cr-copper/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-cr-copper/20">
                  <MessageSquare className="h-4 w-4 text-cr-copper" />
                </div>
                <div>
                  <p className="font-medium text-cr-ink text-sm">Response Time</p>
                  <p className="text-sm text-cr-i3">We reply within 1 business day</p>
                </div>
              </div>

              {isInstitutional && (
                <div className="bg-cr-copper/5 border border-cr-copper/15 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Building2 className="h-5 w-5 text-cr-copper flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-cr-ink text-sm mb-1">Enterprise & Institutional</p>
                      <p className="text-xs text-cr-i3">
                        Custom pricing available for family offices, VC funds, and corporate venture arms. Includes white-glove onboarding, API access, dedicated account management, and custom NDA templates.
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
                <h2 className="text-xl font-bold text-cr-ink mb-2">Message sent!</h2>
                <p className="text-cr-i3 text-sm">Thanks for reaching out, {name.split(" ")[0]}. We&apos;ll get back to you at <strong className="text-cr-i2">{email}</strong> within 1 business day.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-cr-paper border border-cr-p4 rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-cr-i2 text-sm">Full Name</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" required className="bg-cr-p2 border-cr-p4 text-cr-ink placeholder:text-cr-i4" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-cr-i2 text-sm">Email</Label>
                    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" required className="bg-cr-p2 border-cr-p4 text-cr-ink placeholder:text-cr-i4" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="company" className="text-cr-i2 text-sm">Company / Fund (optional)</Label>
                  <Input id="company" value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Ventures" className="bg-cr-p2 border-cr-p4 text-cr-ink placeholder:text-cr-i4" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-cr-i2 text-sm">Subject</Label>
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
                  <Label htmlFor="message" className="text-cr-i2 text-sm">Message</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className="h-32 bg-cr-p2 border-cr-p4 text-cr-ink placeholder:text-cr-i4"
                    placeholder={
                      isInstitutional
                        ? "Tell us about your fund size, AUM, and what you're looking for in a custom plan…"
                        : "How can we help you?"
                    }
                    required
                  />
                </div>

                <Button type="submit" className="w-full bg-cr-copper hover:bg-cr-cu-l text-white" disabled={loading}>
                  {loading ? "Sending…" : "Send Message"}
                </Button>

                <p className="text-xs text-cr-i4 text-center">
                  By submitting this form you agree to our{" "}
                  <a href="/privacy" className="text-cr-copper hover:underline">Privacy Policy</a>.
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
