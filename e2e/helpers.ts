import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "demo1234";

export const ACCOUNTS = {
  candidate: "candidate@skillproof.dev",
  employer: "employer@skillproof.dev",
  college: "college@skillproof.dev",
  admin: "admin@skillproof.dev",
} as const;

export const DEMO_PROFILE_SLUG = "casey-candidate-skillproof-ai-demo";

/**
 * Logs in through the real next-auth credentials endpoint via the request API.
 * page.request shares the BrowserContext cookie jar, so the session cookie it
 * sets is used by subsequent page navigations. This is fully awaited and has no
 * UI-redirect timing races — deterministic even against a cold `next dev`.
 */
export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  const csrfRes = await page.request.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const res = await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password, json: "true", callbackUrl: "/post-login" },
  });
  expect(res.ok()).toBeTruthy();

  // Confirm the session cookie was accepted before navigating.
  const session = await (await page.request.get("/api/auth/session")).json();
  expect(session?.user?.email).toBe(email);
}
