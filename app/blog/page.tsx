"use client";

import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { BookOpen, ArrowRight } from "lucide-react";

export default function BlogPage() {
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
          <h1 className="text-4xl font-extrabold mb-3 text-cr-ink">The CapitalReach Blog</h1>
          <p className="text-cr-i3 text-lg max-w-xl mx-auto">
            Fundraising tactics, investor insights, and market intelligence for founders and VCs.
          </p>
        </div>
      </section>

      {/* Empty state */}
      <section className="flex-1 py-24 px-4 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-cr-copper/10 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-cr-copper/20">
            <BookOpen className="h-8 w-8 text-cr-copper" />
          </div>
          <h2 className="text-2xl font-bold text-cr-ink mb-3">Articles coming soon</h2>
          <p className="text-cr-i3 leading-relaxed mb-6">
            We&apos;re working on in-depth guides covering fundraising strategy, investor relations, and market intelligence. Check back soon.
          </p>
          <Link
            href="/startups"
            className="inline-flex items-center gap-2 text-sm font-medium text-cr-copper hover:text-cr-cu-l transition-colors"
          >
            Browse startups instead <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
