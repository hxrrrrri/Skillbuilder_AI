/**
 * CI runs `tsc --noEmit` before `next build`, so Next has not generated
 * `next-env.d.ts` yet. Pull in Next's static image module declarations here
 * so imports such as `import heroCv from "../../public/hero-cv.png"` typecheck
 * deterministically in clean CI checkouts.
 */
/// <reference types="next/image-types/global" />
