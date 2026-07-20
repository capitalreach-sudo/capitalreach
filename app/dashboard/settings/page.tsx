"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, Save, Trash2, Shield, Bell, CreditCard, Globe } from "lucide-react";
import { LanguageSettingsSelector } from "@/components/ui/LanguageSettingsSelector";
import Link from "next/link";
import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

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

  async function handlePortal() {
    const res = await fetch("/api/checkout/portal", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
  }

  const dashboardPath = profile?.role === "startup" ? "/dashboard/startup" : "/dashboard/investor";

  if (loading) return <><Navbar /><div className="flex items-center justify-center h-64 text-cr-i4">{t("common.loading")}</div></>;

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href={dashboardPath}>
            <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Button>
          </Link>
          <h1 className="text-2xl font-bold text-cr-ink">{t("settings.pageTitle")}</h1>
        </div>

        <div className="space-y-6">
          {/* Profile section */}
          <section className="bg-cr-paper border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Shield className="h-4 w-4 text-cr-copper" />
              <h2 className="font-semibold text-cr-ink">{t("settings.profile")}</h2>
            </div>

            <div className="flex items-center gap-4 mb-5">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="bg-cr-copper/15 text-cr-cu-l text-xl">
                  {getInitials(fullName || profile?.email || "")}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-cr-ink">{profile?.full_name || t("settings.noNameSet")}</p>
                <p className="text-sm text-cr-i3">{profile?.email}</p>
                <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-cr-copper/15 text-cr-cu-l capitalize">
                  {profile?.role}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("settings.fullName")}</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t("settings.yourName")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("settings.avatarUrl")}</Label>
                <Input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://…" />
                <p className="text-xs text-cr-i4">{t("settings.avatarHint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("settings.email")}</Label>
                <Input value={profile?.email || ""} disabled className="bg-cr-p2 text-cr-i3" />
                <p className="text-xs text-cr-i4">{t("settings.emailHint")}</p>
              </div>
              <Button type="submit" className="gap-2" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? t("settings.saving2") : t("settings.saveChanges")}
              </Button>
            </form>
          </section>

          {/* Password section */}
          <section className="bg-cr-paper border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Shield className="h-4 w-4 text-cr-copper" />
              <h2 className="font-semibold text-cr-ink">{t("settings.changePassword")}</h2>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("settings.newPassword")}</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder={t("settings.passwordMinLength")}
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("settings.confirmPassword")}</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder={t("settings.reEnterPassword")}
                />
              </div>
              <Button type="submit" variant="outline" className="gap-2" disabled={savingPassword || newPassword.length < 8}>
                {savingPassword ? t("settings.updating") : t("settings.updatePassword")}
              </Button>
            </form>
          </section>

          {/* Billing section */}
          <section className="bg-cr-paper border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-4 w-4 text-cr-copper" />
              <h2 className="font-semibold text-cr-ink">{t("settings.billing")}</h2>
            </div>
            <p className="text-sm text-cr-i3 mb-4">
              {t("settings.billingDesc")}
            </p>
            <Button variant="outline" onClick={handlePortal} className="gap-2">
              <CreditCard className="h-4 w-4" />
              {t("settings.openBillingPortal")}
            </Button>
          </section>

          {/* Notifications section */}
          <section className="bg-cr-paper border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-4 w-4 text-cr-copper" />
              <h2 className="font-semibold text-cr-ink">{t("settings.notifications")}</h2>
            </div>
            <p className="text-sm text-cr-i3">
              {t("settings.notificationsDesc")} <strong>{profile?.email}</strong>.
            </p>
          </section>

          {/* Language section */}
          <section className="bg-cr-paper border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-cr-copper" />
              <h2 className="font-semibold text-cr-ink">{t("settings.language")}</h2>
            </div>
            <p className="text-sm text-cr-i3 mb-4">
              {t("settings.languageDesc")}
            </p>
            <LanguageSettingsSelector />
          </section>

          {/* Danger zone */}
          <section className="bg-cr-paper border border-red-100 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 className="h-4 w-4 text-red-500" />
              <h2 className="font-semibold text-red-400">{t("settings.dangerZone")}</h2>
            </div>
            <p className="text-sm text-cr-i3 mb-4">
              {t("settings.dangerZoneDesc")}
            </p>
            {!deletingAccount ? (
              <Button
                variant="outline"
                className="border-red-500/20 text-red-600 hover:bg-red-500/10 gap-2"
                onClick={() => setDeletingAccount(true)}
              >
                <Trash2 className="h-4 w-4" />
                {t("settings.deleteAccount")}
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-red-400">
                  {t("settings.deleteConfirm")}
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="border-red-500/20 text-red-600 hover:bg-red-500/10"
                    disabled={deleteLoading}
                    onClick={async () => {
                      setDeleteLoading(true);
                      try {
                        const res = await fetch("/api/account/delete", { method: "DELETE" });
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
                  <Button variant="ghost" onClick={() => setDeletingAccount(false)} disabled={deleteLoading}>{t("common.cancel")}</Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
