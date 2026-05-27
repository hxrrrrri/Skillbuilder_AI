---
id: frontend-review
name: Frontend Review
version: 1.0.0
category: frontend
visibility: internal
allowedRoles:
  - admin
  - super_admin
  - system_worker
requiredInputs:
  - repoSnapshot
  - selectedFiles
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

# Frontend Review

## Purpose
Evaluate UI component structure, accessibility signals, state handling, and frontend maintainability.

## When To Run
Run when repo intake detects frontend frameworks, components, pages, or client routes.

## Required Evidence
Use component files, route/page files, CSS, tests, and accessibility-related code.

## Forbidden Assumptions
Do not judge visual polish from code alone unless screenshots or assets are provided.

## Scoring Rubric
Reward accessible controls, clear state flow, responsive structure, and reusable components.

## Red Flags
Unlabeled controls, brittle layout, duplicated components, and client-only sensitive logic.

## Strong Signals
Semantic HTML, keyboard-aware flows, component boundaries, and tests for user workflows.

## Output JSON Schema
Return strict EvaluatorSkillOutput JSON.

## Candidate-Safe Summary Rules
Show concrete UI/code improvements.

## Employer-Safe Summary Rules
Show verified frontend strengths, risks, and interview prompts.

## Admin-Only Trace Fields
Raw prompts, parsed output, provider metadata, and validator notes.
