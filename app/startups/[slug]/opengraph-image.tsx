import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase-server";
import { STAGE_LABELS } from "@/lib/utils";

/**
 * Per-startup share card: a profile link pasted into LinkedIn/X/WhatsApp
 * shows that startup's name, tagline and sector -- the strongest referral
 * surface a marketplace has. Same design-A tokens as the site-wide card in
 * app/opengraph-image.tsx.
 *
 * Only fields the anonymous profile page itself renders are used (name,
 * tagline, industry, stage). Financials stay off the card -- they are
 * tier-gated in the app and og images are served to anyone.
 */

export const runtime = "edge";
export const alt = "Startup profile on CapitalReach";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#F5F0E8";
const INK = "#1A1612";
const INK_3 = "#6B6056";
const COPPER = "#B5651D";
const COPPER_BR = "#C89A6B";

async function playfair(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,600&display=swap",
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function StartupOgImage({ params }: { params: { slug: string } }) {
  const supabase = createAdminClient();
  const { data: startup } = await supabase
    .from("startups")
    .select("name, tagline, industry, stage, status")
    .eq("slug", params.slug)
    .maybeSingle();

  const serif = await playfair();
  const active = startup && startup.status === "active";
  const name = active ? startup.name : "CapitalReach";
  const tagline = active
    ? startup.tagline
    : "Vetted startups. Serious investors. Deals that close in one place.";
  const chips = active
    ? [startup.industry, STAGE_LABELS[startup.stage as keyof typeof STAGE_LABELS] ?? startup.stage]
    : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          background: PAPER,
          padding: "80px 96px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 54, height: 4, background: COPPER, display: "flex" }} />
          <div
            style={{
              fontSize: 24,
              color: COPPER,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            {active ? "Raising on CapitalReach" : "CapitalReach"}
          </div>
        </div>
        <div
          style={{
            fontSize: name.length > 18 ? 84 : 112,
            fontFamily: serif ? "Playfair" : undefined,
            fontStyle: serif ? "italic" : undefined,
            fontWeight: 600,
            color: INK,
            marginTop: 34,
            display: "flex",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 32,
            color: INK_3,
            marginTop: 26,
            maxWidth: 950,
            lineHeight: 1.4,
            display: "flex",
          }}
        >
          {tagline}
        </div>
        {chips.length > 0 && (
          <div style={{ display: "flex", gap: 14, marginTop: 40 }}>
            {chips.map((c) => (
              <div
                key={c}
                style={{
                  display: "flex",
                  border: `1.5px solid ${COPPER_BR}`,
                  borderRadius: 4,
                  color: COPPER,
                  fontSize: 22,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "10px 22px",
                }}
              >
                {c}
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    {
      ...size,
      fonts: serif
        ? [{ name: "Playfair", data: serif, style: "italic" as const, weight: 600 as const }]
        : undefined,
    },
  );
}
