import type { NavLink } from "@/components/role-shell";

export const ADMIN_NAV: NavLink[] = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/copilot", label: "Command Copilot", badge: "AI" },
  { href: "/admin/runs", label: "Runs" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/profiles", label: "Profiles" },
  { href: "/admin/evidence", label: "Evidence" },
  { href: "/admin/evaluator-skills", label: "Evaluator skills" },
  { href: "/admin/audit-logs", label: "Audit log" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/providers/health", label: "Provider health" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/prompts", label: "Prompts" },
  { href: "/admin/rubrics", label: "Rubrics" },
  { href: "/admin/security", label: "Security" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/settings", label: "Settings" },
];
