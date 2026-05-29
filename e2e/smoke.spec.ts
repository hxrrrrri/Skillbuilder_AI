import { test, expect } from "@playwright/test";
import { ACCOUNTS, DEMO_PROFILE_SLUG, login } from "./helpers";

// Minimal per-role smoke suite. Covers the auth + reachability path for each
// role and the public profile render. Never triggers a real LLM mission run.

test.describe("auth smoke per role", () => {
  test("candidate logs in and reaches new-verification", async ({ page }) => {
    await login(page, ACCOUNTS.candidate);
    await page.goto("/candidate/new-verification");
    await expect(page.getByRole("heading", { name: /new verification mission/i })).toBeVisible();
  });

  test("employer logs in and reaches search + dashboard", async ({ page }) => {
    await login(page, ACCOUNTS.employer);
    await page.goto("/employer/search");
    await expect(page.getByRole("heading", { name: /search verified talent/i })).toBeVisible();
    await page.goto("/employer/dashboard");
    await expect(page.getByRole("heading", { name: /verified talent feed/i })).toBeVisible();
  });

  test("admin logs in and reaches the admin dashboard", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto("/admin/dashboard");
    await expect(page.getByRole("heading", { name: /platform control plane/i })).toBeVisible();
  });
});

test.describe("public profile", () => {
  // The seeded demo profile is private; an admin viewer renders it in preview
  // mode. This exercises the same profile/[slug] React tree (incl. lazy radar)
  // deterministically without depending on publish state.
  test("profile/[slug] renders for an authorized viewer", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto(`/profile/${DEMO_PROFILE_SLUG}`);
    await expect(page.getByRole("heading", { name: /casey candidate/i })).toBeVisible();
    await expect(page.getByText("Skill Graph")).toBeVisible();
  });
});
