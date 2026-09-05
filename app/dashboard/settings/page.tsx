"use client";

import { useEffect, useState, useRef } from "react";
import { LedgerLoader } from "@/components/ui/LedgerLoader";
import { isPasswordBreached } from "@/lib/password-check";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, Save } from "lucide-react";
import { LanguageSettingsSelector } from "@/components/ui/LanguageSettingsSelector";
import Link from "next/link";
import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { TwoFactorSection } from "@/components/settings/two-factor";
import { SecurityActivity } from "@/components/settings/security-activity";

// ── House register ─────────────────────────────────────────────────────────
// One section treatment for the whole page: a paper-2 slab with a hairline
// border at 4px radius. Inside a card, structure is rules, never nested
// boxes. Section openers are ruled labels; field labels use the Label style.
const CARD: React.CSSProperties = {
  background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
};
const FIELD_LABEL = "text-[11px] font-medium uppercase tracking-[0.07em] text-cr-i3";

const NOTIF_GROUPS: Array<{ labelKey: string; types: string[] }> = [
  { labelKey: "settings.ngDeals",    types: ["deal_opened", "deal_stage", "deal_closed", "deal_passed", "follow_up_due", "contract_status", "nda_signed"] },
  { labelKey: "settings.ngInterest", types: ["listing_saved", "listing_update", "search_match", "deal_shared"] },
  { labelKey: "settings.ngQa",       types: ["question_asked", "question_answered", "doc_request"] },
  { labelKey: "settings.ngAccount",  types: ["listing_approved", "listing_rejected", "team_added", "tier_changed"] },
];

/**
 * Mute whole groups of notification kinds. Stored as the flat type list on
 * the profile (migration 040) and enforced inside notifyUser, so every
 * raiser inherits the preference. Messages stay unmutable -- a platform
 * where you can silence counterparties mid-deal invites disputes.
 */
