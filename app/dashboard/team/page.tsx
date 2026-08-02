"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, UserPlus, Trash2, Users, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notify } from "@/components/ui/toast-notify";
import { getInitials } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

type EntityType = "startup" | "investor";

interface Member {
  id: string | null;
  userId: string;
  role: "owner" | "admin" | "member";
  name: string | null;
  email: string | null;
  canRemove: boolean;
}

export default function TeamPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const supabase = createClient();

  const [type, setType] = useState<EntityType | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async (entityType: EntityType) => {
    const res = await fetch(`/api/team?type=${entityType}`);
    const data = await res.json();
    if (!res.ok) { notify.error(data.error || t("errors.generic")); return; }
    setMembers(data.members ?? []);
    setMyRole(data.myRole);
    setEntityId(data.entityId);
  }, [t]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login?redirect=/dashboard/team"); return; }

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).maybeSingle();

      // The API is keyed on entity type, and a person is one or the other here.
      const entityType: EntityType = profile?.role === "startup" ? "startup" : "investor";
      setType(entityType);
      await load(entityType);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return;
    setInviting(true);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, email, role: inviteRole }),
    });
    const data = await res.json();
    setInviting(false);
    if (!res.ok) { notify.error(data.error || t("errors.generic")); return; }
    notify.success(t("team.added"));
    setEmail("");
    load(type);
  }

  async function remove(memberId: string) {
    if (!type) return;
    const res = await fetch("/api/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, memberId }),
    });
    const data = await res.json();
    if (!res.ok) { notify.error(data.error || t("errors.generic")); return; }
    notify.success(t("team.removed"));
    load(type);
  }

  const canManage = myRole === "owner" || myRole === "admin";
  const backHref = type === "startup" ? "/dashboard/startup" : "/dashboard/investor";

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href={backHref}>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> {t("common.back")}
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-cr-ink">{t("team.title")}</h1>
        </div>

        {/* Says plainly what a membership grants. The access itself comes from
            RLS, which is invisible -- without this, "add member" reads as if it
            only affects some roster page. */}
        <div className="bg-cr-copper/5 border border-cr-copper/20 rounded-2xl p-4 mb-6 flex gap-3">
          <ShieldCheck className="h-5 w-5 text-cr-copper shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-cr-ink">{t("team.accessTitle")}</p>
            <p className="text-sm text-cr-i3 mt-1 leading-relaxed">{t("team.accessBody")}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-cr-i4">{t("common.loading")}</p>
        ) : !entityId ? (
          <div className="bg-cr-paper border rounded-2xl p-8 text-center">
            <Users className="h-8 w-8 text-cr-p4 mx-auto mb-3" />
            <p className="text-sm text-cr-i3">{t("team.noEntity")}</p>
          </div>
        ) : (
          <>
            {canManage && (
              <form onSubmit={invite} className="bg-cr-paper border rounded-2xl p-5 mb-6 space-y-4">
                <h2 className="font-semibold text-cr-ink">{t("team.inviteHeading")}</h2>
                <div>
                  <Label>{t("team.emailLabel")}</Label>
                  <Input
                    type="email" required value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="colleague@yourfirm.com"
                  />
                  {/* The API rejects unknown emails rather than sending an
                      invite, because outbound mail is not configured yet. */}
                  <p className="text-xs text-cr-i4 mt-1">{t("team.emailHint")}</p>
                </div>
                <div>
                  <Label>{t("team.roleLabel")}</Label>
                  <Select value={inviteRole} onValueChange={v => setInviteRole(v as "admin" | "member")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">{t("team.roleMember")}</SelectItem>
                      <SelectItem value="admin">{t("team.roleAdmin")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-cr-i4 mt-1">
                    {inviteRole === "admin" ? t("team.roleAdminHint") : t("team.roleMemberHint")}
                  </p>
                </div>
                <Button type="submit" disabled={inviting} className="gap-1.5">
                  <UserPlus className="h-4 w-4" />
                  {inviting ? t("team.adding") : t("team.addButton")}
                </Button>
              </form>
            )}

            <div className="bg-cr-paper border rounded-2xl divide-y">
              <div className="p-4 flex items-center justify-between">
                <h2 className="font-semibold text-cr-ink">{t("team.rosterHeading")}</h2>
                <span className="text-xs text-cr-i4">{t("team.count", { n: members.length })}</span>
              </div>

              {members.map(m => (
                <div key={m.userId} className="p-4 flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{getInitials(m.name || m.email || "?")}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-cr-ink truncate">
                      {m.name || t("team.unnamed")}
                    </p>
                    <p className="text-xs text-cr-i4 truncate">{m.email}</p>
                  </div>
                  <Badge variant={m.role === "owner" ? "default" : "secondary"} className="shrink-0">
                    {t(`team.role_${m.role}`)}
                  </Badge>
                  {canManage && m.canRemove && m.id && (
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => remove(m.id!)}
                      aria-label={t("team.removeAria", { name: m.name || m.email || "" })}
                      className="text-cr-down shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {!canManage && (
              <p className="text-xs text-cr-i4 mt-4">{t("team.readOnlyNote")}</p>
            )}
          </>
        )}
      </main>
    </>
  );
}
