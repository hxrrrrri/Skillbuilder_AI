# Admin Run Card And Status Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize card health dots, modernize admin run cards, center the inspector modal, preserve loading animation, and fix candidate timeline overlap.

**Architecture:** Introduce a reusable `StatusLight` in the existing card UI module and derive its tone at each call site from real card state. Keep run inspector data flow intact while changing its container layout. Convert admin run lists into card grids without changing server data contracts.

**Tech Stack:** React 18, Next.js 14, TypeScript, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Single Status Indicator

**Files:**
- Modify: `src/components/ui/card.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/ui/card.test.ts`

- [ ] Add SSR tests that assert one green light for healthy state and one red light for unhealthy state.
- [ ] Run `npm test -- src/components/ui/card.test.ts` and confirm the tests fail before implementation.
- [ ] Add `StatusLight`, replace the three-light `TrafficLights` renderer, and add pulsing green/red CSS.
- [ ] Update provider, health, agent, prompt, and evaluator-skill cards to pass their real health state.

### Task 2: Admin Run Card Grids

**Files:**
- Modify: `src/app/admin/runs/[id]/trace-event-list.tsx`
- Modify: `src/app/admin/runs/[id]/page.tsx`
- Test: `src/app/admin/runs/[id]/trace-event-list.test.ts`

- [ ] Add SSR tests for provider-style pipeline cards and full-card inspector affordance.
- [ ] Run the focused test and confirm failure before implementation.
- [ ] Convert event rows into clickable cards and evaluator traces into a responsive grid.

### Task 3: Centered Inspector And Timeline Layout

**Files:**
- Modify: `src/components/run/agent-trace-drawer.tsx`
- Modify: `src/app/candidate/runs/[id]/run-command-center.tsx`
- Modify: `src/components/run/agent-trace-drawer.interaction.test.tsx`

- [ ] Add an inspector interaction assertion for centered modal layout.
- [ ] Run the focused inspector test and confirm failure before implementation.
- [ ] Center the modal while preserving polling, tabs, backdrop close, Escape close, and refresh.
- [ ] Move the candidate hover affordance to the card footer area.

### Task 4: Animated Skeleton Coverage

**Files:**
- Modify: `src/components/report/report-generation-skeleton.test.ts`

- [ ] Add SSR coverage for validation, evidence, graph, terminal, interview, and report preview skeleton animation classes.
- [ ] Run the focused skeleton test.

### Task 5: Verification

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Review `git diff --stat` and confirm only scoped files changed by this implementation.
