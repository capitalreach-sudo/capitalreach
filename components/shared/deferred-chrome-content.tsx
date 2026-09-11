"use client";

import { BottomNav } from "@/components/shared/bottom-nav";
import { ServiceWorkerRegistrar } from "@/components/shared/service-worker";
import { ShortcutsHelp } from "@/components/shared/shortcuts-help";
import { LocaleChangeToast } from "@/components/ui/LocaleChangeToast";
import { RuleLabelAnimator } from "@/components/ui/RuleLabelAnimator";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { Toaster } from "@/components/ui/toaster";
import { ToastNotifyProvider } from "@/components/ui/toast-notify";

/**
 * The global chrome that nothing on a first paint depends on.
 *
 * These are grouped into ONE module on purpose, so webpack emits one lazy
 * chunk rather than eight: eight dynamic imports would be eight requests
 * resolving in arbitrary order, and the first two below have an order
 * requirement that separate chunks cannot honour.
 *
 * Not one of them puts a pixel on the screen before it is asked to. The tab
 * bar waits on a profile fetch, both toast hosts start empty, the shortcuts
 * sheet and the back-to-top button start hidden, and the rule animator and
 * the worker registrar render nothing at all. The whole server HTML they used
 * to contribute was an empty toast viewport and an invisible button.
 */
export function DeferredChromeContent() {
  return (
    <>
      {/* The notify() bus fans a message out to the listeners registered at
          the instant it is called and keeps no backlog, so its host has to be
          mounted before anything that fires into it. LocaleChangeToast fires
          from its own mount effect, and sibling effects run in tree order. */}
      <ToastNotifyProvider />
      <LocaleChangeToast />
      <RuleLabelAnimator />
      <ShortcutsHelp />
      <ScrollToTop />
      <BottomNav />
      <Toaster />
      <ServiceWorkerRegistrar />
    </>
  );
}
