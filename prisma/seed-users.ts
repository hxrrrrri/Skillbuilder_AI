/**
 * Seeds local development accounts for each role. Idempotent — safe to re-run.
 * Run with: npm run db:seed-users
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEEDED_PASSWORD = "demo1234";

type SeededUser = {
  email: string;
  name: string;
  role: "candidate" | "employer" | "college_admin" | "admin" | "super_admin";
  githubUsername?: string;
  tenant?: { slug: string; name: string; kind: "college" | "employer" | "platform" };
};

const USERS: SeededUser[] = [
  {
    email: "candidate@skillproof.dev",
    name: "Casey Candidate",
    role: "candidate",
    githubUsername: "casey-candidate",
  },
  {
    email: "employer@skillproof.dev",
    name: "Erin Employer",
    role: "employer",
    tenant: { slug: "acme-corp", name: "Acme Corp", kind: "employer" },
  },
  {
    email: "college@skillproof.dev",
    name: "Dean Devi",
    role: "college_admin",
    tenant: { slug: "abc-college", name: "ABC College of Engineering", kind: "college" },
  },
  {
    email: "admin@skillproof.dev",
    name: "Alex Admin",
    role: "admin",
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(SEEDED_PASSWORD, 10);

  for (const u of USERS) {
    let tenantId: string | null = null;
    if (u.tenant) {
      const tenant = await prisma.tenant.upsert({
        where: { slug: u.tenant.slug },
        update: { name: u.tenant.name, kind: u.tenant.kind },
        create: { slug: u.tenant.slug, name: u.tenant.name, kind: u.tenant.kind },
      });
      tenantId = tenant.id;
    }

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        primaryTenantId: tenantId,
        githubUsername: u.githubUsername ?? null,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
        primaryTenantId: tenantId,
        githubUsername: u.githubUsername ?? null,
      },
    });

    if (tenantId) {
      await prisma.tenantMembership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId } },
        update: { role: "admin" },
        create: { userId: user.id, tenantId, role: "admin" },
      });
    }

    if (u.role === "candidate") {
      await prisma.candidate.upsert({
        where: { userId: user.id },
        update: {
          name: u.name,
          email: u.email,
          githubUsername: u.githubUsername ?? null,
        },
        create: {
          userId: user.id,
          name: u.name,
          email: u.email,
          githubUsername: u.githubUsername ?? null,
        },
      });
    }

    console.log(`  - ${u.email}  [${u.role}]${tenantId ? `  tenant=${u.tenant!.slug}` : ""}`);
  }

  console.log(`\nDone. Password for every local seeded account: ${SEEDED_PASSWORD}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
