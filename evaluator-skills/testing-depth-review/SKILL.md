---
id: testing-depth-review
name: Testing Depth Review
version: 1.0.0
category: testing
visibility: internal
allowedRoles:
  - admin
  - super_admin
  - system_worker
requiredInputs:
  - repoSnapshot
  - fileTree
  - selectedFiles
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

# Testing Depth Review

## Purpose
Evaluate whether the repository contains meaningful tests and whether any terminal proof supports the test claims.

## When To Run
Run after repo scanner detects test files, CI config, package scripts, and any stored terminal command runs.

## Required Evidence
Use test file paths, CI workflow files, package scripts, or stored TerminalCommandRun IDs. Terminal evidence must link to an existing stored command run.

## Forbidden Assumptions
Do not claim tests passed unless a stored command run shows exit code 0. Do not infer coverage percentages without coverage evidence.

## Scoring Rubric
High scores require relevant tests for critical paths plus passing terminal or CI evidence. Medium scores have tests but weak breadth. Low scores lack tests or show failing proof.

## Red Flags
No tests, tests that only render smoke paths, failing test commands, or CI absent for a project that claims readiness.

## Strong Signals
Unit and integration tests, edge-case assertions, CI workflows, test scripts, and passing stored proof.

## Output JSON Schema
Return EvaluatorSkillOutput JSON with test evidence findings, confidence, interview questions, and improvement actions.

## Candidate-Safe Summary Rules
Show what tests exist and which tests to add next. Hide full terminal output unless explicitly candidate-safe.

## Employer-Safe Summary Rules
Show test proof count, pass/fail summary, and role-relevant follow-ups. Do not expose private terminal output.

## Admin-Only Trace Fields
Raw command summaries, parser errors, prompt metadata, provider/model details, and validator trace.
