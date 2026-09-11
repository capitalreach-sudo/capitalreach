"use client";

import { useCallback } from "react";
import Link from "next/link";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * A refusal, read the way the route wrote it.
 *
 * A refused request comes back with up to four things and almost never all of
 * them: a `messageKey` naming a translated sentence, an `error` that is a
 * whole sentence on some routes and a bare code ("offer_required",
 * "seal_required") on others, and an `href`/`ctaKey` pair naming the way out.
 * lib/contact-policy.ts sends all four, lib/plan-gate.ts sends a sentence plus
 * `upgrade: true`, lib/trust-gates.ts sends a key plus a `verifyUrl`.
 *
 * Which of them a caller reads is not a matter of taste. Rendering `error` on
 * its own puts the codes in front of people; ignoring the body and reaching
 * for errors.generic throws away a sentence the route wrote precisely so the
 * person refused would know what to do. The order below is the only one that
 * says something true in every shape above, which is why every caller goes
 * through here rather than picking a field.
 */

export interface Refusal {
  /** Ready to render. Never a code, never empty. */
  message: string;
  /** In-app path to whatever undoes the refusal, when the route named one. */
  href: string | null;
  /** Label for that path. Present whenever href is. */
  cta: string | null;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * useTranslation echoes an unknown key back as its own value, so a key no
 * dictionary carries would land on screen as "founderContact.dealRequired":
 * a raw code in a different spelling.
 */
function fromKey(t: Translate, k: unknown): string | null {
  const name = text(k);
  if (!name) return null;
  const resolved = t(name);
  return resolved === name ? null : resolved;
}

/**
 * Codes and sentences share the `error` field. Whitespace is what tells them
 * apart: every code in use is a single snake_case or one-word token.
 */
function sentence(v: unknown): string | null {
  const s = text(v);
  return s && /\s/.test(s) ? s : null;
}

/** In-app only. An href taken from a response body is a redirect if it can be one. */
function path(v: unknown): string | null {
  const s = text(v);
  if (!s || !s.startsWith("/") || s.startsWith("//")) return null;
  // A remedy pointing at the page the reader is already standing on is not a
  // remedy. The server names the best place to act, and for several refusals
  // that IS this page -- a founder refused on an investor profile is told to
  // open a deal, which is done from that profile. Correct advice, useless as a
  // link. Dropping it leaves the sentence, which still says what to do.
  if (typeof window !== "undefined" && s.split("?")[0] === window.location.pathname) return null;
  return s;
}

function resolve(t: Translate, res: Response | null | undefined, body: unknown): Refusal {
  const j = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const status = res?.status ?? 0;
  const message =
    fromKey(t, j.messageKey) ??
    sentence(j.error) ??
    // Nothing usable in the body. The status still knows the difference
    // between "you may not" and "something broke".
    t(status === 401 || status === 403 ? "errors.notAuthorized" : "errors.generic");

  // Three ways a route names the remedy. The plan gate names no path of its
  // own because there is only one place to change a plan.
  let href = path(j.href);
  let cta = href ? fromKey(t, j.ctaKey) ?? t("common.view") : null;
  if (!href) {
    const verify = path(j.verifyUrl);
    if (verify) {
      href = verify;
      // Through fromKey, not t, so a dictionary that has yet to catch up puts
      // "View" on the link rather than the key.
      cta = fromKey(t, j.ctaKey) ?? fromKey(t, "refusal.verifyCta") ?? t("common.view");
    } else if (j.upgrade === true) {
      href = "/pricing";
      cta = fromKey(t, j.ctaKey) ?? t("common.upgrade");
    }
  }

  return { message, href, cta };
}

export function useRefusal() {
  const { t } = useTranslation();

  const readRefusal = useCallback(
    (res: Response | null | undefined, body: unknown): Refusal => resolve(t, res, body),
    [t],
  );

  /** For surfaces with nowhere to put a link. The remedy still comes back. */
  const notifyRefusal = useCallback(
    (res: Response | null | undefined, body: unknown): Refusal => {
      const refusal = readRefusal(res, body);
      notify.error(refusal.message);
      return refusal;
    },
    [readRefusal],
  );

  return { readRefusal, notifyRefusal };
}

/**
 * The refusal shown in place. A toast lasts three and a half seconds and holds
 * no link, so any refusal that names a way out belongs here instead.
 */
export function RefusalNotice({ refusal }: { refusal: Refusal }) {
  return (
    <div role="alert"
      style={{
        display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px",
        maxWidth: "520px",
        background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)",
        borderRadius: "4px", padding: "10px 12px",
        fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12.5px",
        lineHeight: 1.5, color: "var(--cr-ink-2)",
      }}>
      <span>{refusal.message}</span>
      {refusal.href && refusal.cta && (
        <Link href={refusal.href}
          style={{ fontWeight: 600, color: "var(--cr-copper)", textDecoration: "underline", textUnderlineOffset: "3px", whiteSpace: "nowrap" }}>
          {refusal.cta}
        </Link>
      )}
    </div>
  );
}
