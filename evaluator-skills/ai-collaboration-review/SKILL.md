---
id: ai-collaboration-review
name: AI Collaboration Review
version: 1.0.0
category: ai_collaboration
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

# AI Collaboration Review

## Purpose
Measure whether the candidate can use AI as an engineering amplifier without blindly trusting generated code.

## When To Run
Run after repo intake and terminal proof collection. If there is no evidence of AI use, verification, or challenge performance, produce insufficient-evidence output instead of a score.

## Required Evidence
Use AI-related commit messages, challenge answers, tests after AI-assisted changes, debugging proof, prompt artifacts intentionally provided by the candidate, or stored verification commands.

## Forbidden Assumptions
Do not assume AI use from polished code. Do not penalize lack of AI evidence as bad collaboration. Do not score without at least one evidence finding.

## Scoring Rubric
High scores require evidence of review discipline, tests, debugging, and explainable tradeoffs. Medium scores show some verification. Low scores indicate blind copy risk with weak verification.

## Red Flags
Unverified generated code, no tests after AI-related commits, inability to explain generated changes, or AI-generated security issues.

## Strong Signals
Small reviewable iterations, tests after generated changes, clear prompts, debugging notes, and explicit tradeoff explanations.

## Output JSON Schema
Return EvaluatorSkillOutput JSON. If evidence is insufficient, status must be warning, scoreDelta 0, and summaries must say AI collaboration evidence insufficient.

## Candidate-Safe Summary Rules
Use the phrase "Shows how well you verify, debug, and improve AI-assisted work." Hide prompts unless explicitly submitted for profile use.

## Employer-Safe Summary Rules
Use the phrase "Measures whether the candidate can use AI as an engineering amplifier without blindly trusting generated code." Do not expose private prompts.

## Admin-Only Trace Fields
Raw challenge context, prompt metadata, provider/model details, raw parsed JSON, fallback reason, and validator notes.
