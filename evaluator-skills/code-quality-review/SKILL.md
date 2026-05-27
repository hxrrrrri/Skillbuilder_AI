---
id: code-quality-review
name: Code Quality Review
version: 1.0.0
category: code_quality
visibility: internal
allowedRoles:
  - admin
  - super_admin
  - system_worker
requiredInputs:
  - repoSnapshot
  - fileTree
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

# Code Quality Review

## Purpose
Evaluate whether the candidate writes maintainable, understandable code with bounded responsibilities, clear naming, reasonable typing, and low accidental complexity.

## When To Run
Run after repo intake has produced a file tree, selected source snippets, detected stack metadata, and a candidate-safe profile context.

## Required Evidence
Every claim must cite an existing file from the repo snapshot or a stored terminal command run. Prefer direct source files over broad folder observations.

## Forbidden Assumptions
Do not infer seniority, production readiness, or team experience from style alone. Do not score code paths that were not present in the selected files.

## Scoring Rubric
Strong scores require cohesive modules, descriptive names, low duplication, typed interfaces where available, and clear error handling. Penalize large unbounded functions, unclear side effects, weak validation, and unsupported claims.

## Red Flags
Scores above 85 require multiple concrete findings. Any score without evidence must be rejected. Hallucinated file references must be recorded.

## Strong Signals
Small modules, typed boundaries, readable tests around core behavior, domain-specific names, and simple control flow.

## Output JSON Schema
Return an EvaluatorSkillOutput object with evidenceFindings, scoreDelta, interviewQuestions, improvementPlan, candidateSafeSummary, employerSafeSummary, publicSafeSummary, and optional adminNotes.

## Candidate-Safe Summary Rules
Show practical strengths and next actions. Hide raw prompts, raw model output, private snippets, provider traces, and admin-only reasoning.

## Employer-Safe Summary Rules
Show evidence-backed maintainability signals, confidence, red flags, and interview prompts. Do not reveal private terminal output or admin traces.

## Admin-Only Trace Fields
Provider, model, prompt version, input hash, output hash, raw parsed JSON, fallback reason, retries, and validation errors.
