import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBadgeSecret, verifyBadge } from "@/lib/badge-signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tier(score: number | null): { label: string; fill: string } {
  if (score == null) return { label: "pending", fill: "#6b7280" };
  if (score >= 80) return { label: "verified", fill: "#16a34a" };
  if (score >= 60) return { label: "developing", fill: "#ca8a04" };
  return { label: "early", fill: "#dc2626" };
}

function renderSvg(label: string, valueText: string, fill: string): string {
  const labelW = 78;
  const valueW = 140;
  const totalW = labelW + valueW;
  const h = 28;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${h}" role="img" aria-label="${esc(label)}: ${esc(valueText)}">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="a"><rect width="${totalW}" height="${h}" rx="4" fill="#fff"/></clipPath>
  <g clip-path="url(#a)">
    <path fill="#374151" d="M0 0h${labelW}v${h}H0z"/>
    <path fill="${fill}" d="M${labelW} 0h${valueW}v${h}H${labelW}z"/>
    <path fill="url(#b)" d="M0 0h${totalW}v${h}H0z"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="ui-sans-serif,Verdana,Geneva,sans-serif" font-size="12">
    <text x="${labelW / 2}" y="18" fill="#111" fill-opacity=".3">${esc(label)}</text>
    <text x="${labelW / 2}" y="17">${esc(label)}</text>
    <text x="${labelW + valueW / 2}" y="18" fill="#111" fill-opacity=".3">${esc(valueText)}</text>
    <text x="${labelW + valueW / 2}" y="17">${esc(valueText)}</text>
  </g>
</svg>`;
}

function notFoundSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="28"><rect width="220" height="28" fill="#1f2937" rx="4"/><text x="110" y="18" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="12" fill="#fca5a5">SkillProof: not found</text></svg>`;
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const parts = params.path ?? [];
  const last = parts[parts.length - 1] ?? "";
  const dot = last.lastIndexOf(".");
  const ext = dot >= 0 ? last.slice(dot + 1).toLowerCase() : "svg";
  const slug = dot >= 0 ? last.slice(0, dot) : last;

  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  const secret = getBadgeSecret();
  const sig = new URL(req.url).searchParams.get("sig");
  if (secret) {
    if (!verifyBadge(slug, sig)) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  }

  const profile = await prisma.publicProfile.findUnique({
    where: { slug },
    include: {
      run: {
        select: {
          overallScore: true,
          verificationLevel: true,
          targetRole: true,
          completedAt: true,
          createdAt: true,
        },
      },
      candidate: { select: { name: true, githubUsername: true } },
    },
  });

  const isMissingOrHidden = !profile || profile.visibility === "private";

  if (ext === "json") {
    if (isMissingOrHidden) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const verifiedAt = profile.run.completedAt ?? profile.run.createdAt;
    return NextResponse.json(
      {
        slug: profile.slug,
        score: profile.run.overallScore,
        verification_level: profile.run.verificationLevel,
        target_role: profile.run.targetRole,
        visibility: profile.visibility,
        candidate: profile.candidate
          ? { name: profile.candidate.name, github_username: profile.candidate.githubUsername }
          : null,
        verified_at: verifiedAt.toISOString(),
        schema_version: "skillproof.badge.v1",
      },
      { headers: { "Cache-Control": "public, max-age=120" } },
    );
  }

  if (ext !== "svg") {
    return NextResponse.json({ error: "unsupported_format", supported: ["svg", "json"] }, { status: 400 });
  }

  if (isMissingOrHidden) {
    return new NextResponse(notFoundSvg(), {
      status: 404,
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const score = profile.run.overallScore;
  const t = tier(score);
  const valueText = score == null ? "pending" : `${score}/100 · ${t.label}`;
  const svg = renderSvg("SkillProof", valueText, t.fill);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
