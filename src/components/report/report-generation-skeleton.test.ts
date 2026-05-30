import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AgentTimelineSkeleton,
  EvidenceLockerSkeleton,
  GeneratingReportPanel,
  InterviewSkeleton,
  ProfileReportSkeleton,
  RepoIntelligenceSkeleton,
  SkillGraphSkeleton,
  TerminalProofSkeleton,
  ValidationContractSkeleton,
} from "./report-generation-skeleton";

describe("GeneratingReportPanel", () => {
  it("renders live, real-event-driven report-generation state", () => {
    const out = renderToStaticMarkup(
      createElement(GeneratingReportPanel, {
        stageLabel: "repo scanning",
        completedAgents: 6,
        totalAgents: 8,
        progressPercent: 75,
        activeAgent: "Repo Scanner",
        statusMessage: "Cloning repository…",
        providerMode: "api · worker",
        elapsedMs: 65000,
        workerLabel: "Worker active",
        workerTone: "good",
      }),
    );
    expect(out).toContain("Generating verified report");
    expect(out).toContain("repo scanning");
    expect(out).toContain("75%");
    expect(out).toContain("Repo Scanner");
    expect(out).toContain("6/8 agents complete");
    expect(out).toContain("Cloning repository");
    expect(out).toContain("1m 5s"); // elapsed formatting
  });
});

describe("section skeletons", () => {
  it("renders an animated repo-intelligence skeleton", () => {
    const out = renderToStaticMarkup(createElement(RepoIntelligenceSkeleton));
    expect(out).toContain("sp-skel");
    expect(out).toContain("Scanning repository");
  });

  it("renders the agent-timeline skeleton with an active glowing card", () => {
    const out = renderToStaticMarkup(createElement(AgentTimelineSkeleton, { count: 3 }));
    expect(out).toContain("sp-agent-glow");
    expect(out).toContain("Dispatching evaluator agents");
  });

  it("keeps report section placeholders animated while analysis is running", () => {
    const skeletons = [
      ValidationContractSkeleton,
      EvidenceLockerSkeleton,
      SkillGraphSkeleton,
      TerminalProofSkeleton,
      InterviewSkeleton,
      ProfileReportSkeleton,
    ];
    for (const Skeleton of skeletons) {
      expect(renderToStaticMarkup(createElement(Skeleton))).toContain("sp-skel");
    }
  });
});
