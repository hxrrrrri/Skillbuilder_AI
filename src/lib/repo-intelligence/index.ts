export type RepoFileSummary = {
  path: string;
  size?: number;
  language: string;
  role: "source" | "test" | "config" | "ci" | "docs" | "asset" | "unknown";
};

export type RouteSummary = {
  route: string;
  file: string;
  kind: "next_page" | "next_api" | "api_handler" | "python_web";
  line_start?: number;
};

export type ComponentSummary = {
  name: string;
  file: string;
  exported: boolean;
  line_start?: number;
};

export type FunctionSummary = {
  name: string;
  file: string;
  exported: boolean;
  async: boolean;
  line_start?: number;
};

export type ClassSummary = {
  name: string;
  file: string;
  line_start?: number;
};

export type SchemaSummary = {
  name: string;
  file: string;
  library: "zod" | "prisma" | "pydantic" | "unknown";
  line_start?: number;
};

export type ApiClientSummary = {
  file: string;
  kind: "fetch" | "axios" | "graphql" | "http_client";
  target?: string;
  line_start?: number;
};

export type TestFileSummary = {
  file: string;
  framework?: string;
  cases: string[];
};

export type ConfigFileSummary = {
  file: string;
  kind: string;
  scripts?: Record<string, string>;
};

export type DependencyEdge = {
  from: string;
  to: string;
  kind: "import" | "package";
};

export type RepoRiskFlag = {
  severity: "low" | "medium" | "high";
  reason: string;
  file?: string;
  line_start?: number;
};

export type ServerClientBoundarySummary = {
  serverFiles: string[];
  clientFiles: string[];
  apiFiles: string[];
  sharedFiles: string[];
};

export type EnvConfigSummary = {
  file: string;
  kind: "example" | "committed_env" | "config";
  exposesSecrets: boolean;
};

export type DependencyRiskSummary = {
  packageName: string;
  severity: "low" | "medium" | "high";
  reason: string;
};

export type TestProximitySummary = {
  testFile: string;
  nearestSource: string | null;
  signal: "same_directory" | "same_basename" | "distant" | "unknown";
};

export type CommitActivitySummary = {
  commitCount: number;
  firstCommitAt: string | null;
  lastCommitAt: string | null;
};

export type ContributorSummary = {
  name: string;
  commits: number;
};

export type RepoIntelligenceIndex = {
  files: RepoFileSummary[];
  fileTreeSummary: {
    totalFiles: number;
    sourceFiles: number;
    testFiles: number;
    configFiles: number;
    docsFiles: number;
    ciFiles: number;
    largestFiles: Array<{ path: string; size: number }>;
  };
  languages: Record<string, number>;
  packageManagers: string[];
  frameworks: string[];
  routes: RouteSummary[];
  components: ComponentSummary[];
  functions: FunctionSummary[];
  classes: ClassSummary[];
  schemas: SchemaSummary[];
  apiClients: ApiClientSummary[];
  testFiles: TestFileSummary[];
  configFiles: ConfigFileSummary[];
  ciFiles: string[];
  serverClientBoundaries: ServerClientBoundarySummary;
  prismaSchemaMap: SchemaSummary[];
  envConfigFiles: EnvConfigSummary[];
  dependencyRisks: DependencyRiskSummary[];
  scriptMap: Record<string, string>;
  testToSourceProximity: TestProximitySummary[];
  commitActivity?: CommitActivitySummary;
  contributors?: ContributorSummary[];
  dependencyGraph: DependencyEdge[];
  riskFlags: RepoRiskFlag[];
};

export type IntelligenceFileInput = {
  path: string;
  size?: number;
  type?: "blob" | "tree";
};

export type IntelligenceSnippetInput = {
  path: string;
  content: string;
};

const EXT_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".json": "JSON",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".md": "Markdown",
  ".prisma": "Prisma",
  ".toml": "TOML",
};

function extname(file: string): string {
  const hit = file.match(/\.[^.\/]+$/);
  return hit?.[0].toLowerCase() ?? "";
}

export function languageForPath(file: string): string {
  return EXT_LANGUAGE[extname(file)] ?? "Other";
}

