import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { BLOG_POSTS, postBySlug } from "@/lib/blog-posts";

/**
 * One article. Statically generated from lib/blog-posts — the posts are data,
 * so a new article is one entry in one file and appears here, on the list,
 * and in the sitemap without touching layout code.
 */
interface Props {
  params: { slug: string };
}

export function generateStaticParams() {
  return BLOG_POSTS.map(({ slug }) => ({ slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const post = postBySlug(params.slug);
  if (!post) return {};
  return { title: post.title, description: post.description };
}

export default function BlogPostPage({ params }: Props) {
  const post = postBySlug(params.slug);
  if (!post) notFound();

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "70vh" }}>
        <article style={{ maxWidth: "680px", margin: "0 auto", padding: "56px 24px 80px" }}>
          <Link href="/blog" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-3)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
            ← Blog
          </Link>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--cr-copper)", margin: "28px 0 10px" }}>
            {post.date} · {post.minutes} min
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "clamp(28px, 4vw, 38px)", lineHeight: 1.15, color: "var(--cr-ink)", marginBottom: "12px" }}>
            {post.title}
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "16px", color: "var(--cr-ink-3)", lineHeight: 1.7, marginBottom: "8px" }}>
            {post.description}
          </p>
          <div style={{ borderTop: "3px solid var(--cr-copper)", margin: "20px 0 28px" }} />

          {post.sections.map((section, i) => (
            <section key={i} style={{ marginBottom: "26px" }}>
              {section.heading && (
                <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "18px", color: "var(--cr-ink)", marginBottom: "10px" }}>
                  {section.heading}
                </h2>
              )}
              {section.paragraphs.map((para, j) => (
                <p key={j} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-2)", lineHeight: 1.8, marginBottom: "12px" }}>
                  {para}
                </p>
              ))}
            </section>
          ))}

          <div style={{ borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "20px", marginTop: "8px" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", lineHeight: 1.7 }}>
              Raising, or deploying capital?{" "}
              <Link href="/startups" style={{ color: "var(--cr-copper)" }}>Browse live rounds</Link>
              {" "}or{" "}
              <Link href="/auth/signup" style={{ color: "var(--cr-copper)" }}>create a free account</Link>
              {" "}— every listing is reviewed before it goes live, and the only fee is 2% at close.
            </p>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
