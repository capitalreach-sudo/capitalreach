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
import { ArrowLeft, Save, Trash2, Shield, Bell, CreditCard } from "lucide-react";
import Link from "next/link";
import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types";

export default function AccountSettingsPage() {
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
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
      setProfile(prev => prev ? { ...prev, full_name: fullName, avatar_url: avatarUrl } : prev);
    }
    setSaving(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Password update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated successfully" });
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

  if (loading) return <><Navbar /><div className="flex items-center justify-center h-64 text-cr-i4">Loading…</div></>;

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href={dashboardPath}>
            <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Back</Button>
          </Link>
          <h1 className="text-2xl font-bold text-cr-ink">Account Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Profile section */}
          <section className="bg-cr-paper border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Shield className="h-4 w-4 text-cr-copper" />
              <h2 className="font-semibold text-cr-ink">Profile</h2>
            </div>

            <div className="flex items-center gap-4 mb-5">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="bg-cr-copper/15 text-cr-cu-l text-xl">
                  {getInitials(fullName || profile?.email || "")}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-cr-ink">{profile?.full_name || "No name set"}</p>
                <p className="text-sm text-cr-i3">{profile?.email}</p>
                <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-cr-copper/15 text-cr-cu-l capitalize">
                  {profile?.role}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="space-y-1.5">
                <Label>Avatar URL</Label>
                <Input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://…" />
                <p className="text-xs text-cr-i4">Paste a direct image URL, or use a service like Gravatar</p>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={profile?.email || ""} disabled className="bg-cr-p2 text-cr-i3" />
                <p className="text-xs text-cr-i4">Email changes require contacting support</p>
              </div>
              <Button type="submit" className="gap-2" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </form>
          </section>

          {/* Password section */}
          <section className="bg-cr-paper border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Shield className="h-4 w-4 text-cr-copper" />
              <h2 className="font-semibold text-cr-ink">Change Password</h2>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </div>
              <Button type="submit" variant="outline" className="gap-2" disabled={savingPassword || newPassword.length < 8}>
                {savingPassword ? "Updating…" : "Update Password"}
              </Button>
            </form>
          </section>

          {/* Billing section */}
          <section className="bg-cr-paper border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-4 w-4 text-cr-copper" />
              <h2 className="font-semibold text-cr-ink">Billing & Subscription</h2>
            </div>
            <p className="text-sm text-cr-i3 mb-4">
              Manage your subscription, update your payment method, or download invoices through the Stripe Customer Portal.
            </p>
            <Button variant="outline" onClick={handlePortal} className="gap-2">
              <CreditCard className="h-4 w-4" />
              Open Billing Portal
            </Button>
          </section>

          {/* Notifications section */}
          <section className="bg-cr-paper border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-4 w-4 text-cr-copper" />
              <h2 className="font-semibold text-cr-ink">Email Notifications</h2>
            </div>
            <p className="text-sm text-cr-i3">
              All transactional emails (messages, deal updates, NDA completions) are sent to <strong>{profile?.email}</strong>. Manage marketing preferences in your inbox or contact support.
            </p>
          </section>

          {/* Danger zone */}
          <section className="bg-cr-paper border border-red-100 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 className="h-4 w-4 text-red-500" />
              <h2 className="font-semibold text-red-400">Danger Zone</h2>
            </div>
            <p className="text-sm text-cr-i3 mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            {!deletingAccount ? (
              <Button
                variant="outline"
                className="border-red-500/20 text-red-600 hover:bg-red-500/10 gap-2"
                onClick={() => setDeletingAccount(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete Account
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-red-400">
                  Are you sure? All your data, listings, and subscriptions will be permanently removed.
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
                          toast({ title: "Deletion failed", description: data.error, variant: "destructive" });
                          setDeleteLoading(false);
                          return;
                        }
                        // Sign out locally after server-side deletion
                        await supabase.auth.signOut();
                        toast({ title: "Account deleted", description: "Your account and all data have been permanently removed." });
                        router.push("/");
                      } catch {
                        toast({ title: "Network error", description: "Could not reach server. Please try again.", variant: "destructive" });
                        setDeleteLoading(false);
                      }
                    }}
                  >
                    {deleteLoading ? "Deleting…" : "Yes, permanently delete my account"}
                  </Button>
                  <Button variant="ghost" onClick={() => setDeletingAccount(false)} disabled={deleteLoading}>Cancel</Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
