import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  run_id: z.string(),
  name: z.string().min(2).max(80).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const run = await prisma.analysisRun.findUnique({
    where: { id: body.run_id },
    include: { repository: true },
  });
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  if (run.status !== "completed") {
    return NextResponse.json({ error: "run_incomplete", status: run.status }, { status: 409 });
  }

  const baseSlug = slugify(`${body.name ?? run.repository.owner}-${run.repository.repoName}`);
  let slug = baseSlug;
  let n = 1;
  while (await prisma.publicProfile.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${n++}`;
  }

  const profile = await prisma.publicProfile.create({
    data: { runId: run.id, slug, visibility: "public" },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.json({ slug: profile.slug, url: `${base}/profile/${profile.slug}` });
}
