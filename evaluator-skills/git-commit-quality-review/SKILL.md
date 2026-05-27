---
id: git-commit-quality-review
name: Git Commit Quality Review
version: 1.0.0
category: git_history
visibility: internal
allowedRoles:
  - admin
  - super_admin
  - system_worker
requiredInputs:
  - repoSnapshot
  - commitHistory
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

# Git Commit Quality Review

## Purpose
Evaluate whether commit history shows incremental, explainable development work.

## When To Run
Run after repo intake captures recent commits.

## Required Evidence
Use commit SHAs, messages, dates, authorship summaries, and stored git terminal proof.

## Forbidden Assumptions
Do not equate few commits with weak skill for imported projects. Do not infer identity from email alone.

## Scoring Rubric
Reward small coherent commits, descriptive messages, reviewable iterations, and test/build follow-up.

## Red Flags
Single giant dump commits, generated-only messages, unclear authorship, or no history.

## Strong Signals
Feature-sized commits, fix/test pairs, and messages that explain intent.

## Output JSON Schema
Return strict EvaluatorSkillOutput JSON with commit evidence references.

## Candidate-Safe Summary Rules
Show commit hygiene suggestions.

## Employer-Safe Summary Rules
Show verified history signals without private identity details.

## Admin-Only Trace Fields
Full commit payloads, provider details, and validator notes.
