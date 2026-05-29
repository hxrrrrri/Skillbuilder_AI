// Shared cache contract for the public profile page (src/app/profile/[slug]).
//
// The page caches its (expensive) DB read in the Next data cache instead of
// re-querying on every hit. Two invalidation paths keep it correct:
//   1. Time: entries auto-revalidate after PROFILE_REVALIDATE_SECONDS.
//   2. Tag: any write that changes a profile's visibility calls
//      revalidatePublicProfile(slug) so the change is visible immediately,
//      never waiting out the window. This is what prevents a just-unpublished
//      (now private) profile from being served from a stale public cache entry.
//
// Per-request visibility gating (owner/admin checks against the live session)
// still runs outside the cache, so the cached row never reaches the wrong role.

import { revalidateTag } from "next/cache";

/** Fallback freshness window for the cached public-profile read. */
export const PROFILE_REVALIDATE_SECONDS = 60;

export function publicProfileTag(slug: string): string {
  return `public-profile:${slug}`;
}

/** Bust the cached read for one slug. Call after any visibility mutation. */
export function revalidatePublicProfile(slug: string): void {
  revalidateTag(publicProfileTag(slug));
}
