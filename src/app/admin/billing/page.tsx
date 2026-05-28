import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../_nav";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  await requireAdminPage("/admin/billing");
  const subscriptions = await prisma.subscription.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <RoleShell
      title="Billing"
      subtitle="Subscription ledger and current billing integration state."
      navLinks={ADMIN_NAV}
      activeHref="/admin/billing"
    >
      <ScaffoldNotice
        title="Billing integration not connected"
        detail="The Subscription table is visible for audit readiness. Stripe SDK calls, webhooks, and plan-gated features are not enabled in this prototype."
      />

      <Card>
        <CardHeader>
          <CardTitle>Subscription rows ({subscriptions.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {subscriptions.length === 0 ? (
            <ScaffoldNotice detail="No subscriptions in the table yet. Insert a row to test the schema." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Owner user</th>
                    <th className="py-2 pr-3">Tenant</th>
                    <th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Period end</th>
                    <th className="py-2 pr-3">Stripe sub id</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscriptions.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 pr-3 font-mono text-xs">{s.ownerUserId}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{s.tenantId ?? "—"}</td>
                      <td className="py-2 pr-3 text-xs">
                        <Badge>{s.plan}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        <Badge tone={s.status === "active" ? "good" : s.status === "past_due" ? "bad" : "default"}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-muted">
                        {s.stripeSubscriptionId ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
