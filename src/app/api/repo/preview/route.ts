import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepoMeta, getTree, getFile } from "@/lib/github";
import { getCurrentUser } from "@/lib/auth/session";
import { parseRepoUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  repo_url: z.string().url(),
});

function detectPackageManager(paths: string[]): string | null {
  if (paths.includes("pnpm-lock.yaml")) return "pnpm";
  if (paths.includes("yarn.lock")) return "yarn";
  if (paths.includes("bun.lockb") || paths.includes("bun.lock")) return "bun";
  if (paths.includes("package-lock.json") || paths.includes("package.json")) return "npm";
  if (paths.includes("requirements.txt")) return "pip";
  if (paths.includes("poetry.lock")) return "poetry";
  if (paths.includes("Pipfile.lock")) return "pipenv";
  return null;
}

function detectFramework(packageJson: string | null, paths: string[]): string | null {
  if (packageJson) {
    const deps = packageJson.toLowerCase();
    if (deps.includes('"next"')) return "Next.js";
    if (deps.includes('"react"')) return "React";
    if (deps.includes('"vue"')) return "Vue";
    if (deps.includes('"svelte"')) return "Svelte";
    if (deps.includes('"express"')) return "Express";
    if (deps.includes('"fastify"')) return "Fastify";
  }
  if (paths.some((p) => p === "go.mod")) return "Go";
  if (paths.some((p) => p === "Cargo.toml")) return "Rust";
  if (paths.some((p) => p === "pyproject.toml" || p === "requirements.txt")) return "Python";
  return null;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message ?? "bad input" }, { status: 400 });
  }

  const parsed = parseRepoUrl(body.repo_url);
  if (!parsed) return NextResponse.json({ error: "invalid_repo_url" }, { status: 400 });

  try {
    const meta = await getRepoMeta(parsed.owner, parsed.repo);
    const tree = await getTree(parsed.owner, parsed.repo, meta.defaultBranch);
    const paths = tree.filter((t) => t.type === "blob").map((t) => t.path);
    const packageJson = paths.includes("package.json")
      ? await getFile(parsed.owner, parsed.repo, "package.json", meta.defaultBranch)
      : null;

    return NextResponse.json({
      repo: {
        owner: meta.owner,
        name: meta.name,
        full_name: `${meta.owner}/${meta.name}`,
        default_branch: meta.defaultBranch,
        language: meta.language,
        description: meta.description,
        last_updated: meta.updatedAt,
        created_at: meta.createdAt,
        visibility: meta.visibility ?? "public",
        public_access: meta.publicAccess ?? true,
        stars: meta.stargazers,
        forks: meta.forks,
        size_kb: meta.size,
      },
      detected: {
        package_manager: detectPackageManager(paths),
        framework: detectFramework(packageJson, paths),
        has_tests: paths.some((p) => /(__tests__\/|\.test\.|\.spec\.|cypress\/|e2e\/|tests?\/)/i.test(p)),
        has_ci: paths.some((p) => /^\.github\/workflows\//i.test(p)),
        has_prisma: paths.some((p) => p === "prisma/schema.prisma"),
        files_indexed: paths.length,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "repo_preview_failed",
        message: err?.message ?? "GitHub repository could not be read.",
      },
      { status: 502 },
    );
  }
}
