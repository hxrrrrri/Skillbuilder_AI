---
id: system-design-review
name: System Design Review
version: 1.0.0
category: system_design
visibility: internal
allowedRoles:
  - admin
  - super_admin
  - system_worker
requiredInputs:
  - repoSnapshot
  - selectedFiles
  - candidateProfile
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

# System Design Review

## Purpose
Identify visible design tradeoffs, scalability boundaries, and service/data contracts in the project.

## When To Run
Run for backend, full-stack, platform, or senior-target role evaluations.

## Required Evidence
Use architecture files, API routes, schemas, queues, caches, docs, or config files.

## Forbidden Assumptions
Do not claim scale, reliability, or production traffic without evidence.

## Scoring Rubric
Reward explicit boundaries, clear data flow, resilient failure handling, and documented tradeoffs.

## Red Flags
Global mutable state, hidden dependencies, weak error boundaries, and unsupported scale claims.

## Strong Signals
Schemas, idempotent flows, clear interfaces, and operational notes.

## Output JSON Schema
Return strict EvaluatorSkillOutput JSON.

## Candidate-Safe Summary Rules
Show design strengths and focused next improvements.

## Employer-Safe Summary Rules
Show evidence-backed design signals and interview prompts.

## Admin-Only Trace Fields
Raw prompts, parsed JSON, provider details, and validation notes.
