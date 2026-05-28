import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-static";

const LEADERBOARD = [
  { name: "Anika R.", overall: 84, role: "Full-stack", level: "Senior intern", strong: "Architecture" },
  { name: "Rahul S.", overall: 79, role: "Frontend", level: "Junior", strong: "Code Quality" },
  { name: "Mira P.", overall: 76, role: "Backend", level: "Junior", strong: "Testing" },
  { name: "Karthik V.", overall: 72, role: "Full-stack", level: "Trainee", strong: "Git Workflow" },
  { name: "Devika J.", overall: 70, role: "Frontend", level: "Trainee", strong: "Documentation" },
  { name: "Arjun T.", overall: 65, role: "Backend", level: "Trainee", strong: "Security" },
];

const DIST = [
  { dim: "Architecture", avg: 68 },
  { dim: "Code Quality", avg: 65 },
  { dim: "Testing", avg: 48 },
  { dim: "Security", avg: 55 },
  { dim: "Git Workflow", avg: 60 },
  { dim: "Documentation", avg: 50 },
];

export default function CampusPreview() {
  return (
    <div className="space-y-8">
      <header>
        <Badge tone="warn" className="mb-2">Preview · sample data</Badge>
        <h1 className="text-3xl font-bold">Campus / Placement dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          What a college admin or training cell sees when a cohort of students publishes SkillProof
          profiles. Numbers below are illustrative, not from real students.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Students analyzed</div>
            <div className="mt-1 text-3xl font-bold">128</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Placement-ready</div>
            <div className="mt-1 text-3xl font-bold text-accent">42</div>
            <div className="text-xs text-muted">Score ≥ 75</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Weak testing</div>
            <div className="mt-1 text-3xl font-bold text-warn">71</div>
            <div className="text-xs text-muted">Testing &lt; 50</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Weak Git workflow</div>
            <div className="mt-1 text-3xl font-bold text-warn">53</div>
            <div className="text-xs text-muted">Git &lt; 50</div>
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Strongest frontend candidates</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2 text-sm">
              {LEADERBOARD.filter((c) => c.role === "Frontend").map((c) => (
                <li key={c.name} className="flex items-center justify-between rounded border border-border bg-panel/70 px-3 py-2">
                  <span>{c.name} <span className="text-xs text-muted">· {c.level}</span></span>
                  <Badge tone="good">{c.overall}/100</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Strongest backend candidates</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2 text-sm">
              {LEADERBOARD.filter((c) => c.role === "Backend").map((c) => (
                <li key={c.name} className="flex items-center justify-between rounded border border-border bg-panel/70 px-3 py-2">
                  <span>{c.name} <span className="text-xs text-muted">· {c.level}</span></span>
                  <Badge tone="good">{c.overall}/100</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Candidate leaderboard</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="p-2 text-left">Candidate</th>
                    <th className="p-2 text-left">Role</th>
                    <th className="p-2 text-left">Level</th>
                    <th className="p-2 text-left">Strongest</th>
                    <th className="p-2 text-left">Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {LEADERBOARD.map((c) => (
                    <tr key={c.name} className="border-t border-border">
                      <td className="p-2 text-ink">{c.name}</td>
                      <td className="p-2 text-muted">{c.role}</td>
                      <td className="p-2 text-muted">{c.level}</td>
                      <td className="p-2 text-muted">{c.strong}</td>
                      <td className="p-2"><Badge tone="good">{c.overall}/100</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Skill distribution (avg across cohort)</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="space-y-2">
              {DIST.map((d) => (
                <div key={d.dim}>
                  <div className="flex justify-between text-xs text-muted">
                    <span>{d.dim}</span>
                    <span>{d.avg}/100</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
                    <div className="h-full bg-gradient-to-r from-accent to-accent2" style={{ width: `${d.avg}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      <p className="text-xs text-muted">
        Note: This page renders a static product preview. The real dashboard is gated behind a separate
        org-aware build and not part of this hackathon prototype.
      </p>
    </div>
  );
}
