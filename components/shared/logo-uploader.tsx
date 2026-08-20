"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";
import { EntityLogo } from "@/components/shared/entity-logo";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Upload a logo, and sample its dominant colour while we are at it.
 *
 * The sampling happens HERE, in the browser, on a 32×32 canvas — the server
 * never processes images (no image library, no decompression-bomb surface).
 * The colour is a mean over opaque, non-greyish pixels with a saturation
 * floor, so a mark on a white background yields the mark's colour rather
 * than white. It is a tint for the fallback tile, not colour science.
 */
async function sampleColor(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, 32, 32);
    const { data } = ctx.getImageData(0, 0, 32, 32);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [pr, pg, pb, pa] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (pa < 200) continue;
      const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
      // Skip near-white, near-black and grey — they are background, not brand.
      if (max > 235 && min > 235) continue;
      if (max < 25) continue;
      if (max - min < 20) continue;
      r += pr; g += pg; b += pb; n++;
    }
    if (n < 8) return null;
    const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return null;
  }
}

export function LogoUploader({ entityType, name, logoUrl, logoColor, onChanged }: {
  entityType: "startup" | "investor";
  name: string;
  logoUrl: string | null;
  logoColor: string | null;
  onChanged: (url: string | null, color: string | null) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (busy) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      notify.error(t("logo.typeError")); return;
    }
    if (file.size > 2 * 1024 * 1024) { notify.error(t("logo.sizeError")); return; }
    setBusy(true);
    try {
      const color = await sampleColor(file);
      const form = new FormData();
      form.set("file", file);
      form.set("entityType", entityType);
      if (color) form.set("color", color);
      const res = await fetch("/api/logo", { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
      onChanged(j.url, j.color ?? null);
      notify.success(t("logo.saved"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/logo?entityType=${entityType}`, { method: "DELETE" });
      if (!res.ok) { notify.error(t("errors.generic")); return; }
      onChanged(null, null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <EntityLogo name={name} logoUrl={logoUrl} logoColor={logoColor} size={56} radius={6} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: 4, padding: "7px 12px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 12, color: "var(--cr-ink-2)" }}>
          {busy ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <ImagePlus style={{ width: 13, height: 13 }} />}
          {logoUrl ? t("logo.replace") : t("logo.upload")}
        </button>
        {logoUrl && (
          <button type="button" onClick={remove} disabled={busy} title={t("logo.remove")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", padding: 4 }}>
            <Trash2 style={{ width: 14, height: 14 }} />
          </button>
        )}
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, color: "var(--cr-ink-4)" }}>{t("logo.hint")}</span>
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
    </div>
  );
}
