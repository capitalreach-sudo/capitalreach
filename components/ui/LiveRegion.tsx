import { LIVE_REGION_ID } from "@/lib/announce";

/**
 * The one polite live region for the whole app. See lib/announce.ts for why.
 *
 * Server component on purpose: it is an empty node with no state, so there is
 * no reason to ship it to the client or to make it wait for hydration -- a
 * filter that resolves before hydration should still find a region to write
 * into.
 */
export function LiveRegion() {
  return (
    <div
      id={LIVE_REGION_ID}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
}
