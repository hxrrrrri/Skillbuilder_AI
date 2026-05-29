import { NextResponse } from "next/server";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import {
  listAgentConfigs,
  listProviderConfigs,
} from "@/lib/providers/registry";
import { checkProviderReadinessForMode } from "@/lib/providers/provider-router";
import { buildCopilotContext } from "@/lib/copilot/context";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  const url = new URL(req.url);
  const page = url.searchParams.get("page");

  const context = await buildCopilotContext(
    { mode: "admin", page, user: auth.user },
    {
      listProviderConfigs,
      listAgentConfigs,
      checkReadiness: (m) => checkProviderReadinessForMode(m),
      platformOverviewSnapshot,
    },
  );
  return NextResponse.json({ context });
}

async function platformOverviewSnapshot() {
  const [usersByRole, candidates, profilesByVisibility, runsByStatus, tenantsByKind, cohorts] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } } as any),
    prisma.candidate.count(),
    prisma.publicProfile.groupBy({ by: ["visibility"], _count: { _all: true } } as any),
    prisma.analysisRun.groupBy({ by: ["status"], _count: { _all: true } } as any),
    prisma.tenant.groupBy({ by: ["kind"], _count: { _all: true } } as any),
    prisma.cohort.count(),
  ]);
  return {
    usersByRole: Object.fromEntries((usersByRole as any[]).map((r) => [r.role, r._count._all])),
    candidates,
    profilesByVisibility: Object.fromEntries((profilesByVisibility as any[]).map((r) => [r.visibility, r._count._all])),
    runsByStatus: Object.fromEntries((runsByStatus as any[]).map((r) => [r.status, r._count._all])),
    tenantsByKind: Object.fromEntries((tenantsByKind as any[]).map((r) => [r.kind, r._count._all])),
    cohorts,
  };
}
