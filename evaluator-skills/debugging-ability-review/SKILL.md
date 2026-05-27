---
id: debugging-ability-review
name: Debugging Ability Review
version: 1.0.0
category: debugging
visibility: internal
allowedRoles:
  - admin
  - super_admin
  - system_worker
requiredInputs:
  - repoSnapshot
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

# Debugging Ability Review

## Purpose
Assess visible debugging discipline from tests, errors, logging, commit history, and interview or challenge evidence.

## When To Run
Run when stored terminal proof, issue-fix commits, or interview/challenge answers are available.

## Required Evidence
Use stored command runs, bug-fix commits, error-handling files, tests, or interview answers.

## Forbidden Assumptions
Do not infer debugging skill from final code alone. Do not score without evidence.

## Scoring Rubric
Reward reproducible diagnosis, small fixes, regression tests, and clear error handling.

## Red Flags
Silent catches, broad try/catch blocks, failing proof without follow-up, and vague explanations.

## Strong Signals
Failing test first, narrow fix, verification command, and clear root-cause explanation.

## Output JSON Schema
Return strict EvaluatorSkillOutput JSON with evidence-backed findings.

## Candidate-Safe Summary Rules
Show debugging strengths and next practice actions.

## Employer-Safe Summary Rules
Show interview questions and verified debugging proof only.

## Admin-Only Trace Fields
Raw traces, raw prompts, provider details, and validation errors.
