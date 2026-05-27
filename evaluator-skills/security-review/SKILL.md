---
id: security-review
name: Security Review
version: 1.0.0
category: security
visibility: internal
allowedRoles:
  - admin
  - super_admin
  - system_worker
requiredInputs:
  - repoSnapshot
  - fileTree
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

# Security Review

## Purpose
Identify visible security hygiene signals from code and config: secrets, input validation, auth boundaries, dependency/config risks, and unsafe patterns.

## When To Run
Run after static repo evidence is available. This is a lightweight prototype review, not a full vulnerability assessment.

## Required Evidence
Every security claim must cite an existing file, dependency/config file, or stored terminal command run. Secret-like strings must be redacted.

## Forbidden Assumptions
Do not invent CVEs, runtime exploitability, compliance posture, or production breach risk from incomplete snippets.

## Scoring Rubric
High scores require visible validation and no high-risk patterns. Medium scores show reasonable hygiene with gaps. Low scores reflect committed secrets, missing validation, or unsafe command/config patterns.

## Red Flags
Hard-coded tokens, unsafe eval/command execution, raw SQL concatenation, unauthenticated sensitive APIs, and unredacted private data.

## Strong Signals
Schema validation, least-privilege config, auth checks on sensitive routes, redaction, and safe error handling.

## Output JSON Schema
Return strict EvaluatorSkillOutput JSON with redacted findings and severity.

## Candidate-Safe Summary Rules
Show actionable hygiene improvements. Never reveal secret values or raw private output.

## Employer-Safe Summary Rules
Show verified risk categories and confidence, not exploit recipes or secrets.

## Admin-Only Trace Fields
Raw parsed output after redaction, provider/model metadata, prompt version, validation notes, and denied references.
