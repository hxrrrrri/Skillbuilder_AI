import { describe, expect, it } from "vitest";
import { buildRepoIntelligenceIndex } from ".";

describe("buildRepoIntelligenceIndex", () => {
  it("detects package manager, Next routes, components, schemas, tests, and risks", () => {
    const index = buildRepoIntelligenceIndex({
      files: [
        { path: "package.json", type: "blob" },
        { path: "pnpm-lock.yaml", type: "blob" },
        { path: "src/app/api/users/route.ts", type: "blob" },
        { path: "src/components/ProfileCard.tsx", type: "blob" },
        { path: "src/lib/user.test.ts", type: "blob" },
        { path: ".github/workflows/ci.yml", type: "blob" },
      ],
      snippets: [
        {
          path: "package.json",
          content: JSON.stringify({
            scripts: { test: "vitest", build: "next build" },
            dependencies: { next: "14.0.0", react: "18.0.0", zod: "3.0.0" },
            devDependencies: { vitest: "2.0.0" },
          }),
        },
        {
          path: "src/app/api/users/route.ts",
          content: `import { z } from "zod";
const Body = z.object({ name: z.string() });
export async function POST(req: Request) { return fetch("/api"); }`,
        },
        {
          path: "src/components/ProfileCard.tsx",
          content: `export function ProfileCard() { return <section>Profile</section>; }`,
        },
        {
          path: "src/lib/user.test.ts",
          content: `describe("user", () => { it("works", () => expect(true).toBe(true)); });`,
        },
      ],
    });

    expect(index.packageManagers).toContain("pnpm");
    expect(index.frameworks).toContain("Next.js");
    expect(index.routes.some((r) => r.route === "/api/users")).toBe(true);
    expect(index.components.some((c) => c.name === "ProfileCard")).toBe(true);
    expect(index.schemas.some((s) => s.library === "zod")).toBe(true);
    expect(index.apiClients.some((a) => a.kind === "fetch")).toBe(true);
    expect(index.testFiles[0].cases).toContain("user");
    expect(index.ciFiles).toContain(".github/workflows/ci.yml");
  });
});

