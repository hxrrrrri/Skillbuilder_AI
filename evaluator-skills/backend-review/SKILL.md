---
id: backend-review
name: Backend Review
version: 1.0.0
category: backend
visibility: internal
allowedRoles:
  - admin
  - super_admin
  - system_worker
requiredInputs:
  - repoSnapshot
  - selectedFiles
  - dependencyFiles
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

# Backend Review

## Purpose
Assess API boundaries, validation, data access, error handling, and service structure.

## When To Run
Run when backend files, API routes, server actions, controllers, services, or schemas are detected.

## Required Evidence
Use server files, route handlers, schemas, configs, and tests.

## Forbidden Assumptions
Do not claim reliability, security, or throughput without concrete evidence.

## Scoring Rubric
Reward validation, typed boundaries, clear data access, idempotency, and error handling.

## Red Flags
Unauthenticated sensitive endpoints, raw SQL concatenation, missing validation, and hidden secrets.

## Strong Signals
Schema validation, service boundaries, clear errors, and tests around server behavior.

## Output JSON Schema
Return strict EvaluatorSkillOutput JSON.

## Candidate-Safe Summary Rules
Show targeted backend improvement steps.

## Employer-Safe Summary Rules
Show verified backend signals and follow-up questions.

## Admin-Only Trace Fields
Raw prompts, parsed output, provider details, and validator trace.
