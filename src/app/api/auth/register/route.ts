import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { writeAuditLog } from "@/lib/auth/audit";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(160).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8).max(200),
  role: z.enum(["candidate", "employer", "college_admin"]),
  tenant_name: z.string().min(2).max(120).optional(),
  github_username: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  if ((body.role === "employer" || body.role === "college_admin") && !body.tenant_name) {
    return NextResponse.json({ error: "tenant_name_required" }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.password);

  const result = await prisma.$transaction(async (tx) => {
    let tenantId: string | null = null;
    if (body.tenant_name) {
      const kind = body.role === "employer" ? "employer" : "college";
      const baseSlug = slugify(body.tenant_name) || "tenant";
      let slug = baseSlug;
      let i = 1;
      while (await tx.tenant.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${i++}`;
      }
      const tenant = await tx.tenant.create({
        data: { slug, name: body.tenant_name, kind },
      });
      tenantId = tenant.id;
    }

    const user = await tx.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        role: body.role,
        primaryTenantId: tenantId,
        githubUsername: body.github_username ?? null,
      },
    });

    if (tenantId) {
      await tx.tenantMembership.create({
        data: { userId: user.id, tenantId, role: "admin" },
      });
    }

    if (body.role === "candidate") {
      await tx.candidate.create({
        data: {
          userId: user.id,
          name: body.name,
          email: body.email,
          githubUsername: body.github_username ?? null,
        },
      });
    }

    return { user, tenantId };
  });

  await writeAuditLog({
    action: "user.register",
    actorUserId: result.user.id,
    tenantId: result.tenantId,
    targetType: "user",
    targetId: result.user.id,
    metadata: { role: body.role },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ user_id: result.user.id, role: body.role });
}
