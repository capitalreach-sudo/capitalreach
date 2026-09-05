"use client";

import { useEffect, useState, useCallback } from "react";
import { LedgerLoader } from "@/components/ui/LedgerLoader";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, UserPlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { notify } from "@/components/ui/toast-notify";
import { getInitials, cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

// ── House register ─────────────────────────────────────────────────────────
// Cards are paper-2 slabs with a hairline border at 4px radius; internal
// structure is rules, never nested boxes. Field labels use the Label style
// (small caps, +0.07em). The member count renders in JetBrains Mono.
const CARD: React.CSSProperties = {
  background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
};
const FIELD_LABEL = "text-[11px] font-medium uppercase tracking-[0.07em] text-cr-i3";

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
  // True when the database has no team_members table yet (migration 023 not
  // applied). The page ships ahead of the migration, so say so plainly rather
  // than showing a broken roster.
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async (entityType: EntityType) => {
    try {
      const res = await fetch(`/api/team?type=${entityType}`);
      const data = await res.json();
      if (!res.ok) { notify.error(data.error || t("errors.generic")); return; }
      setUnavailable(Boolean(data.unavailable));
      setMembers(data.members ?? []);
      setMyRole(data.myRole);
      setEntityId(data.entityId);
    } catch {
      notify.error(t("errors.generic"));
    }
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
      try { await load(entityType); } finally { setLoading(false); }
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
      <main className="container mx-auto max-w-2xl px-4 py-8 md:py-12" style={{ background: "var(--cr-paper)" }}>
        <header className="mb-8 pb-6" style={{ borderBottom: "1px solid var(--cr-rule-dark)" }}>
          <div className="mb-4">
            <Link href={backHref}>
              <Button variant="ghost" size="sm" className="-ml-2 h-10 gap-1.5">
                <ArrowLeft className="h-4 w-4" /> {t("common.back")}
              </Button>
            </Link>
          </div>
          <div className="ruled-label" style={{ marginBottom: "10px" }}>{t("team.title")}</div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(28px, 4vw, 36px)", lineHeight: 1.15, letterSpacing: "-0.02em", color: "var(--cr-ink)", textWrap: "balance" }}>
            {t("team.accessTitle")}
          </h1>
          {/* Says plainly what a membership grants. The access itself comes from
              RLS, which is invisible -- without this, "add member" reads as if it
              only affects some roster page. A rule-topped paragraph, not a card. */}
          <p className="mt-4 pt-4 text-sm leading-relaxed text-cr-i3" style={{ borderTop: "1px solid var(--cr-rule)" }}>
            {t("team.accessBody")}
          </p>
        </header>

        {loading ? (
          <LedgerLoader />
        ) : unavailable ? (
          <div className="p-8 text-center" style={CARD}>
            <span aria-hidden style={{ color: "var(--cr-copper)" }}>✦</span>
            <p className="mt-3 text-sm text-cr-i3">{t("team.unavailable")}</p>
          </div>
        ) : !entityId ? (
          <div className="p-8 text-center" style={CARD}>
            <span aria-hidden style={{ color: "var(--cr-copper)" }}>✦</span>
            <p className="mt-3 text-sm text-cr-i3">{t("team.noEntity")}</p>
          </div>
        ) : (
          <>
            {canManage && (
              <form onSubmit={invite} className="mb-6 space-y-4 p-4 sm:p-6" style={CARD}>
                <h2 className="ruled-label">{t("team.inviteHeading")}</h2>
                <div>
                  <Label className={FIELD_LABEL}>{t("team.emailLabel")}</Label>
                  <Input
                    type="email" required value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="colleague@yourfirm.com"
                  />
                  {/* The API rejects unknown emails rather than sending an
                      invite, because outbound mail is not configured yet. */}
                  <p className="mt-1 text-xs text-cr-i4">{t("team.emailHint")}</p>
                </div>
                <div>
                  <Label className={FIELD_LABEL}>{t("team.roleLabel")}</Label>
                  <Select value={inviteRole} onValueChange={v => setInviteRole(v as "admin" | "member")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">{t("team.roleMember")}</SelectItem>
                      <SelectItem value="admin">{t("team.roleAdmin")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-cr-i4">
                    {inviteRole === "admin" ? t("team.roleAdminHint") : t("team.roleMemberHint")}
                  </p>
                </div>
                {/* The one primary action on this view. */}
                <Button type="submit" disabled={inviting} className="h-11 w-full gap-2 rounded-full bg-cr-copper text-[13px] font-semibold text-white hover:bg-cr-cu-d sm:w-auto sm:px-6">
                  <UserPlus className="h-4 w-4" />
                  {inviting ? t("team.adding") : t("team.addButton")}
                </Button>
              </form>
            )}

            {/* Roster: one slab, rows separated by hairline rules. */}
            <div style={CARD}>
              <div className="flex items-center justify-between gap-3 p-4 sm:px-6">
                <h2 className="ruled-label">{t("team.rosterHeading")}</h2>
                <span className="mono shrink-0 text-[11px] font-medium text-cr-i4">
                  {t("team.count", { n: members.length })}
                </span>
              </div>

              {members.map(m => (
                <div key={m.userId} className="flex items-center gap-3 p-4 sm:px-6" style={{ borderTop: "1px solid var(--cr-rule)" }}>
                  <Avatar className="h-9 w-9 shrink-0 border border-cr-p4">
                    <AvatarFallback className="bg-cr-p3 text-[11px] font-semibold text-cr-copper">
                      {getInitials(m.name || m.email || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-cr-ink">
                      {m.name || t("team.unnamed")}
                    </p>
                    <p className="truncate text-xs text-cr-i4">{m.email}</p>
                  </div>
                  <Badge
                    variant={m.role === "owner" ? "default" : "secondary"}
                    className={cn(
                      "shrink-0 rounded-[3px] px-2 py-1 text-[11px] font-medium uppercase tracking-[0.06em]",
                      m.role === "owner"
                        ? "border-[var(--cr-copper-br)] bg-[var(--cr-copper-bg)] text-cr-copper hover:bg-[var(--cr-copper-bg)]"
                        : "border-cr-p4 bg-cr-p2 text-cr-i3 hover:bg-cr-p2"
                    )}
                  >
                    {t(`team.role_${m.role}`)}
                  </Badge>
                  {canManage && m.canRemove && m.id && (
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => remove(m.id!)}
                      aria-label={t("team.removeAria", { name: m.name || m.email || "" })}
                      className="h-10 w-10 shrink-0 p-0 text-cr-down hover:text-cr-down"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {!canManage && (
              <p className="mt-4 text-xs text-cr-i4">{t("team.readOnlyNote")}</p>
            )}
          </>
        )}
      </main>
    </>
  );
}
