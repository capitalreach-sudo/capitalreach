import type { Metadata } from "next";
import { getLocale, getTranslator } from "@/lib/locale-server";

// /auth/signup is a client component, so its metadata lives here - a page
// marked "use client" cannot export metadata itself. Without this layout the
// tab fell back to the root default title on a page every new user sees.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return { title: t("meta.signupTitle") };
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
