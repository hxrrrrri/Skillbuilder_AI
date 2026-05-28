/**
 * Seeds local development accounts for each role. Idempotent — safe to re-run.
 * Run with: npm run db:seed-users
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEMO_COHORT_NAME,
  DEMO_PROFILE_SLUG,
  DEMO_REPO,
  DEMO_SHORTLIST_NAME,
  buildDemoRunArtifacts,
  buildDemoSkillScores,
  measuredDemoScores,
} from "../src/lib/demo-data";

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

const DEMO_COMPLETED_AT = new Date("2026-05-24T12:00:00.000Z");
const DEMO_STARTED_AT = new Date(DEMO_COMPLETED_AT.getTime() - 14 * 60 * 1000);

const DEMO_AGENT_SEQUENCE = [
  "orchestrator",
  "repo-scanner",
  "architecture",
  "code-quality",
  "testing",
  "security",
  "ai-collaboration",
  "git-evidence",
  "documentation",
  "authenticity",
  "interview-gen",
  "answer-evaluator",
  "ai-collaboration-evaluator",
  "validator",
  "skill-graph",
  "employer-verifier",
  "improvement-plan",
  "profile-gen",
] as const;

const DEMO_EVALUATOR_SKILLS = [
  "repo-architecture-review",
  "code-quality-review",
  "testing-depth-review",
  "security-review",
  "debugging-ability-review",
  "ai-collaboration-review",
  "git-commit-quality-review",
  "system-design-review",
  "frontend-review",
  "backend-review",
  "database-review",
  "devops-readiness-review",
] as const;

function hashFor(label: string) {
  return `demo-${label}-hash`;
}

async function ensureDemoEvaluatorSkills() {
  for (const slug of DEMO_EVALUATOR_SKILLS) {
    await prisma.evaluatorSkill.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        name: slug.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
        category: "demo",
        version: "1.0.0",
        description: "Seeded evaluator skill placeholder. The registry seed overwrites this from SKILL.md manifests.",
        sourcePath: `evaluator-skills/${slug}/SKILL.md`,
        enabled: true,
        riskLevel: "low",
        requiredInputsJson: "[]",
        outputSchemaJson: "{}",
        toolPermissionsJson: "[]",
        candidateSafe: true,
        employerSafe: true,
        adminOnly: false,
      },
    });
  }
}

async function resetDemoRunChildren(runId: string) {
  await prisma.evidenceFinding.deleteMany({ where: { runId } });
  await prisma.skillRun.deleteMany({ where: { runId } });
  await prisma.skillScore.deleteMany({ where: { runId } });
  await prisma.interviewQuestion.deleteMany({ where: { runId } });
  await prisma.agentEvent.deleteMany({ where: { runId } });
  await prisma.harnessContextSnapshot.deleteMany({ where: { runId } });
  await prisma.terminalCommandRun.deleteMany({ where: { runId } });
  await prisma.ownershipChallenge.deleteMany({ where: { runId } });
  await prisma.auditLog.deleteMany({ where: { targetType: "demo_run", targetId: runId } });
}

async function seedDemoTerminalRuns(runId: string, actorUserId: string) {
  const rows = [
    {
      key: "typecheck",
      command: "npm run typecheck",
      stdoutSummary: "tsc --noEmit completed without TypeScript errors.",
      usedFor: "typecheck",
      durationMs: 4100,
    },
    {
      key: "test",
      command: "npm test",
      stdoutSummary: "Vitest completed cart reducer and order service tests.",
      usedFor: "testing",
      durationMs: 5300,
    },
    {
      key: "build",
      command: "npm run build",
      stdoutSummary: "Next.js production build completed. Public output is summarized and redacted.",
      usedFor: "build",
      durationMs: 18100,
    },
  ] as const;

  const ids: Record<string, string> = {};
  const terminalEvidence = [];
  for (const row of rows) {
    const created = await prisma.terminalCommandRun.create({
      data: {
        command: row.command,
        args: null,
        cwd: ".skillproof/runs/demo-skillproof-commerce",
        exitCode: 0,
        stdoutSummary: row.stdoutSummary,
        stderrSummary: "",
        durationMs: row.durationMs,
        outputHash: hashFor(row.key),
        usedFor: row.usedFor,
        ranAt: new Date(DEMO_STARTED_AT.getTime() + Object.keys(ids).length * 2 * 60 * 1000),
        actorUserId,
        runId,
        savedAsEvidence: true,
      },
    });
    ids[row.key] = created.id;
    terminalEvidence.push({
      commandRunId: created.id,
      command: row.command,
      cwd: ".skillproof/runs/demo-skillproof-commerce",
      exitCode: 0,
      stdoutSummary: row.stdoutSummary,
      stderrSummary: "",
      durationMs: row.durationMs,
      usedFor: row.usedFor,
      statusLabel: "passed",
      outputSha256: hashFor(row.key),
      redactionWarning: false,
      evidenceSource: "sandbox_terminal",
      includeInReport: true,
    });
  }
  return { ids, terminalEvidence };
}

function eventOutput(agentName: string, scoreEvidence: Array<{ file?: string; reason: string; source?: string }>) {
  const evidence = scoreEvidence.slice(0, 2).map((item) => ({
    file: item.file,
    source: item.source ?? "llm",
    reason: item.reason,
  }));
  return JSON.stringify({
    agent: agentName,
    completed: [`${agentName.replace(/-/g, "_")}_completed`],
    unresolved: agentName === "testing" ? ["Browser E2E proof not supplied in demo seed."] : [],
    evidence,
    issues_found: agentName === "testing" ? ["Testing score capped because E2E evidence is missing."] : [],
    next_recommended: null,
    output: {
      demo_data: true,
      evidence,
      strengths: evidence.map((item) => item.reason).slice(0, 2),
    },
  });
}

async function seedDemoSkillRuns(runId: string) {
  const skillRunIds: Record<string, string> = {};
  for (let index = 0; index < DEMO_EVALUATOR_SKILLS.length; index++) {
    const slug = DEMO_EVALUATOR_SKILLS[index];
    const created = await prisma.skillRun.create({
      data: {
        runId,
        skillId: slug,
        skillVersion: "1.0.0",
        agentId: DEMO_AGENT_SEQUENCE[Math.min(index + 2, DEMO_AGENT_SEQUENCE.length - 1)],
        providerId: index < 2 ? "anthropic_api" : index % 4 === 0 ? "deterministic" : "anthropic_api",
        requestedModel: index < 2 ? "claude-opus-4-7" : "claude-sonnet-4-6",
        actualModel: index < 2 ? "claude-opus-4-7" : "claude-sonnet-4-6",
        status: "completed",
        startedAt: new Date(DEMO_STARTED_AT.getTime() + index * 30_000),
        endedAt: new Date(DEMO_STARTED_AT.getTime() + index * 30_000 + 18_000),
        durationMs: 18_000,
        inputHash: hashFor(`${slug}-input`),
        outputHash: hashFor(`${slug}-output`),
        evidenceIdsJson: "[]",
        promptVersionId: null,
        toolPermissionsJson: JSON.stringify(["repo_read", "public_safe_summary"]),
        tokenUsageJson: JSON.stringify({ input: 1200 + index * 50, output: 420 + index * 12 }),
        costEstimateJson: JSON.stringify({ currency: "USD", estimated: Number((0.01 + index * 0.002).toFixed(3)) }),
        fallbackReason: null,
        retryHistoryJson: "[]",
        error: null,
        adminTraceJson: JSON.stringify({ demo_data: true, provider: index % 4 === 0 ? "deterministic" : "anthropic_api" }),
        candidateSummary: "Seeded demo skill run completed with public-safe evidence.",
        employerSummary: "Evidence-backed demo signal is available for employer inspection.",
      },
    });
    skillRunIds[slug] = created.id;
  }
  return skillRunIds;
}

async function seedJudgeDemo() {
  const [candidateUser, employerUser, collegeUser, adminUser] = await Promise.all([
    prisma.user.findUnique({ where: { email: "candidate@skillproof.dev" } }),
    prisma.user.findUnique({ where: { email: "employer@skillproof.dev" } }),
    prisma.user.findUnique({ where: { email: "college@skillproof.dev" } }),
    prisma.user.findUnique({ where: { email: "admin@skillproof.dev" } }),
  ]);
  if (!candidateUser || !employerUser || !collegeUser || !adminUser) {
    throw new Error("Seeded demo users missing; cannot create judge demo data.");
  }

  const collegeTenant = await prisma.tenant.upsert({
    where: { slug: "abc-college" },
    update: {
      name: "ABC College of Engineering",
      kind: "college",
      metadata: JSON.stringify({ demo_data: true, purpose: "hackathon judge walkthrough" }),
    },
    create: {
      slug: "abc-college",
      name: "ABC College of Engineering",
      kind: "college",
      metadata: JSON.stringify({ demo_data: true, purpose: "hackathon judge walkthrough" }),
    },
  });
  await prisma.user.update({ where: { id: collegeUser.id }, data: { primaryTenantId: collegeTenant.id } });
  await prisma.tenantMembership.upsert({
    where: { userId_tenantId: { userId: collegeUser.id, tenantId: collegeTenant.id } },
    update: { role: "admin" },
    create: { userId: collegeUser.id, tenantId: collegeTenant.id, role: "admin" },
  });

  const candidate = await prisma.candidate.upsert({
    where: { userId: candidateUser.id },
    update: {
      name: "Casey Candidate",
      email: "candidate@skillproof.dev",
      githubUsername: DEMO_REPO.owner,
    },
    create: {
      userId: candidateUser.id,
      name: "Casey Candidate",
      email: "candidate@skillproof.dev",
      githubUsername: DEMO_REPO.owner,
    },
  });

  const cohort = await prisma.cohort.upsert({
    where: { tenantId_name: { tenantId: collegeTenant.id, name: DEMO_COHORT_NAME } },
    update: {
      year: 2026,
      notes: "Seeded demo cohort for judge walkthroughs. Contains public-safe aggregate data only.",
    },
    create: {
      tenantId: collegeTenant.id,
      name: DEMO_COHORT_NAME,
      year: 2026,
      notes: "Seeded demo cohort for judge walkthroughs. Contains public-safe aggregate data only.",
    },
  });
  await prisma.cohortStudent.upsert({
    where: { cohortId_candidateId: { cohortId: cohort.id, candidateId: candidate.id } },
    update: {},
    create: { cohortId: cohort.id, candidateId: candidate.id },
  });

  const existingRepo = await prisma.repository.findFirst({
    where: { candidateId: candidate.id, repoUrl: DEMO_REPO.url },
  });
  const repository = existingRepo
    ? await prisma.repository.update({
        where: { id: existingRepo.id },
        data: {
          repoName: DEMO_REPO.name,
          owner: DEMO_REPO.owner,
          primaryLanguage: "TypeScript",
          framework: "Next.js",
          analyzedAt: DEMO_COMPLETED_AT,
        },
      })
    : await prisma.repository.create({
        data: {
          candidateId: candidate.id,
          repoUrl: DEMO_REPO.url,
          repoName: DEMO_REPO.name,
          owner: DEMO_REPO.owner,
          primaryLanguage: "TypeScript",
          framework: "Next.js",
          analyzedAt: DEMO_COMPLETED_AT,
        },
      });

  const existingProfile = await prisma.publicProfile.findUnique({
    where: { slug: DEMO_PROFILE_SLUG },
    select: { id: true, runId: true },
  });
  const existingDemoRun = existingProfile
    ? await prisma.analysisRun.findUnique({ where: { id: existingProfile.runId } })
    : await prisma.analysisRun.findFirst({
        where: {
          candidateId: candidate.id,
          repoId: repository.id,
          statusMessage: { contains: "DEMO DATA" },
        },
      });

  const run = existingDemoRun
    ? await prisma.analysisRun.update({
        where: { id: existingDemoRun.id },
        data: {
          candidateId: candidate.id,
          createdByUserId: candidateUser.id,
          tenantId: collegeTenant.id,
          repoId: repository.id,
        },
      })
    : await prisma.analysisRun.create({
        data: {
          candidateId: candidate.id,
          createdByUserId: candidateUser.id,
          tenantId: collegeTenant.id,
          repoId: repository.id,
          targetRole: "Full-stack Developer",
          candidateLevel: "Junior",
          status: "completed",
          executionMode: "hybrid",
        },
      });

  await ensureDemoEvaluatorSkills();
  await resetDemoRunChildren(run.id);
  const terminal = await seedDemoTerminalRuns(run.id, candidateUser.id);
  const artifacts = buildDemoRunArtifacts();
  const demoScores = buildDemoSkillScores({ terminalCommandRunIds: terminal.ids });

  await prisma.analysisRun.update({
    where: { id: run.id },
    data: {
      targetRole: "Full-stack Developer",
      candidateLevel: "Junior",
      jobDescription: "Seeded judge demo: junior full-stack developer proof profile.",
      status: "completed",
      statusMessage: "DEMO DATA: Seeded completed run for hackathon judging. Start a live run to verify a real repository.",
      overallScore: 82,
      roleFit: "Strong junior full-stack fit with verified ownership, interview evidence, AI-collaboration evidence, and terminal proof.",
      verificationLevel: "repo_interview_verified",
      tokenEstimateRaw: 18400,
      tokenEstimateUsed: 6200,
      validationContract: artifacts.validationContract,
      contextPack: artifacts.contextPack,
      repoIntelligence: artifacts.repoIntelligence,
      validationCoverage: artifacts.validationCoverage,
      validationSummary: artifacts.validationSummary,
      authenticitySignals: artifacts.authenticitySignals,
      improvementPlan: artifacts.improvementPlan,
      employerVerifier: artifacts.employerVerifier,
      aiCollaboration: artifacts.aiCollaboration,
      profileSummary: artifacts.profileSummary,
      executionMode: "hybrid",
      localInstallApproved: true,
      terminalEvidence: JSON.stringify(terminal.terminalEvidence),
      providerMatrix: artifacts.providerMatrix,
      ownershipStatus: artifacts.ownershipStatus,
      completedAt: DEMO_COMPLETED_AT,
    },
  });

  await prisma.harnessContextSnapshot.create({
    data: {
      runId: run.id,
      repoUrl: DEMO_REPO.url,
      repoOwner: DEMO_REPO.owner,
      repoName: DEMO_REPO.name,
      defaultBranch: "main",
      commitSha: "d3m0c0mm17demo",
      fileTreeHash: hashFor("file-tree"),
      selectedFilesHash: hashFor("selected-files"),
      packageManager: "npm",
      runtimeDetected: "node",
      frameworkDetected: "Next.js",
      testFrameworkDetected: "Vitest",
      lockfileDetected: true,
      executionMode: "hybrid",
      workerMode: "seeded_demo",
      terminalEnabled: true,
      sandboxed: true,
      evaluatorRuntimeVersion: "seeded-demo-v1",
      validatorVersion: "seeded-validator-v1",
    },
  });

  const firstEvidence = measuredDemoScores(demoScores)
    .flatMap((scoreItem) => JSON.parse(scoreItem.evidence) as Array<{ file?: string; reason: string; source?: string }>)
    .slice(0, 12);
  for (let index = 0; index < DEMO_AGENT_SEQUENCE.length; index++) {
    const agentName = DEMO_AGENT_SEQUENCE[index];
    await prisma.agentEvent.create({
      data: {
        runId: run.id,
        agentName,
        status: "completed",
        startedAt: new Date(DEMO_STARTED_AT.getTime() + index * 36_000),
        completedAt: new Date(DEMO_STARTED_AT.getTime() + index * 36_000 + 24_000),
        output: eventOutput(agentName, firstEvidence.slice(index % Math.max(firstEvidence.length, 1))),
        notes: "Seeded demo event. Live runs regenerate this from providers and deterministic scanners.",
        order: index + 1,
      },
    });
  }

  const skillRunIds = await seedDemoSkillRuns(run.id);
  for (const scoreItem of demoScores) {
    await prisma.skillScore.create({
      data: {
        runId: run.id,
        skillName: scoreItem.skillName,
        score: scoreItem.score,
        confidence: scoreItem.confidence,
        scoreSource: scoreItem.scoreSource,
        evidence: scoreItem.evidence,
        validatorNotes: scoreItem.validatorNotes,
      },
    });
  }

  const questions = [
    {
      question: "In src/lib/orders/service.ts, how does the order workflow avoid duplicate records after a payment retry?",
      sourceFile: "src/lib/orders/service.ts",
      lineStart: 41,
      lineEnd: 64,
      expectedSignals: ["idempotency", "transaction boundary", "error path", "test coverage"],
      redFlags: ["Vague answer not tied to service code", "Claims retry safety without naming persistence behavior"],
      answer: "The retry path checks the existing pending order state before writing a new record, then only advances status after the provider result is accepted. I would test the failed-payment branch and the retry branch together.",
      answerScore: 86,
      feedback: "Strong file-specific explanation with a concrete test strategy.",
      dimensionScores: {
        communication: 88,
        debugging: 84,
        architecture_explanation: 86,
        testing_reasoning: 84,
        understanding_of_own_code: 88,
      },
    },
    {
      question: "Why is cart behavior modeled in a reducer instead of scattered component state?",
      sourceFile: "src/lib/cart/reducer.ts",
      lineStart: 11,
      lineEnd: 58,
      expectedSignals: ["state transition clarity", "testability", "component simplification"],
      redFlags: ["Cannot explain reducer tradeoff", "No mention of tests"],
      answer: "The reducer makes every state transition explicit, so the form and summary components do not duplicate quantity logic. It also makes edge cases easy to test without rendering the whole checkout page.",
      answerScore: 89,
      feedback: "Clear own-code explanation and testing rationale.",
      dimensionScores: {
        communication: 90,
        debugging: 84,
        architecture_explanation: 88,
        testing_reasoning: 90,
        understanding_of_own_code: 92,
      },
    },
    {
      question: "What is the first browser-level test you would add before calling this checkout flow production-ready?",
      sourceFile: "src/app/checkout/page.tsx",
      lineStart: 1,
      lineEnd: 40,
      expectedSignals: ["E2E path", "checkout happy path", "failure state", "proof command"],
      redFlags: ["Only mentions unit tests", "No user-visible acceptance path"],
      answer: "I would add a Playwright test that adds an item, submits checkout, verifies order confirmation, and separately asserts the failed-payment message. I would save the command hash as terminal evidence.",
      answerScore: 84,
      feedback: "Good testing reasoning and connection to terminal proof.",
      dimensionScores: {
        communication: 84,
        debugging: 82,
        architecture_explanation: 80,
        testing_reasoning: 88,
        understanding_of_own_code: 86,
      },
    },
  ];
  for (const q of questions) {
    await prisma.interviewQuestion.create({
      data: {
        runId: run.id,
        question: q.question,
        sourceFile: q.sourceFile,
        lineStart: q.lineStart,
        lineEnd: q.lineEnd,
        expectedSignals: JSON.stringify(q.expectedSignals),
        redFlags: JSON.stringify(q.redFlags),
        scoringRubric: JSON.stringify({
          communication: "Clear, specific, and concise.",
          debugging: "Names failure mode and isolation strategy.",
          architecture_explanation: "Explains tradeoffs and boundaries.",
          testing_reasoning: "Names relevant automated proof.",
          understanding_of_own_code: "References actual files and behavior.",
        }),
        answer: q.answer,
        answerScore: q.answerScore,
        feedback: q.feedback,
        dimensionScores: JSON.stringify(q.dimensionScores),
      },
    });
  }

  let evidenceIndex = 0;
  for (const scoreItem of measuredDemoScores(demoScores)) {
    const scoreEvidence = JSON.parse(scoreItem.evidence) as Array<{
      file?: string;
      line_start?: number;
      line_end?: number;
      reason: string;
      source?: string;
      command_run_id?: string;
    }>;
    for (const item of scoreEvidence) {
      evidenceIndex++;
      await prisma.evidenceFinding.create({
        data: {
          runId: run.id,
          skillRunId:
            scoreItem.skillName === "Architecture"
              ? skillRunIds["repo-architecture-review"]
              : scoreItem.skillName === "Testing"
                ? skillRunIds["testing-depth-review"]
                : scoreItem.skillName === "AI Collaboration"
                  ? skillRunIds["ai-collaboration-review"]
                  : null,
          category: scoreItem.skillName,
          claim: item.reason,
          evidenceType: item.source ?? scoreItem.scoreSource,
          filePath: item.file && !item.file.startsWith("git:") ? item.file : null,
          lineStart: item.line_start ?? null,
          lineEnd: item.line_end ?? null,
          commitSha: "d3m0c0mm17demo",
          commandRunId: item.command_run_id ?? null,
          confidence: scoreItem.confidence,
          severity: scoreItem.skillName === "Security" ? "medium" : "low",
          candidateSafe: true,
          employerSafe: true,
          publicSafe: true,
          adminOnly: false,
          redactedText: item.reason,
          rawTextHash: hashFor(`evidence-${evidenceIndex}`),
        },
      });
    }
  }

  const profile = await prisma.publicProfile.upsert({
    where: { slug: DEMO_PROFILE_SLUG },
    update: {
      candidateId: candidate.id,
      ownerUserId: candidateUser.id,
      runId: run.id,
      visibility: "public",
      includeTerminalProof: true,
      interviewKit: null,
    },
    create: {
      candidateId: candidate.id,
      ownerUserId: candidateUser.id,
      runId: run.id,
      slug: DEMO_PROFILE_SLUG,
      visibility: "public",
      includeTerminalProof: true,
    },
  });

  const shortlist = await prisma.employerShortlist.findFirst({
    where: { ownerUserId: employerUser.id, name: DEMO_SHORTLIST_NAME },
  }) ?? await prisma.employerShortlist.create({
    data: {
      ownerUserId: employerUser.id,
      tenantId: employerUser.primaryTenantId,
      name: DEMO_SHORTLIST_NAME,
      notes: "Seeded shortlist for the employer judge flow.",
    },
  });
  await prisma.employerShortlistItem.upsert({
    where: { shortlistId_publicProfileId: { shortlistId: shortlist.id, publicProfileId: profile.id } },
    update: { position: 1, note: "Seeded demo candidate. Clearly marked as demo data." },
    create: {
      shortlistId: shortlist.id,
      publicProfileId: profile.id,
      position: 1,
      note: "Seeded demo candidate. Clearly marked as demo data.",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: adminUser.id,
      tenantId: collegeTenant.id,
      action: "demo.seeded",
      targetType: "demo_run",
      targetId: run.id,
      metadata: JSON.stringify({
        profile_slug: DEMO_PROFILE_SLUG,
        evidence_backed_scores: measuredDemoScores(demoScores).length,
        demo_data: true,
      }),
    },
  });

  console.log(`  - demo run/profile  [${DEMO_PROFILE_SLUG}]`);
}

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
        passwordHash,
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

  await seedJudgeDemo();

  console.log(`\nDone. Password for every local seeded account: ${SEEDED_PASSWORD}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
