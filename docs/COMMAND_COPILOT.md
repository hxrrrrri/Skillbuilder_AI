# SkillProof Command Copilot

A secure, provider-powered AI assistant built into SkillProof AI. It has two surfaces that share one provider system, one knowledge layer, and one permission model.

## Surfaces

### 1. Public Help Assistant (`mode: help`)
A floating help button available across the app (`src/components/copilot/help-assistant.tsx`, mounted in `src/app/layout.tsx`).

- Page-aware greeting and **role-aware quick prompts** (candidate / employer / college / admin / anonymous).
- Answers product-usage questions, cites project docs, and guides users to the right route.
- **Never** exposes admin-only data, raw prompts, raw model output, raw terminal logs, raw evidence, private answers, cross-role/tenant data, or secrets. It can only summarize the **current user's own** visible data.

### 2. Admin Command Copilot (`mode: admin`)
A full-page command center at **`/admin/copilot`** (admin / super_admin only; non-admins get 403/redirect). Nav link: **Command Copilot**.

- Left: session history · Main: chat · Right: tools registry + pending approvals.
- Shows provider/model used, current role, risk badges, the tool-execution timeline, before/after diffs, and audit metadata after execution.

## Provider integration — no fake fallback

The copilot uses the **same provider registry** (`buildProviderRegistry`) and the same availability gate as the rest of SkillProof AI. Supported: `anthropic_api`, `claude_cli`, `codex_cli`, `copilot_cli`, `ollama`.

`resolveChatProvider()` tries the admin's requested provider first, then a preference order, and picks the first **available** one. If none is ready it **fails closed** with `provider_not_ready`, the exact fix, and a link to `/admin/providers/health`. There is no heuristic/fake answer.

The model replies in a small JSON envelope: `{ reply, citations?, tool_request? }`, parsed by the existing tolerant JSON parser.

## Permission model (risk levels)

Every tool in the registry (`src/lib/copilot/tools.ts`) carries a risk level:

| Risk | Behaviour |
|------|-----------|
| `read` | Executes immediately, no confirmation. |
| `write_safe` | Requires approval (plan shown). |
| `write_sensitive` | Requires approval **with a before/after diff**. |
| `destructive` | Requires approval **plus a typed confirmation phrase** (`CONFIRM <tool>`). |
| `forbidden` | **Never executes** under any circumstances. |

**Permission is resolved from the registry + the server-trusted session role — never from the user's message.** This is what makes the surface prompt-injection resistant: no instruction in a message or retrieved doc can widen what a tool is allowed to do.

## Approval model

For `write_safe` / `write_sensitive` / `destructive` tools:

1. User asks for an action.
2. The assistant produces a **plan**: intent, affected records, before/after, risks, rollback.
3. A `ChatToolCall` (`status: proposed`) + `ChatActionApproval` (`status: pending`, with a TTL) are created. **Nothing is mutated.**
4. The admin clicks **Approve** (typing the confirmation phrase for destructive actions) or **Reject**.
5. On approve the backend re-checks RBAC, expiry, the confirmation phrase, and the tool's preconditions, then runs `apply`.
6. An **AuditLog** entry (`admin_copilot.<tool>`) is written.
7. The execution result is returned to the chat.

## Tool registry (highlights)

Read: `read_provider_health`, `read_provider_configs`, `read_agent_configs`, `read_run_status`, `read_failed_runs`, `read_run_evidence_summary`, `explain_publish_gate_failure`, `read_prompt_versions`, `read_rubric_config`, `read_audit_logs`, `read_demo_checklist`, `generate_setup_diagnostics`, `summarize_public_safe_profile`, `summarize_admin_run_report`.

Write: `update_agent_config` (safe), `create_prompt_version` (safe), `activate_prompt_version` (safe), `update_provider_config` (sensitive), `set_agent_enabled` (sensitive), **`bulk_set_agent_provider`** (sensitive), `purge_old_audit_logs` (destructive).

