---
id: repo-architecture-review
name: Repository Architecture Review
version: 1.0.0
category: architecture
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

# Repository Architecture Review

## Purpose
Assess the structure of the repository: boundaries, layering, framework use, module ownership, and whether the implementation shape supports the stated target role.

## When To Run
Run after repo intake builds the file tree, selected files, framework detection, and commit snapshot.

## Required Evidence
Use concrete files, directories, route handlers, components, services, schemas, or configuration files. Architecture claims must map back to repo snapshot paths.

## Forbidden Assumptions
Do not assume a missing architecture file means poor design. Do not claim microservices, eventing, deployment topology, or data model quality unless visible in evidence.

## Scoring Rubric
High scores require clear separation of concerns and implementation paths that match the framework. Medium scores show workable structure with some coupling. Low scores show unclear boundaries or unsupported architecture claims.

## Red Flags
Single-file applications for complex roles, hidden business logic in UI handlers, hard-coded runtime configuration, or evidence that references missing files.

## Strong Signals
Clear feature folders, route/service/data boundaries, reusable components, framework idioms, and documented tradeoffs.

## Output JSON Schema
Return strict EvaluatorSkillOutput JSON with evidence-backed findings, interview signals, and improvement plan items.

## Candidate-Safe Summary Rules
Explain architecture strengths and improvements without raw handoffs or internal traces.

## Employer-Safe Summary Rules
Expose verified architecture signals, confidence, and follow-up interview questions only.

## Admin-Only Trace Fields
Raw prompts, parsed output, provider/model metadata, file/snippet set, retries, fallback reason, and validator notes.
