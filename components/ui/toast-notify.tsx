"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";
interface ToastItem { id: string; message: string; type: ToastType }

const listeners: ((t: ToastItem) => void)[] = [];

function emit(message: string, type: ToastType) {
  const t: ToastItem = { id: Date.now().toString(), message, type };
  listeners.forEach((fn) => fn(t));
}

export const notify = {
  success: (msg: string) => emit(msg, "success"),
  error:   (msg: string) => emit(msg, "error"),
  info:    (msg: string) => emit(msg, "info"),
};

const LIFE_MS = 3500;

/* Success is VERDIGRIS -- copper that matured. Error keeps the claret.
   Info speaks copper. The bar carries the meaning; the slab stays ink. */
const accent: Record<ToastType, string> = {
  success: "var(--verdigris)",
  error:   "var(--cr-down)",
  info:    "var(--cr-copper)",
};

export function ToastNotifyProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (t: ToastItem) => {
      setToasts((p) => [...p, t]);
      setTimeout(() => setToasts((p) => p.filter((x) => x.id !== t.id)), LIFE_MS);
    };
    listeners.push(handler);
    return () => {
      listeners.splice(listeners.indexOf(handler), 1);
    };
  }, []);

  const Icon = ({ type }: { type: ToastType }) => {
    const props = { width: 15, height: 15, color: accent[type], style: { flexShrink: 0 } };
    if (type === "success") return <CheckCircle2 {...props} />;
    if (type === "error")   return <AlertCircle  {...props} />;
    return <Info {...props} />;
  };

  /* A slip filed from the bottom-left: ink slab, accent bar down the left
     edge, and a drain line that empties across the toast's lifetime so its
     departure is never a surprise. */
  return (
    <div className="fixed bottom-4 left-4 z-[200] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: "min(360px, calc(100vw - 32px))" }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 pointer-events-auto"
          style={{
            position:     "relative",
            overflow:     "hidden",
            background:   "var(--cr-band-bg)",
            border:       "1px solid color-mix(in srgb, var(--cr-band-ink) 14%, transparent)",
            borderRadius: "4px",
            boxShadow:    "0 8px 32px rgba(0,0,0,0.28)",
            padding:      "12px 18px 14px 20px",
            minWidth:     "280px",
            animation:    "toastInLeft 220ms cubic-bezier(0.16,1,0.3,1) forwards",
          }}
        >
          <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "3px", background: accent[t.type] }} />
          <Icon type={t.type} />
          <span style={{
            fontFamily:  "'DM Sans', sans-serif",
            fontSize:    "13px",
            fontWeight:  400,
            color:       "var(--cr-band-ink)",
            lineHeight:  1.5,
          }}>
            {t.message}
          </span>
          <span aria-hidden style={{ position: "absolute", left: "3px", right: 0, bottom: 0, height: "2px", transformOrigin: "left", background: accent[t.type], opacity: 0.55, animation: `toastDrain ${LIFE_MS}ms linear forwards` }} />
        </div>
      ))}
    </div>
  );
}