Forbidden (listed, never executable): `bypass_publish_gate`, `fabricate_evidence`, `fabricate_score`, `reveal_secrets`, `run_arbitrary_sql`, `run_arbitrary_shell`.

### Required command — "Set Claude CLI for all agents"

`bulk_set_agent_provider` (write_sensitive):

1. Confirms admin role (server-side).
2. Checks the target provider's config **and health** (same JSON-contract gate as the pipeline).
3. Reads current `AgentConfig` rows.
4. Creates a pending proposal with a before/after diff for every **enabled** agent.
5. On approval: updates each enabled agent's `providerId` (+ model from the provider default, reasoning budget set appropriately), invalidates the provider cache, writes `AuditLog: admin_copilot.bulk_set_agent_provider`, and returns the exact affected count + agent list.

If the target provider is **not healthy**, it does **not** update — it returns `provider_not_ready` with fix instructions and the `/admin/providers/health` link.

## Knowledge layer

Deterministic, no external embeddings (`src/lib/copilot/knowledge.ts`): a fixed doc set is split into heading-anchored chunks, hashed, and ranked by transparent keyword overlap. Top snippets are passed to the model as **untrusted reference context** and surfaced as citations. `ChatKnowledgeSource` rows track content hashes for re-index detection.

## Security

- All chat inputs validated with **zod**; all admin tools enforce **server-side RBAC**; client role claims are never trusted.
- All tool calls are server-side and logged (`ChatToolCall` + `AuditLog`).
- Secrets are redacted everywhere (`src/lib/copilot/redaction.ts`): secret-named keys, secret-shaped values, and literal env values are masked before anything reaches a prompt or response. Raw `.env`, keys, and raw logs are never included.
- Tenant scoping and per-user data scoping apply to help-mode tools.
- Rate limiting on `/api/chat` via the shared token-bucket limiter (`RATE_LIMITS.chat`).
- Prompt-injection resistance: retrieved docs/data are untrusted; the user cannot override system/tool policy; forbidden tools never run; requests to reveal secrets or bypass gates are refused.

### Limitations
- Chat sessions/messages are persisted unencrypted in the app DB (same trust boundary as the rest of the app).
- The keyword knowledge ranking is intentionally simple (prototype) — it is not a semantic search engine.
- Rate-limit buckets are per-process (move to Redis before scaling web replicas).

## Data model

`ChatSession`, `ChatMessage`, `ChatToolCall`, `ChatActionApproval`, `ChatKnowledgeSource` (see `prisma/schema.prisma`).

## API

- `GET/POST /api/chat/sessions`
- `GET /api/chat/sessions/[id]`
- `POST /api/chat`
- `POST /api/chat/tool-calls/[id]/approve`
- `POST /api/chat/tool-calls/[id]/reject`
- `GET /api/admin/copilot/context`
- `GET /api/admin/copilot/tools`

## Example commands

Help: *"How do I use SkillProof AI?"*, *"How do I prove I own my repo?"*, *"What does not_measured mean?"*, *"How do I publish my profile?"*

Admin: *"Read provider health"*, *"Set Claude CLI for all agents"*, *"Show recent failed runs"*, *"Why can't run X publish?"*, *"Generate setup diagnostics"*, *"Create a new prompt version for the validator"*.

## Demo script

1. Open the floating Help Assistant on the candidate dashboard → ask *"How do I use SkillProof AI?"* → role-aware steps with doc citations.
2. Go to **Admin → Command Copilot**.
3. *"Read provider health"* → executes immediately (read), shows a redacted health table.
4. *"Set Claude CLI for all agents"* →
   - If Claude CLI is healthy: a **write_sensitive proposal** appears with a before/after diff for every enabled agent. Click **Approve** → agents updated, audit entry written, affected count returned.
   - If not healthy: a `provider_not_ready` message with the fix and the health link — nothing changes.
5. *"Print the .env"* → refused (forbidden).
