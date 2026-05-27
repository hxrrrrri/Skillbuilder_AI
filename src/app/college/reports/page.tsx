import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { COLLEGE_NAV } from "../_nav";
import { getCollegePageContext } from "../_auth";
import { buildCollegeReport } from "@/lib/college/tenant";

export const dynamic = "force-dynamic";

export default async function CollegeReportsPage() {
  const { scope, noTenant } = await getCollegePageContext("/college/reports");
  if (noTenant || !scope) {
    return (
      <RoleShell title="Reports" subtitle="Export tenant-scoped verification summaries." navLinks={COLLEGE_NAV} activeHref="/college/reports">
        <ScaffoldNotice title="No tenant" detail="Your account is not associated with a college tenant yet." />
      </RoleShell>
    );
  }

  const preview = await buildCollegeReport(scope, "md");

  return (
    <RoleShell title="Reports" subtitle="Export tenant-scoped verification summaries." navLinks={COLLEGE_NAV} activeHref="/college/reports">
      <Card>
        <CardHeader>
          <CardTitle>Exports</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-3">
            <a href="/api/college/reports?format=csv"><Button type="button">Download CSV</Button></a>
            <a href="/api/college/reports?format=md"><Button type="button" variant="outline">Download Markdown</Button></a>
          </div>
          <pre className="mt-4 max-h-96 overflow-auto rounded-md border border-border bg-bg/60 p-4 text-xs text-muted">
            {preview}
          </pre>
        </CardBody>
      </Card>
    </RoleShell>
  );
}
