"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  // Trigger fade-in after mount / on route change
  useEffect(() => {
    setVisible(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <div
      style={{
        opacity:    visible ? 1 : 0,
        transition: "opacity 300ms ease",
        willChange: "opacity",
      }}
    >
      {children}
    </div>
  );
}
