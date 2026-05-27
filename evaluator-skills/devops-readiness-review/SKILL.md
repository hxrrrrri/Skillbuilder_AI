---
id: devops-readiness-review
name: DevOps Readiness Review
version: 1.0.0
category: devops
visibility: internal
allowedRoles:
  - admin
  - super_admin
  - system_worker
requiredInputs:
  - repoSnapshot
  - fileTree
  - terminalCommandRuns
produces:
  - evidenceFindings
  - scoreDelta
  - interviewSignals
  - improvementPlanItems
toolPermissions:
  filesystem: read_only
  terminal: none
  github: public_read
  network: disabled
  mcp: disabled
  secrets: never_expose
riskLevel: low
---

# DevOps Readiness Review

## Purpose
Assess deployment, CI, environment, container, and operational readiness signals visible in the repository.

## When To Run
Run after file tree, config scan, CI scan, and stored terminal proof are available.

## Required Evidence
Use CI files, Docker files, package scripts, environment examples, deployment configs, and stored command runs.

## Forbidden Assumptions
Do not claim production deployment, uptime, or cloud posture without direct evidence.

## Scoring Rubric
Reward reproducible builds, CI checks, env documentation, deployment configs, and safe secret handling.

## Red Flags
No env documentation, committed secrets, missing build scripts, and unverified deployment claims.

## Strong Signals
CI workflows, Dockerfile, deploy config, sample env, and passing build proof.

## Output JSON Schema
Return strict EvaluatorSkillOutput JSON.

## Candidate-Safe Summary Rules
Show setup and deployment-readiness next steps.

## Employer-Safe Summary Rules
Show verified operational signals and confidence.

## Admin-Only Trace Fields
Raw prompts, parsed output, provider metadata, and validator notes.
