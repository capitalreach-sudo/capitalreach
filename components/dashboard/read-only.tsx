"use client";

import { createContext, useContext } from "react";

/**
 * "This dashboard belongs to someone else — do not write."
 *
 * Threading a `viewingAs` prop down would work for controls the parent renders,
 * but the dashboards nest their write handlers inside small local components
 * (an inline watchlist note, a saved-search row) that the parent does not pass
 * props to. Every one of those posts to an API that authenticates as the
 * *admin*, so a stray click would not merely look wrong -- it would write a
 * note or delete a search on the admin's own account while appearing to act on
 * the investor's.
 *
 * A context reaches all of them, and defaults to false, so any component that
 * has not been wrapped behaves exactly as it always did.
 */
const ReadOnlyContext = createContext(false);

export const ReadOnlyProvider = ReadOnlyContext.Provider;

/** True when the surrounding dashboard is being viewed by an admin. */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
