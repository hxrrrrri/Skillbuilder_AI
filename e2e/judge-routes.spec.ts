import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { ACCOUNTS, DEMO_PROFILE_SLUG, login } from "./helpers";
import { DEMO_COHORT_NAME } from "../src/lib/demo-data";

const prisma = new PrismaClient();

type SeededIds = {
  runId: string;
  cohortId: string;
};

let ids: SeededIds;

test.beforeAll(async () => {
  const profile = await prisma.publicProfile.findUnique({
    where: { slug: DEMO_PROFILE_SLUG },
    include: { run: true },
  });
  const cohort = await prisma.cohort.findFirst({
    where: { name: DEMO_COHORT_NAME },
    orderBy: { createdAt: "asc" },
  });
  if (!profile?.runId || !cohort?.id) {
    throw new Error("Seeded judge demo data missing. Run npm run setup:e2e.");
  }
  ids = { runId: profile.runId, cohortId: cohort.id };
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function expectRouteRenders(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} should not return 5xx`).toBeLessThan(500);
  await expect(page.locator("body")).not.toContainText(/Application error|Unhandled Runtime Error|Internal Server Error/i);
}

test.describe("judge route smoke", () => {
  test("public and candidate routes render without crashes", async ({ page }) => {
    await expectRouteRenders(page, "/demo");
    await expectRouteRenders(page, "/demo/checklist");
    await expectRouteRenders(page, "/login");

    await login(page, ACCOUNTS.candidate);
    await expectRouteRenders(page, "/candidate/dashboard");
    await expectRouteRenders(page, "/candidate/new-verification");
    await expectRouteRenders(page, `/candidate/runs/${ids.runId}`);
    await expectRouteRenders(page, `/candidate/interview/${ids.runId}`);
    await expectRouteRenders(page, `/candidate/ai-challenge/${ids.runId}`);
  });

  test("employer routes render without crashes", async ({ page }) => {
    await login(page, ACCOUNTS.employer);
    await expectRouteRenders(page, "/employer/search");
    await expectRouteRenders(page, "/employer/compare");
    await expectRouteRenders(page, "/employer/shortlist");
  });

  test("college routes render without crashes", async ({ page }) => {
    await login(page, ACCOUNTS.college);
    await expectRouteRenders(page, "/college/dashboard");
    await expectRouteRenders(page, "/college/cohorts");
    await expectRouteRenders(page, `/college/cohorts/${ids.cohortId}`);
    await expectRouteRenders(page, "/college/skill-gaps");
  });

  test("admin routes and private demo profile render without crashes", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await expectRouteRenders(page, `/profile/${DEMO_PROFILE_SLUG}`);
    await expectRouteRenders(page, "/admin/dashboard");
    await expectRouteRenders(page, "/admin/providers");
    await expectRouteRenders(page, "/admin/providers/health");
    await expectRouteRenders(page, "/admin/agents");
    await expectRouteRenders(page, "/admin/runs");
    await expectRouteRenders(page, "/admin/evidence");
    await expectRouteRenders(page, "/admin/audit-logs");
    await expectRouteRenders(page, "/admin/prompts");
    await expectRouteRenders(page, "/admin/rubrics");
    await expectRouteRenders(page, "/admin/settings");
  });
});

test.describe("trust gates", () => {
  test("candidate mission start is blocked when providers have not passed health", async ({ page }) => {
    await login(page, ACCOUNTS.candidate);

    const response = await page.request.post("/api/analyze", {
      data: {
        repo_url: "https://github.com/hxrrrrri/Skillbuilder_AI",
        candidate_name: "Casey Candidate",
        github_username: "hxrrrrri",
        target_role: "Full-stack Developer",
        candidate_level: "Junior",
        execution_mode: "api",
        local_install_approved: false,
      },
    });
    const body = await response.json();

    expect(response.status()).toBe(409);
    expect(body.error).toBe("provider_not_ready");
    expect(body.blockers?.length).toBeGreaterThan(0);
  });

  test("seeded demo artifacts cannot be published as public verified profiles", async ({ page }) => {
    await login(page, ACCOUNTS.candidate);

    const response = await page.request.post("/api/profile/publish", {
      data: {
        run_id: ids.runId,
        visibility: "public",
        include_terminal_proof: true,
      },
    });
    const body = await response.json();

    expect(response.status()).toBe(409);
    expect(body.error).toBe("public_profile_blocked");
    expect(body.blockers.map((b: { code: string }) => b.code)).toContain("seeded_demo_profile");
  });
});
