// Structured target roles + candidate levels for the verification request form.
//
// The landing page and the candidate new-verification wizard post `target_role`
// and `candidate_level` as plain strings (the labels below) so the backend
// contract is unchanged. "Custom Role" / "Custom Level" unlock a free-text path.

export type RoleOption = {
  /** Posted value === label (keeps the backend contract a readable string). */
  label: string;
  /** Extra search terms (frameworks, stacks, synonyms) for the combobox. */
  keywords: string[];
};

export const CUSTOM_ROLE_LABEL = "Custom Role";
export const CUSTOM_LEVEL_LABEL = "Custom Level";

export const TARGET_ROLES: RoleOption[] = [
  { label: "Frontend Developer", keywords: ["ui", "css", "html", "react", "vue", "web", "client"] },
  { label: "Backend Developer", keywords: ["api", "server", "database", "node", "python", "go", "java"] },
  { label: "Full-stack Developer", keywords: ["fullstack", "full stack", "frontend", "backend", "web"] },
  { label: "Mobile Developer", keywords: ["app", "ios", "android", "flutter", "react native"] },
  { label: "Android Developer", keywords: ["kotlin", "java", "mobile", "app"] },
  { label: "iOS Developer", keywords: ["swift", "objective-c", "mobile", "apple", "app"] },
  { label: "React Developer", keywords: ["frontend", "jsx", "hooks", "next", "web"] },
  { label: "Next.js Developer", keywords: ["react", "ssr", "vercel", "frontend", "fullstack"] },
  { label: "Node.js Developer", keywords: ["javascript", "express", "backend", "api", "typescript"] },
  { label: "Python Developer", keywords: ["django", "flask", "fastapi", "backend", "data"] },
  { label: "Django Developer", keywords: ["python", "backend", "web", "orm"] },
  { label: "FastAPI Developer", keywords: ["python", "async", "api", "backend"] },
  { label: "Java Developer", keywords: ["spring", "jvm", "backend", "enterprise"] },
  { label: "Spring Boot Developer", keywords: ["java", "microservices", "backend", "rest"] },
  { label: "Go Developer", keywords: ["golang", "backend", "concurrency", "api"] },
  { label: "Rust Developer", keywords: ["systems", "memory", "backend", "wasm"] },
  { label: "DevOps Engineer", keywords: ["ci", "cd", "docker", "kubernetes", "infra", "terraform"] },
  { label: "Cloud Engineer", keywords: ["aws", "gcp", "azure", "infra", "serverless"] },
  { label: "Data Engineer", keywords: ["etl", "pipeline", "spark", "sql", "warehouse"] },
  { label: "ML Engineer", keywords: ["machine learning", "model", "pytorch", "tensorflow", "ai"] },
  { label: "AI Engineer", keywords: ["llm", "ml", "genai", "agents", "model"] },
  { label: "Security Engineer", keywords: ["appsec", "infosec", "pentest", "vulnerability", "cyber"] },
  { label: "QA Automation Engineer", keywords: ["testing", "playwright", "cypress", "selenium", "qa"] },
  { label: "UI Engineer", keywords: ["design system", "frontend", "css", "components", "accessibility"] },
  { label: "Product Engineer", keywords: ["fullstack", "product", "growth", "frontend", "backend"] },
  { label: "Open Source Maintainer", keywords: ["oss", "community", "library", "contributor"] },
  { label: "Student Developer", keywords: ["learner", "junior", "campus", "beginner"] },
  { label: "Internship Candidate", keywords: ["intern", "trainee", "student", "entry"] },
  { label: CUSTOM_ROLE_LABEL, keywords: ["other", "custom", "free text"] },
];

export const CANDIDATE_LEVELS: string[] = [
  "Beginner",
  "Student",
  "Intern",
  "Junior",
  "Intermediate",
  "Mid-level",
  "Senior",
  "Lead",
  "Principal",
  "Open Source Maintainer",
  CUSTOM_LEVEL_LABEL,
];

export function isCustomRole(label: string): boolean {
  return label === CUSTOM_ROLE_LABEL;
}

export function isCustomLevel(label: string): boolean {
  return label === CUSTOM_LEVEL_LABEL;
}

/**
 * Filter + rank roles for a search query. Matches against the label and the
 * keyword aliases. Empty query returns the full list (Custom Role last).
 */
export function searchRoles(query: string, roles: RoleOption[] = TARGET_ROLES): RoleOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return roles;
  const scored = roles
    .map((role) => {
      const label = role.label.toLowerCase();
      let score = 0;
      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 80;
      else if (label.includes(q)) score = 60;
      else if (role.keywords.some((k) => k.includes(q))) score = 40;
      // also match individual query words against keywords/label
      else if (q.split(/\s+/).some((w) => w.length > 1 && (label.includes(w) || role.keywords.some((k) => k.includes(w))))) score = 20;
      return { role, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.role.label.localeCompare(b.role.label));
  return scored.map((s) => s.role);
}
