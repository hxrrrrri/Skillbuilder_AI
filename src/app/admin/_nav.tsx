import type { NavLink } from "@/components/role-shell";

export const ADMIN_NAV: NavLink[] = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/runs", label: "Runs" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/profiles", label: "Profiles" },
  { href: "/admin/audit-logs", label: "Audit log" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/agents", label: "Agents" },
];
