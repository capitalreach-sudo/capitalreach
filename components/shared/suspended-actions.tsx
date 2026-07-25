"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

// Sign-out button for the suspension page. Split into its own client component
// so app/suspended/page.tsx can stay a server component and read the profile
// directly rather than fetching it over the wire.
export function SuspendedActions() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={signingOut}
      style={{
        marginTop: "28px",
        background: "transparent",
        border: "1px solid var(--cr-rule-dark)",
        borderRadius: "4px",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 500,
        fontSize: "13px",
        color: "var(--cr-ink-3)",
        padding: "9px 20px",
        cursor: signingOut ? "default" : "pointer",
        opacity: signingOut ? 0.6 : 1,
      }}
    >
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