function NotificationPrefs({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const { t } = useTranslation();
  const [muted, setMuted] = useState<Set<string> | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from("profiles").select("muted_notification_types").eq("id", user.id).maybeSingle();
      setMuted(new Set(p?.muted_notification_types ?? []));
    })();
  }, [supabase]);

  async function toggleGroup(types: string[], mute: boolean) {
    const next = new Set(muted);
    for (const ty of types) { if (mute) next.add(ty); else next.delete(ty); }
    setMuted(next);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ muted_notification_types: Array.from(next) }).eq("id", user.id);
  }

  if (muted === null) return null;

  return (
    <div className="p-4 sm:p-6" style={CARD}>
      <h3 className="ruled-label" style={{ marginBottom: "8px" }}>{t("settings.notifPrefs")}</h3>
      <p className="mb-3 text-xs font-light leading-relaxed text-cr-i3">{t("settings.notifPrefsSub")}</p>
      <div className="flex flex-col">
        {NOTIF_GROUPS.map((g) => {
          const allMuted = g.types.every(ty => muted.has(ty));
          return (
            // Row height >= 40px keeps each checkbox a full touch target.
            <label key={g.labelKey} className="flex min-h-10 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={!allMuted} onChange={e => toggleGroup(g.types, !e.target.checked)} style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
              <span className={`text-[13px] font-light ${allMuted ? "text-cr-i4" : "text-cr-ink"}`}>{t(g.labelKey)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function AccountSettingsPage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteVerdict, setDeleteVerdict] = useState<{ mode: "erase" | "anonymise"; closedDeals: number; openFees: number } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (p) {
        setProfile(p);
        setFullName(p.full_name || "");
        setAvatarUrl(p.avatar_url || "");
      }
      setLoading(false);
    })();
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, avatar_url: avatarUrl })
      .eq("id", profile!.id);
    if (error) {
      toast({ title: t("settings.saveFailed"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("dashboard.profileUpdated") });
      setProfile(prev => prev ? { ...prev, full_name: fullName, avatar_url: avatarUrl } : prev);
    }
    setSaving(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: t("auth.passwordsNoMatch"), variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: t("errors.passwordTooShort"), variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    // Same breach gate as signup -- changing TO a breached password is the
    // same mistake at a worse time.
    const { breached } = await isPasswordBreached(newPassword);
    if (breached) {
      toast({ title: t("auth.passwordBreachedShort"), variant: "destructive" });
      setSavingPassword(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: t("settings.passwordUpdateFailed"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("settings.passwordUpdatedSuccess") });
      setNewPassword("");
      setConfirmPassword("");
    }
    setSavingPassword(false);
  }

  const [portalBusy, setPortalBusy] = useState(false);
  async function handlePortal() {
    if (portalBusy) return;
    setPortalBusy(true);
    try {
      const res = await fetch("/api/checkout/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      notify.error(data.error || t("errors.generic"));
    } catch {
      notify.error(t("errors.generic"));
    } finally { setPortalBusy(false); }
  }

  const dashboardPath = profile?.role === "startup" ? "/dashboard/startup" : "/dashboard/investor";

  if (loading) return <><Navbar /><div className="flex h-64 items-center justify-center"><LedgerLoader /></div></>;

  return (
    <>
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 py-8 md:py-12" style={{ background: "var(--cr-paper)" }}>
        <header className="mb-8 pb-6" style={{ borderBottom: "1px solid var(--cr-rule-dark)" }}>
          <div className="mb-4">
            <Link href={dashboardPath}>
              <Button variant="ghost" size="sm" className="-ml-2 h-10 gap-1.5"><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Button>
            </Link>
          </div>
          <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("settings.account")}</div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(28px, 4vw, 36px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--cr-ink)" }}>
            {t("settings.pageTitle")}
          </h1>
        </header>

        <div className="space-y-6">
          {/* Profile section */}
          <section className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "16px" }}>{t("settings.profile")}</h2>

            <div className="mb-5 flex items-center gap-4">
              <Avatar className="h-16 w-16 border border-cr-p4">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="bg-cr-p3 text-lg font-semibold text-cr-copper">
                  {getInitials(fullName || profile?.email || "")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-cr-ink">{profile?.full_name || t("settings.noNameSet")}</p>
                <p className="truncate text-sm font-light text-cr-i3">{profile?.email}</p>
                <span className="mt-1.5 inline-block rounded-[3px] border border-cr-p4 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.07em] text-cr-i3">
                  {profile?.role}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label className={FIELD_LABEL}>{t("settings.fullName")}</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t("settings.yourName")} />
              </div>
              <div className="space-y-1.5">
                <Label className={FIELD_LABEL}>{t("settings.avatarUrl")}</Label>
                <Input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://…" />
                <p className="text-xs font-light text-cr-i4">{t("settings.avatarHint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label className={FIELD_LABEL}>{t("settings.email")}</Label>
                <Input value={profile?.email || ""} disabled className="bg-cr-p3 text-cr-i3" />
                <p className="text-xs font-light text-cr-i4">{t("settings.emailHint")}</p>
              </div>
              {/* The one primary action on this view. */}
              <Button type="submit" className="h-10 gap-2 rounded-full bg-cr-copper px-5 text-[13px] font-semibold text-white hover:bg-cr-cu-d" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? t("settings.saving2") : t("settings.saveChanges")}
              </Button>
            </form>
          </section>

          {/* Two-factor authentication */}
          <section className="p-4 sm:p-6" style={CARD}>
            <TwoFactorSection />
          </section>

          {/* Sessions + sign-in history */}
          <section className="p-4 sm:p-6" style={CARD}>
            <SecurityActivity />
          </section>

          {/* Password section */}
          <section className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "16px" }}>{t("settings.changePassword")}</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label className={FIELD_LABEL}>{t("settings.newPassword")}</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder={t("settings.passwordMinLength")}
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={FIELD_LABEL}>{t("settings.confirmPassword")}</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder={t("settings.reEnterPassword")}
                />
              </div>
              <Button type="submit" variant="outline" className="h-10 rounded-full border-cr-p4 px-5 text-[13px] text-cr-ink" disabled={savingPassword || newPassword.length < 8}>
                {savingPassword ? t("settings.updating") : t("settings.updatePassword")}
              </Button>
            </form>
          </section>

          {/* Billing section */}
          <section className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "8px" }}>{t("settings.billing")}</h2>
            <p className="mb-4 text-sm font-light leading-relaxed text-cr-i3">
              {t("settings.billingDesc")}
            </p>
            <Button variant="outline" onClick={handlePortal} className="h-10 rounded-full border-cr-p4 px-5 text-[13px] text-cr-ink">
              {t("settings.openBillingPortal")}
            </Button>
          </section>

          {/* Notifications section */}
          <section className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "8px" }}>{t("settings.notifications")}</h2>
            <p className="text-sm font-light leading-relaxed text-cr-i3">
              {t("settings.notificationsDesc")} <strong className="font-medium text-cr-ink">{profile?.email}</strong>.
            </p>
          </section>

          {/* Language section */}
          <section className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "8px" }}>{t("settings.language")}</h2>
            <p className="mb-4 text-sm font-light leading-relaxed text-cr-i3">
              {t("settings.languageDesc")}
            </p>
            <LanguageSettingsSelector />
          </section>

          {/* Notification preferences (migration 040) */}
          <NotificationPrefs supabase={supabase} />

          {/* Data export (GDPR) */}
          <div className="p-4 sm:p-6" style={CARD}>
            <h3 className="ruled-label" style={{ marginBottom: "8px" }}>{t("settings.exportData")}</h3>
            <p className="mb-4 text-xs font-light leading-relaxed text-cr-i3">{t("settings.exportDataSub")}</p>
            <a href="/api/account/export" download
              className="inline-flex min-h-10 items-center rounded-full border border-cr-p4 px-5 text-[13px] font-medium text-cr-ink no-underline transition-colors hover:border-cr-i4">
              {t("settings.exportDownload")}
            </a>
          </div>

          {/* Danger zone -- same slab as every other section; the danger is
              carried by the --cr-down tokens on the text and controls, not by
              a second design system. */}
          <section className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "8px" }}>{t("settings.dangerZone")}</h2>
            <p className="mb-4 text-sm font-light leading-relaxed text-cr-i3">
              {t("settings.dangerZoneDesc")}
            </p>
            {!deletingAccount ? (
              <Button
                variant="outline"
                className="h-10 rounded-full border-cr-down px-5 text-[13px] text-cr-down hover:bg-[var(--cr-down-bg)] hover:text-cr-down"
                onClick={async () => {
                  setDeletingAccount(true);
                  // E49: ask the server what deleting would actually do before
                  // the user confirms it. For an account with closed deals the
                  // answer is "anonymised, not erased", and that is not a
                  // detail to discover afterwards.
                  const res = await fetch("/api/account/delete");
                  if (res.ok) setDeleteVerdict(await res.json());
                }}
              >
                {t("settings.deleteAccount")}
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-cr-down">
                  {t("settings.deleteConfirm")}
                </p>
                {deleteVerdict && (
                  // A rule, not a nested box: the verdict separates from the
                  // confirm line with a hairline. The deal/fee counts are
                  // data, so the line renders in mono.
                  <div className="space-y-1 pt-3" style={{ borderTop: "1px solid var(--cr-rule)" }}>
                    <p className="text-sm font-light text-cr-i3">{deleteVerdict.mode === "anonymise" ? t("deleteAccount.willAnonymise") : t("deleteAccount.willErase")}</p>
                    {deleteVerdict.mode === "anonymise" && (
                      <p className="font-mono text-xs font-medium text-cr-i4">
                        {deleteVerdict.closedDeals > 0 && t("deleteAccount.closedDeals", { count: deleteVerdict.closedDeals })}
                        {deleteVerdict.closedDeals > 0 && deleteVerdict.openFees > 0 && " · "}
                        {deleteVerdict.openFees > 0 && t("deleteAccount.openFees", { count: deleteVerdict.openFees })}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-cr-down px-5 text-[13px] text-cr-down hover:bg-[var(--cr-down-bg)] hover:text-cr-down"
                    disabled={deleteLoading}
                    onClick={async () => {
                      setDeleteLoading(true);
                      try {
                        const res = await fetch("/api/account/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });
                        const data = await res.json();
                        if (!res.ok) {
                          toast({ title: t("settings.deletionFailed"), description: data.error, variant: "destructive" });
                          setDeleteLoading(false);
                          return;
                        }
                        // Sign out locally after server-side deletion
                        await supabase.auth.signOut();
                        toast({ title: t("settings.accountDeleted"), description: t("settings.accountDeletedDesc") });
                        router.push("/");
                      } catch {
                        toast({ title: t("settings.networkError"), description: t("settings.networkErrorDesc"), variant: "destructive" });
                        setDeleteLoading(false);
                      }
                    }}
                  >
                    {deleteLoading ? t("settings.deletingAccount") : t("settings.deletePermanently")}
                  </Button>
                  <Button variant="ghost" className="h-10 rounded-full px-4 text-[13px]" onClick={() => setDeletingAccount(false)} disabled={deleteLoading}>{t("common.cancel")}</Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
