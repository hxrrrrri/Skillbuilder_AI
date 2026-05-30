# Admin Run Card And Status Indicator Design

## Scope

Standardize admin operational cards around a single pulsing health indicator, convert run pipeline and evaluator trace lists into card grids, center the live agent inspector, preserve animated report loading states, and prevent the candidate timeline inspector affordance from overlapping status labels.

## Status Indicator

Replace the decorative red/yellow/green traffic-light cluster with one `StatusLight` component.

- Healthy cards render one continuously pulsing green dot.
- Disabled, untested, unavailable, failed, and otherwise unhealthy cards render one continuously pulsing red dot.
- Section headings do not render decorative lights.
- Provider, provider-health, agent, prompt, and evaluator-skill cards render the state light inside each card.

## Admin Run Detail

Render Agent Pipeline events in a responsive provider-style card grid. Each card summarizes order, agent, status, timestamps, duration, and notes. Clicking anywhere on a card opens the live inspector.

Render Evaluator Skill traces in a responsive card grid with status, skill metadata, summaries, evidence count, and expandable trace JSON.

## Live Inspector

Keep the existing inspector tabs, fetching, polling, and close behaviors. Change its desktop presentation from a right-side drawer to a centered modal constrained to the viewport.

## Candidate Timeline

Move the hover-only `Inspect agent` affordance from the top-right corner to a bottom-right position so it cannot overlap the status label or duration.

## Report Skeletons

Keep the existing animated skeleton system for validation contract, repo intelligence, evidence locker, skill graph, terminal proof, interview questions, and profile report preview. Add coverage that verifies animation classes remain present.

## Verification

Use focused Vitest component tests, then run the complete test suite and TypeScript typecheck.
