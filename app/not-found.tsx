import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { getLocale, getTranslator } from "@/lib/locale-server";

export default async function NotFound() {
  const t = await getTranslator(getLocale());
  return (
    <div className="min-h-screen flex flex-col bg-base">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-24">
        <div className="text-center max-w-lg">
          {/* Logo mark */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-20 h-20 bg-cr-copper/10 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(196,158,80,0.2)] border border-cr-copper/20">
              <span className="text-cr-copper font-black text-2xl">CR</span>
            </div>
          </div>

          {/* 404 */}
          <p className="text-9xl font-extrabold text-cr-copper/10 leading-none select-none -mb-4">
            404
          </p>

          <h1 className="text-3xl font-extrabold text-cr-ink mb-3">
            {t("notFound.title")}
          </h1>
          <p className="text-cr-i3 mb-8 leading-relaxed text-sm">
            {t("notFound.body")}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/">
              <Button className="w-full sm:w-auto gap-2 bg-cr-copper hover:bg-cr-cu-l text-white">
                <Home className="h-4 w-4" />
                {t("notFound.goHome")}
              </Button>
            </Link>
            <Link href="/startups">
              <Button variant="outline" className="w-full sm:w-auto gap-2 border-cr-p4 text-cr-i2 hover:text-cr-ink hover:bg-cr-paper/5">
                <ArrowLeft className="h-4 w-4" />
                {t("notFound.browse")}
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
