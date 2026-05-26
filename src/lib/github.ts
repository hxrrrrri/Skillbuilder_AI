// Selective GitHub fetch. Token-efficient: never sends full repo to LLM.
// Uses public REST API. Optional GITHUB_TOKEN raises rate limit 60→5000/hr.

const GH = "https://api.github.com";

type Headers = Record<string, string>;

function headers(): Headers {
  const h: Headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "skillproof-ai",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export type RepoMeta = {
  name: string;
  owner: string;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  stargazers: number;
  forks: number;
  size: number; // KB
  createdAt: string;
  updatedAt: string;
  topics: string[];
};

export type TreeEntry = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

export type Commit = {
  sha: string;
  message: string;
  author: string | null;
  date: string;
};

export async function getRepoMeta(owner: string, repo: string): Promise<RepoMeta> {
  const r = await fetch(`${GH}/repos/${owner}/${repo}`, { headers: headers() });
  if (!r.ok) throw new Error(`GitHub repo fetch failed: ${r.status} ${r.statusText}`);
  const d = await r.json();
  return {
    name: d.name,
    owner: d.owner.login,
    defaultBranch: d.default_branch,
    description: d.description,
    language: d.language,
    stargazers: d.stargazers_count,
    forks: d.forks_count,
    size: d.size,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    topics: d.topics ?? [],
  };
}

export async function getTree(owner: string, repo: string, branch: string): Promise<TreeEntry[]> {
  const r = await fetch(`${GH}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
    headers: headers(),
  });
  if (!r.ok) throw new Error(`GitHub tree fetch failed: ${r.status}`);
  const d = await r.json();
  return (d.tree as any[]).map((e) => ({ path: e.path, type: e.type, size: e.size }));
}

export async function getFile(owner: string, repo: string, path: string, ref?: string): Promise<string | null> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const r = await fetch(`${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}${q}`, {
    headers: headers(),
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (d.encoding === "base64" && typeof d.content === "string") {
    return Buffer.from(d.content, "base64").toString("utf8");
  }
  return null;
}

export async function getCommits(owner: string, repo: string, per_page = 30): Promise<Commit[]> {
  const r = await fetch(`${GH}/repos/${owner}/${repo}/commits?per_page=${per_page}`, {
    headers: headers(),
  });
  if (!r.ok) return [];
  const d = await r.json();
  return (d as any[]).map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? null,
    date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
  }));
}

// Heuristic ranking of important source files. Caps output for token budget.
export function rankImportantFiles(tree: TreeEntry[], max = 6): string[] {
  const SKIP = /(node_modules|dist|build|\.next|coverage|vendor|\.git|\.cache)\//;
  const CODE = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|cs|swift|kt)$/i;
  const PRIORITY = [
    "src/app",
    "src/pages",
    "src/components",
    "src/lib",
    "src/api",
    "app/",
    "pages/",
    "lib/",
    "server/",
    "routes/",
    "controllers/",
    "services/",
  ];

  const blobs = tree.filter((e) => e.type === "blob" && !SKIP.test(e.path) && CODE.test(e.path));

  const scored = blobs.map((b) => {
    let score = 0;
    for (const p of PRIORITY) if (b.path.startsWith(p)) score += 10;
    if (/index\.(ts|tsx|js)$/.test(b.path)) score += 4;
    if (/page\.tsx?$/.test(b.path)) score += 5;
    if (/route\.tsx?$/.test(b.path)) score += 5;
    if (/main\.(py|go|rs)$/.test(b.path)) score += 5;
    if ((b.size ?? 0) > 200 && (b.size ?? 0) < 12000) score += 3;
    return { path: b.path, score, size: b.size ?? 0 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.path);
}

export function detectConfigFiles(tree: TreeEntry[]): string[] {
  const names = new Set([
    "package.json",
    "tsconfig.json",
    "requirements.txt",
    "pyproject.toml",
    "Pipfile",
    "go.mod",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    "Dockerfile",
    "docker-compose.yml",
    "vercel.json",
    "next.config.mjs",
    "next.config.js",
    "vite.config.ts",
    "tailwind.config.ts",
    "tailwind.config.js",
  ]);
  return tree.filter((e) => e.type === "blob" && names.has(e.path.split("/").pop() ?? "")).map((e) => e.path);
}

export function detectTestFiles(tree: TreeEntry[]): string[] {
  const RE = /(__tests__\/|\.test\.|\.spec\.|cypress\/|e2e\/|tests?\/)/i;
  return tree.filter((e) => e.type === "blob" && RE.test(e.path)).map((e) => e.path);
}

export function detectCIFiles(tree: TreeEntry[]): string[] {
  return tree
    .filter((e) => e.type === "blob" && /^\.github\/workflows\//i.test(e.path))
    .map((e) => e.path);
}

export function detectReadme(tree: TreeEntry[]): string | null {
  const r = tree.find((e) => e.type === "blob" && /^readme(\.|$)/i.test(e.path));
  return r?.path ?? null;
}
