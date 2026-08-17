"use client";

import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { BookOpen, ArrowRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { SubscribeForm } from "@/components/blog/subscribe-form";

export default function BlogPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col bg-base">
      <Navbar />

      {/* Hero */}
      <section className="relative bg-cr-paper border-b border-cr-p4 py-20 px-4 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-cr-copper/8 blur-[120px] pointer-events-none" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <div className="w-12 h-12 bg-cr-copper/10 rounded-xl flex items-center justify-center mx-auto mb-5 border border-cr-copper/20">
            <BookOpen className="h-6 w-6 text-cr-copper" />
          </div>
          <h1 className="text-4xl font-extrabold mb-3 text-cr-ink">{t("blog.heroTitle")}</h1>
          <p className="text-cr-i3 text-lg max-w-xl mx-auto">
            {t("blog.heroSub")}
          </p>
        </div>
      </section>

      {/* Article list — real posts from lib/blog-posts replaced the
          coming-soon block that sat here since launch. */}
      <section className="flex-1 py-16 px-4">
        <div className="container mx-auto max-w-3xl flex flex-col gap-5">
          {[...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date)).map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`}
              className="block bg-cr-paper border border-cr-p4 rounded-2xl p-6 hover:border-cr-copper/30 transition-colors">
              <p className="text-[11px] font-mono uppercase tracking-widest text-cr-copper mb-2">
                {post.date} · {t("blog.minRead", { minutes: post.minutes })}
              </p>
              <h2 className="text-xl font-bold text-cr-ink mb-2">{post.title}</h2>
              <p className="text-sm text-cr-i3 leading-relaxed mb-3">{post.description}</p>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-cr-copper">
                {t("blog.readArticle")} <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
          <SubscribeForm />
        </div>
      </section>

      <Footer />
    </div>
  );
}
