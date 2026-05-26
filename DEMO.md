# SkillProof AI — Hackathon Demo Script

> **Most students show resumes. SkillProof shows evidence.**

This is the 5-minute demo flow. Each step maps to a piece of the Missions architecture you'll see
on screen.

---

## Setup

```bash
npm install
npm run db:push
npm run dev
# open http://localhost:3000
```

Optional:

```bash
export ANTHROPIC_API_KEY=...     # real Claude mode
# OR
export SKILLPROOF_MOCK_LLM=1     # offline heuristic mode (UI shows a yellow banner)
```

---

## Script

1. **Landing page.** "Most students show resumes. SkillProof shows evidence."
   Paste a public GitHub repo URL, candidate name, optional GitHub username, target role, level.

2. **Mission starts.** Hit *Run SkillProof mission*. App redirects to Mission Control.

3. **Orchestrator → Validation Contract.** First agent card lights up. The orchestrator writes
   the rubric *before* any code is read. Show that correctness is defined independently.

4. **Repo Scanner → Context Pack.** Deterministic, no-LLM. Builds a token-efficient pack: README,
   configs, ranked source files, sampled tests, last 30 commits. Show the **Token Meter** —
   raw repo estimate vs analyzed pack. Saved % is real.

5. **Workers run serially.** Architecture → Code Quality → Testing → Security → Git Evidence →
   Documentation → Authenticity. Each emits a structured `Handoff`. Each score carries evidence
   citing real file paths.

6. **Interview Generator.** Builds 5 questions tailored to files the candidate actually wrote.

7. **Validator (fresh context).** The validator gets only the score claims + the **full repo file
   truth set**. It can never raise scores. It lowers unsupported claims, flags hallucinated file
   paths, and caps anything > 85 without exceptional evidence.

8. **Skill Graph.** Weighted rubric aggregation. Anything not measured is shown as
   `not measured` and excluded from the overall denominator — no silent neutral-50 fillers.

9. **Evidence Locker.** Every score is filterable by skill. Each row shows:
   - score
   - confidence
   - source badge (`LLM`, `Heuristic`, `Mock`)
   - support label (`Verified`, `Partial`, `Insufficient`)
   - cited files
   - validator notes
   - which contract assertion IDs it addresses

10. **Validation Contract Coverage.** Show the dedicated card. Every assertion has a status:
    passed / partial / failed / unknown. *"A5 Testing: Repo contains automated tests for at least
    one critical path. Status: Failed. Evidence: No test files detected by scanner."*

11. **Authenticity Signals.** Positive vs risk signals (commit messages, project age, README
    template detection, test presence). Confidence is shown. Not called plagiarism detection.

12. **Code-Based Interview.** Answer at least one question. The answer evaluator runs with FRESH
    CONTEXT and scores 5 dimensions: communication, debugging, architecture explanation, testing
    reasoning, understanding of own code. Communication + Debugging scores update the skill
    graph and the overall is recomputed. Verification level upgrades to
    **Repo + Interview verified**.

13. **AI Collaboration Challenge.** Paste a tiny diff and an explanation. Pick the AI tool you
    used (Claude Code / Codex / Cursor / Gemini / Manual). The challenge evaluator scores
    correctness, explanation quality, test awareness, review discipline, and AI collaboration
    maturity. This becomes the AI Collaboration skill in the rubric.

14. **Employer Verifier Preview.** Recruiter-readable summary: shortlist recommendation, top
    verified skills, biggest risks, suggested follow-up interview questions.

15. **Improvement Plan.** 7-day, 30-day broken by week with exact files to improve, recommended
    tests, git hygiene tips.

16. **Publish Public Profile.** Click *Publish*. Open the public URL. Recruiters see the
    verification badge, score, skill graph, evidence locker, interview performance,
    authenticity, AI collab score, employer verifier, improvement areas.

17. **Export Report.md.** Hit *Export Report.md* on Mission Control or the footer of the public
    profile. Download a complete Markdown SkillProof Report including all of the above.

18. **Campus Preview.** Show `/campus-preview` for 10 seconds — what a college placement cell or
    bootcamp would see across a whole cohort. Clearly labeled *Preview / sample data*.

---

## What to emphasize verbally

- "Validation contract is written **before** the candidate's code is read."
- "Validator runs with fresh context. It cannot raise scores. The truth set is every file in the
  repo tree, not just what was sent to other agents."
- "Heuristic/Mock mode is never hidden. Every score is tagged with its source and confidence."
- "Not measured ≠ 50. We refuse to silently fill in missing data."
- "The interview is generated from the candidate's own code. Bluffing is hard."
- "Authenticity signals are signals — not a verdict, never plagiarism detection."

---

## Failure modes to demo (optional)

- Paste an invalid repo URL → graceful error.
- Paste a private repo → "private repo unsupported" banner.
- Disable `ANTHROPIC_API_KEY` → yellow mock banner appears + every score badged `Mock`.
