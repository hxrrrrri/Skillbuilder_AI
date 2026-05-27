---
id: database-review
name: Database Review
version: 1.0.0
category: database
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

# Database Review

## Purpose
Evaluate schema design, migrations, query safety, and data access boundaries visible in the repo.

## When To Run
Run when Prisma, SQL, ORM schemas, migrations, or database config files are detected.

## Required Evidence
Use schema files, migrations, query files, config files, and tests.

## Forbidden Assumptions
Do not infer data volume, indexes, or production correctness without visible schema or migration evidence.

## Scoring Rubric
Reward normalized-enough models, migrations, constraints, safe queries, and clear ownership boundaries.

## Red Flags
Missing constraints, raw concatenated SQL, no migrations, or committed database files with sensitive data.

## Strong Signals
Migrations, indexes/constraints, typed models, and tests around persistence.

## Output JSON Schema
Return strict EvaluatorSkillOutput JSON.

## Candidate-Safe Summary Rules
Show practical data-model improvements.

## Employer-Safe Summary Rules
Show verified persistence signals and interview prompts.

## Admin-Only Trace Fields
Raw prompts, parsed output, provider details, and validation notes.
