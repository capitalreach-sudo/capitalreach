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

const iconColor: Record<ToastType, string> = {
  success: "#2D6A4F",
  error:   "#9B2335",
  info:    "#5C6B7A",
};

const borderColor: Record<ToastType, string> = {
  success: "rgba(45,106,79,0.25)",
  error:   "rgba(155,35,53,0.25)",
  info:    "rgba(92,107,122,0.25)",
};

export function ToastNotifyProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (t: ToastItem) => {
      setToasts((p) => [...p, t]);
      setTimeout(() => setToasts((p) => p.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.push(handler);
    return () => {
      listeners.splice(listeners.indexOf(handler), 1);
    };
  }, []);

  const Icon = ({ type }: { type: ToastType }) => {
    const color = iconColor[type];
    const props = { width: 16, height: 16, color, style: { flexShrink: 0 } };
    if (type === "success") return <CheckCircle2 {...props} />;
    if (type === "error")   return <AlertCircle  {...props} />;
    return <Info {...props} />;
  };

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 pointer-events-auto"
          style={{
            background:   "var(--cr-paper-2)",
            border:       `1px solid ${borderColor[t.type]}`,
            borderRadius: "4px",
            boxShadow:    "0 4px 24px rgba(26,22,18,0.12)",
            padding:      "12px 18px",
            minWidth:     "280px",
            animation:    "slideIn 220ms cubic-bezier(0.16,1,0.3,1) forwards",
          }}
        >
          <Icon type={t.type} />
          <span style={{
            fontFamily:  "'DM Sans', sans-serif",
            fontSize:    "13px",
            fontWeight:  400,
            color:       "var(--cr-ink)",
            lineHeight:  1.5,
          }}>
            {t.message}
          </span>
        </div>
      ))}
    </div>
  );
}
