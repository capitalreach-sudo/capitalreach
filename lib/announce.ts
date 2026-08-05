/**
 * Screen-reader announcements for things that change without a navigation.
 *
 * Filtering a directory rewrites the result count and the whole grid, but to a
 * screen reader nothing happened -- focus never moved and no page loaded, so
 * the user is left tabbing into a list of unknown length to find out whether
 * their filter did anything. Same for applying a preset, clearing a chip, or
 * hiding a listing.
 *
 * A single polite live region lives in the root layout (LiveRegion). Calling
 * announce() writes into it, and assistive tech reads it at the next pause
 * without stealing focus. Sighted users see nothing.
 */
const REGION_ID = "cr-live-region";

export function announce(message: string) {
  if (typeof document === "undefined") return;
  const region = document.getElementById(REGION_ID);
  if (!region) return;

  // Re-setting identical text is a no-op for most screen readers, so clear
  // first: filtering back to the same count still deserves to be spoken.
  region.textContent = "";
  window.setTimeout(() => {
    region.textContent = message;
  }, 60);
}

export const LIVE_REGION_ID = REGION_ID;
