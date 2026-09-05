"use client";

import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { useTranslation } from "@/hooks/useTranslation";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { SubscribeForm } from "@/components/blog/subscribe-form";
import { brand } from "@/lib/brand";

export default function BlogPage() {
  const { t } = useTranslation();
  const posts = [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--cr-paper)" }}>
      <Navbar />

      {/* Hero -- eyebrow ruled label, serif italic display, one quiet sub. */}
      <section style={{ background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule)" }}>
        <div className="max-w-[880px] mx-auto w-full px-6 md:px-10 py-16 md:py-24">
          <div className="ruled-label" style={{ marginBottom: "24px" }}>
            {brand.name}
          </div>
          <h1
            style={{
              fontFamily:    "'Playfair Display', Georgia, serif",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(30px, 5.5vw, 52px)",
              color:         "var(--cr-ink)",
              lineHeight:    1.08,
              letterSpacing: "-0.02em",
              textWrap:      "balance",
              marginBottom:  "16px",
            }}
          >
            {t("blog.heroTitle")}
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", lineHeight: 1.7, maxWidth: "58ch" }}>
            {t("blog.heroSub")}
          </p>
        </div>
      </section>

      {/* Article index -- real posts from lib/blog-posts replaced the
          coming-soon block that sat here since launch. Rule-separated
          entries, dates in mono; no boxes. */}
      <section className="flex-1" style={{ background: "var(--cr-paper)" }}>
        <div className="max-w-[880px] mx-auto w-full px-6 md:px-10 py-16 md:py-24">
          <div>
            {posts.map((post, i) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block"
                style={{ padding: "24px 0", borderTop: "1px solid var(--cr-rule)", borderBottom: i === posts.length - 1 ? "1px solid var(--cr-rule)" : "none", textDecoration: "none" }}
              >
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                  {post.date} · {t("blog.minRead", { minutes: post.minutes })}
                </p>
                <h2 className="text-cr-ink group-hover:text-cr-copper transition-colors" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", marginBottom: "8px" }}>
                  {post.title}
                </h2>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.65, marginBottom: "12px", maxWidth: "62ch" }}>
                  {post.description}
                </p>
                <span className="inline-flex items-center" style={{ gap: "8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-copper)" }}>
                  {t("blog.readArticle")} →
                </span>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: "48px" }}>
            <SubscribeForm />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