export function roleForPath(file: string): RepoFileSummary["role"] {
  if (/^\.github\/workflows\//i.test(file)) return "ci";
  if (/(^|\/)(__tests__|tests?|e2e|cypress)\//i.test(file) || /\.(test|spec)\.[jt]sx?$/i.test(file) || /test_.*\.py$/i.test(file)) return "test";
  if (/readme|docs?\//i.test(file) || /\.md$/i.test(file)) return "docs";
  if (isConfigPath(file)) return "config";
  if (/\.(png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(file)) return "asset";
  if (/\.(tsx?|jsx?|py|go|rs|java|rb|php|cs|swift|kt)$/i.test(file)) return "source";
  return "unknown";
}

export function isConfigPath(file: string): boolean {
  const name = file.split("/").pop() ?? file;
  return (
    /^(package|tsconfig|jsconfig|next\.config|vite\.config|tailwind\.config|postcss\.config|eslint\.config|vitest\.config|jest\.config|playwright\.config)\./i.test(name) ||
    /^(requirements|pyproject|Pipfile|Dockerfile|docker-compose|go\.mod|Cargo\.toml|prisma\.schema)$/i.test(name) ||
    file === "prisma/schema.prisma" ||
    /^\.?env\.example$/i.test(name)
  );
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

function addUnique<T>(arr: T[], item: T, key: (x: T) => string) {
  const k = key(item);
  if (!arr.some((x) => key(x) === k)) arr.push(item);
}

function routeFromNextFile(file: string): string | null {
  const app = file.match(/^(?:src\/)?app\/(.+)\/(page|route)\.(tsx?|jsx?)$/);
  if (app) {
    const raw = app[1]
      .replace(/\([^)]*\)\//g, "")
      .replace(/\[(\.\.\.)?([^\]]+)\]/g, (_m, dots, name) => (dots ? `*${name}` : `:${name}`));
    return `/${raw === "" ? "" : raw}`.replace(/\/+/g, "/");
  }
  const pages = file.match(/^(?:src\/)?pages\/(.+)\.(tsx?|jsx?)$/);
  if (pages) {
    const raw = pages[1]
      .replace(/^index$/, "")
      .replace(/\/index$/, "")
      .replace(/\[(\.\.\.)?([^\]]+)\]/g, (_m, dots, name) => (dots ? `*${name}` : `:${name}`));
    return `/${raw}`.replace(/\/+/g, "/");
  }
  return null;
}

function detectFrameworksFromPackage(pkg: any): string[] {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const out: string[] = [];
  if (deps.next) out.push("Next.js");
  if (deps.react) out.push("React");
  if (deps.vue) out.push("Vue");
  if (deps.svelte) out.push("Svelte");
  if (deps.express) out.push("Express");
  if (deps.fastify) out.push("Fastify");
  if (deps["@nestjs/core"]) out.push("NestJS");
  if (deps.vitest) out.push("Vitest");
  if (deps.jest) out.push("Jest");
  if (deps.playwright) out.push("Playwright");
  if (deps.cypress) out.push("Cypress");
  if (deps.prisma || deps["@prisma/client"]) out.push("Prisma");
  if (deps.zod) out.push("Zod");
  return out;
}

function parsePackage(content: string): any | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function scanTsJs(snippet: IntelligenceSnippetInput, index: RepoIntelligenceIndex) {
  const { path: file, content } = snippet;
  const importRe = /import(?:\s+type)?(?:[\s\S]*?)\s+from\s+["']([^"']+)["']|require\(["']([^"']+)["']\)/g;
  for (const m of content.matchAll(importRe)) {
    index.dependencyGraph.push({ from: file, to: m[1] || m[2], kind: "import" });
  }

  const fnRe = /(export\s+)?(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  for (const m of content.matchAll(fnRe)) {
    index.functions.push({
      name: m[3],
      file,
      exported: !!m[1],
      async: !!m[2],
      line_start: lineNumberAt(content, m.index ?? 0),
    });
  }

  const constFnRe = /(export\s+)?const\s+([A-Z_a-z$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
  for (const m of content.matchAll(constFnRe)) {
    index.functions.push({
      name: m[2],
      file,
      exported: !!m[1],
      async: /async/.test(m[0]),
      line_start: lineNumberAt(content, m.index ?? 0),
    });
  }

  const classRe = /class\s+([A-Za-z_$][\w$]*)/g;
  for (const m of content.matchAll(classRe)) {
    index.classes.push({ name: m[1], file, line_start: lineNumberAt(content, m.index ?? 0) });
  }

  const componentCandidates = [
    ...content.matchAll(/(export\s+default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g),
    ...content.matchAll(/(export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g),
  ];
  for (const m of componentCandidates) {
    const line = lineNumberAt(content, m.index ?? 0);
    const after = content.slice(m.index ?? 0, (m.index ?? 0) + 900);
    if (!/<[A-Za-z][\w.:-]*/.test(after) && !/React\.createElement/.test(after)) continue;
    addUnique(
      index.components,
      { name: m[2], file, exported: /export/.test(m[0]), line_start: line },
      (x) => `${x.file}:${x.name}`,
    );
  }

  const route = routeFromNextFile(file);
  if (route) {
    index.routes.push({
      route,
      file,
      kind: /route\.[jt]sx?$/.test(file) || /pages\/api\//.test(file) ? "next_api" : "next_page",
      line_start: 1,
    });
  }
  for (const m of content.matchAll(/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\s*\(/g)) {
    index.routes.push({
      route: route ?? file,
      file,
      kind: "api_handler",
      line_start: lineNumberAt(content, m.index ?? 0),
    });
  }

  for (const m of content.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*z\./g)) {
    if (!/(Schema|Body|Params|Input)$/i.test(m[1])) continue;
    index.schemas.push({ name: m[1], file, library: "zod", line_start: lineNumberAt(content, m.index ?? 0) });
  }
  if (/\bprisma\./.test(content) || /@prisma\/client/.test(content)) {
    index.schemas.push({ name: "Prisma usage", file, library: "prisma", line_start: lineNumberAt(content, content.search(/\bprisma\.|@prisma\/client/)) });
  }

  for (const m of content.matchAll(/\b(fetch|axios\.(?:get|post|put|patch|delete)|gql`|GraphQLClient)\b/g)) {
    index.apiClients.push({
      file,
      kind: m[1].startsWith("axios") ? "axios" : m[1] === "fetch" ? "fetch" : "graphql",
      line_start: lineNumberAt(content, m.index ?? 0),
    });
  }

  if (/\beval\s*\(/.test(content)) {
    index.riskFlags.push({ severity: "high", reason: "eval() detected.", file, line_start: lineNumberAt(content, content.search(/\beval\s*\(/)) });
  }
  if (/dangerouslySetInnerHTML/.test(content)) {
    index.riskFlags.push({ severity: "medium", reason: "dangerouslySetInnerHTML needs review.", file, line_start: lineNumberAt(content, content.search(/dangerouslySetInnerHTML/)) });
  }
  if (/console\.log\([^)]*process\.env|JSON\.stringify\(\s*process\.env/.test(content)) {
    index.riskFlags.push({ severity: "high", reason: "process.env logging pattern detected.", file, line_start: lineNumberAt(content, content.search(/process\.env/)) });
  }
}

function scanPython(snippet: IntelligenceSnippetInput, index: RepoIntelligenceIndex) {
  const { path: file, content } = snippet;
  for (const m of content.matchAll(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm)) {
    index.functions.push({
      name: m[1],
      file,
      exported: !m[1].startsWith("_"),
      async: /^async/.test(m[0]),
      line_start: lineNumberAt(content, m.index ?? 0),
    });
  }
  for (const m of content.matchAll(/^class\s+([A-Za-z_]\w*)/gm)) {
    index.classes.push({ name: m[1], file, line_start: lineNumberAt(content, m.index ?? 0) });
  }
  for (const m of content.matchAll(/^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) {
    index.dependencyGraph.push({ from: file, to: m[1] || m[2], kind: "import" });
  }
  for (const m of content.matchAll(/class\s+([A-Za-z_]\w*)\((?:BaseModel|pydantic\.BaseModel)\)/g)) {
    index.schemas.push({ name: m[1], file, library: "pydantic", line_start: lineNumberAt(content, m.index ?? 0) });
  }
  if (/@app\.(get|post|put|patch|delete)\(/.test(content) || /APIRouter\(/.test(content)) {
    index.routes.push({ route: file, file, kind: "python_web", line_start: lineNumberAt(content, content.search(/@app\.|APIRouter\(/)) });
  }
  if (/Flask\(__name__\)/.test(content) || /fastapi/i.test(content) || /django/i.test(content)) {
    if (/fastapi/i.test(content)) addUnique(index.frameworks, "FastAPI", (x) => x);
    if (/Flask\(__name__\)/.test(content)) addUnique(index.frameworks, "Flask", (x) => x);
    if (/django/i.test(content)) addUnique(index.frameworks, "Django", (x) => x);
  }
}

function scanTests(snippet: IntelligenceSnippetInput, index: RepoIntelligenceIndex) {
  const role = roleForPath(snippet.path);
  if (role !== "test") return;
  const cases = [
    ...snippet.content.matchAll(/\b(?:describe|it|test)\s*\(\s*["'`]([^"'`]+)["'`]/g),
    ...snippet.content.matchAll(/^def\s+(test_[A-Za-z_]\w*)\s*\(/gm),
  ].map((m) => m[1]).slice(0, 20);
  let framework: string | undefined;
  if (/vitest|vi\.|describe\(/.test(snippet.content)) framework = "Vitest/Jest";
  if (/pytest|def\s+test_/.test(snippet.content)) framework = "pytest";
  if (/playwright|@playwright/.test(snippet.content)) framework = "Playwright";
  index.testFiles.push({ file: snippet.path, framework, cases });
}

function scanConfig(snippet: IntelligenceSnippetInput, index: RepoIntelligenceIndex) {
  if (!isConfigPath(snippet.path)) return;
  const kind = snippet.path.split("/").pop() ?? snippet.path;
  const config: ConfigFileSummary = { file: snippet.path, kind };
  if (kind === "package.json") {
    const pkg = parsePackage(snippet.content);
    if (pkg?.scripts) config.scripts = pkg.scripts;
    if (pkg?.scripts) {
      for (const key of ["test", "test:ci", "build", "typecheck", "type-check", "lint"]) {
        if (typeof pkg.scripts[key] === "string") index.scriptMap[key] = pkg.scripts[key];
      }
    }
    for (const fw of detectFrameworksFromPackage(pkg)) addUnique(index.frameworks, fw, (x) => x);
    const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
    for (const [dep, version] of Object.entries(deps)) {
      index.dependencyGraph.push({ from: "package.json", to: dep, kind: "package" });
      if (String(version).includes("*") || String(version).toLowerCase().includes("latest")) {
        index.dependencyRisks.push({ packageName: dep, severity: "medium", reason: "Unpinned wildcard/latest dependency version." });
      }
      if (["eval", "serialize-javascript", "vm2"].includes(dep)) {
        index.dependencyRisks.push({ packageName: dep, severity: "high", reason: "Dependency commonly needs security review." });
      }
    }
  }
  index.configFiles.push(config);
}

function boundaryForPath(file: string): keyof ServerClientBoundarySummary | null {
  if (/^(?:src\/)?app\/.*\/route\.(tsx?|jsx?)$/.test(file) || /^(?:src\/)?pages\/api\//.test(file)) return "apiFiles";
  if (/(^|\/)(server|actions|middleware)\.(tsx?|jsx?)$/.test(file) || /server-only|\.server\./.test(file)) return "serverFiles";
  if (/\.client\.(tsx?|jsx?)$/.test(file)) return "clientFiles";
  return null;
}

function inferTestProximity(files: RepoFileSummary[]): TestProximitySummary[] {
  const sources = files.filter((f) => f.role === "source").map((f) => f.path);
  const tests = files.filter((f) => f.role === "test").map((f) => f.path);
  return tests.slice(0, 120).map((testFile) => {
    const dir = testFile.split("/").slice(0, -1).join("/");
    const base = testFile.split("/").pop()?.replace(/\.(test|spec)\.[^.]+$/i, "").replace(/^test_/, "") ?? "";
    const sameBase = sources.find((s) => s.split("/").pop()?.replace(/\.[^.]+$/, "") === base);
    if (sameBase) return { testFile, nearestSource: sameBase, signal: "same_basename" };
    const sameDir = sources.find((s) => s.startsWith(dir ? `${dir}/` : ""));
    if (sameDir) return { testFile, nearestSource: sameDir, signal: "same_directory" };
    return { testFile, nearestSource: sources[0] ?? null, signal: sources.length ? "distant" : "unknown" };
  });
}

export function buildRepoIntelligenceIndex(input: {
  files: IntelligenceFileInput[];
  snippets?: IntelligenceSnippetInput[];
}): RepoIntelligenceIndex {
  const blobs = input.files.filter((f) => f.type !== "tree");
  const index: RepoIntelligenceIndex = {
    files: [],
    fileTreeSummary: {
      totalFiles: 0,
      sourceFiles: 0,
      testFiles: 0,
      configFiles: 0,
      docsFiles: 0,
      ciFiles: 0,
      largestFiles: [],
    },
    languages: {},
    packageManagers: [],
    frameworks: [],
    routes: [],
    components: [],
    functions: [],
    classes: [],
    schemas: [],
    apiClients: [],
    testFiles: [],
    configFiles: [],
    ciFiles: [],
    serverClientBoundaries: { serverFiles: [], clientFiles: [], apiFiles: [], sharedFiles: [] },
    prismaSchemaMap: [],
    envConfigFiles: [],
    dependencyRisks: [],
    scriptMap: {},
    testToSourceProximity: [],
    dependencyGraph: [],
    riskFlags: [],
  };

  for (const f of blobs) {
    const language = languageForPath(f.path);
    const role = roleForPath(f.path);
    index.files.push({ path: f.path, size: f.size, language, role });
    index.languages[language] = (index.languages[language] ?? 0) + (f.size ?? 1);
    if (/^\.github\/workflows\//i.test(f.path)) index.ciFiles.push(f.path);
    if (f.path === "package-lock.json") addUnique(index.packageManagers, "npm", (x) => x);
    if (f.path === "pnpm-lock.yaml") addUnique(index.packageManagers, "pnpm", (x) => x);
    if (f.path === "yarn.lock") addUnique(index.packageManagers, "yarn", (x) => x);
    if (f.path === "bun.lockb" || f.path === "bun.lock") addUnique(index.packageManagers, "bun", (x) => x);
    if (/\.env($|\.)/i.test(f.path)) {
      index.envConfigFiles.push({
        file: f.path,
        kind: /\.env\.example$/i.test(f.path) ? "example" : "committed_env",
        exposesSecrets: !/\.env\.example$/i.test(f.path),
      });
    }
    if (/\.env($|\.)/i.test(f.path) && !/\.env\.example$/i.test(f.path)) {
      index.riskFlags.push({ severity: "high", reason: "Environment file appears committed.", file: f.path });
    }
    if (/^(?:src\/)?app\/.*\/page\.(tsx?|jsx?)$/.test(f.path) || /^(?:src\/)?components\//.test(f.path)) {
      addUnique(index.serverClientBoundaries.sharedFiles, f.path, (x) => x);
    }
    const boundary = boundaryForPath(f.path);
    if (boundary) addUnique(index.serverClientBoundaries[boundary], f.path, (x) => x);
    const route = routeFromNextFile(f.path);
    if (route && !index.routes.some((r) => r.file === f.path)) {
      index.routes.push({ route, file: f.path, kind: /route\.[jt]sx?$/.test(f.path) || /pages\/api\//.test(f.path) ? "next_api" : "next_page" });
    }
  }

  if (blobs.some((f) => /^(?:src\/)?app\//.test(f.path) || /next\.config\./.test(f.path))) addUnique(index.frameworks, "Next.js", (x) => x);
  if (blobs.some((f) => /manage\.py$/.test(f.path))) addUnique(index.frameworks, "Django", (x) => x);
  if (blobs.some((f) => /prisma\/schema\.prisma$/.test(f.path))) addUnique(index.frameworks, "Prisma", (x) => x);
  if (blobs.some((f) => /Dockerfile$|docker-compose\.ya?ml$/i.test(f.path))) addUnique(index.frameworks, "Docker", (x) => x);

  for (const snippet of input.snippets ?? []) {
    scanConfig(snippet, index);
    scanTests(snippet, index);
    if (/\.(tsx?|jsx?|mjs|cjs)$/i.test(snippet.path)) scanTsJs(snippet, index);
    if (/\.py$/i.test(snippet.path)) scanPython(snippet, index);
    if (/sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}/.test(snippet.content)) {
      index.riskFlags.push({ severity: "high", reason: "Possible committed credential pattern.", file: snippet.path });
    }
    for (const m of snippet.content.matchAll(/\b(TODO|FIXME|HACK)\b[: ]?(.{0,100})/gi)) {
      index.riskFlags.push({
        severity: m[1].toLowerCase() === "hack" ? "medium" : "low",
        reason: `${m[1].toUpperCase()} marker: ${m[2]?.trim() || "review required"}`,
        file: snippet.path,
        line_start: lineNumberAt(snippet.content, m.index ?? 0),
      });
    }
  }

  index.fileTreeSummary = {
    totalFiles: index.files.length,
    sourceFiles: index.files.filter((f) => f.role === "source").length,
    testFiles: index.files.filter((f) => f.role === "test").length,
    configFiles: index.files.filter((f) => f.role === "config").length,
    docsFiles: index.files.filter((f) => f.role === "docs").length,
    ciFiles: index.files.filter((f) => f.role === "ci").length,
    largestFiles: index.files
      .filter((f) => typeof f.size === "number")
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .slice(0, 12)
      .map((f) => ({ path: f.path, size: f.size ?? 0 })),
  };
  index.prismaSchemaMap = index.schemas.filter((s) => s.library === "prisma");
  index.testToSourceProximity = inferTestProximity(index.files);

  index.components = index.components.slice(0, 80);
  index.functions = index.functions.slice(0, 160);
  index.classes = index.classes.slice(0, 80);
  index.schemas = index.schemas.slice(0, 80);
  index.apiClients = index.apiClients.slice(0, 80);
  index.dependencyGraph = index.dependencyGraph.slice(0, 300);
  index.dependencyRisks = index.dependencyRisks.slice(0, 80);
  index.riskFlags = index.riskFlags.slice(0, 160);
  return index;
}
