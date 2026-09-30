# Plan 05 — Reasoning control

**Status: DRAFT 2026-09-30. Nothing built.** Overview: `00-overview.md`.

## Problem

- **Every off-path pass takes whatever reasoning its profile's preset happens to carry.** We never send an effort
  (`src/services/stHost/modelReply.ts:117-135`; `src/` has no `reasoning_effort`). A Chat Completion preset carries
  `reasoning_effort` (`public/scripts/openai.js:395`), so today per-role effort is possible only by cloning a profile and a
  preset per role.
- **Thinking changes cost and failure shape.**
  - A lookup-style read on a thinking model pays seconds of reasoning for nothing.
  - A thinking model given our answer budget can spend all of it thinking and return an empty `content`. Measured 2026-09-25
    on llama-server Chat Completion (`.claude/rules/gotchas.md`). Today that reads as an ordinary empty reply, then a parse
    failure that pauses extraction.
- **Plan 13 already gives harness routes an `effort`** (`docs/plans/v2.5/13-harness-routing.md:291`). Profile routes have none,
  so one role could be controllable on one route kind and not on another.

## Host facts (R0 verifies each; nothing is built on an unverified row)

| # | Claim | Read at | Verify by |
|---|---|---|---|
| F1 | With a preset, the CC request is built by `createGenerationParameters` (so `getReasoningEffort` runs on the preset's value), and **our `overridePayload` then wins** | `public/scripts/custom-request.js:549-556,601-605` | a capture of the posted body with and without our key |
| F2 | Our override **bypasses** the per-source mapping in `getReasoningEffort` (e.g. `min` → `low`, `auto` → omitted), so we must send a value each source accepts, or leave the key alone | `openai.js:2567-2655` | a table per source we support: which values are accepted and which answer 400 |
| F3 | A custom source forwards `reasoning_effort` only when `include_reasoning` is true | `src/endpoints/backends/chat-completions.js:1122` | capture of the server's outgoing body |
| F4 | `custom_include_body` from our payload **replaces** the profile/preset one before the server merges it, so an author's own extra body (e.g. `chat_template_kwargs`) would be lost | `chat-completions.js:2409`, spread order in `custom-request.js:605` | capture; decide merge-not-replace |
| F5 | llama-server CC: thinking is switched by `chat_template_kwargs.enable_thinking`; whether it honours `reasoning_effort` or a reasoning budget depends on the build | gotcha 2026-09-25 | curl `/v1/chat/completions` on the pod's llama.cpp build |
| F6 | Text Completion sends a raw prompt: there is no effort key, and thinking happens only if the instruct template or a prefill opens a think channel | `text-completions.js` has no reasoning handling (grep) | count what `stripReasoningBlocks` strips on today's TC memory calls, per model family |
| F7 | With `extractData: false`, the CC reply JSON exposes `reasoning_content` separately (usable for metering) | `modelReply.ts:129-139` | capture |

Output: a verified host-facts table in the overview, with file:line (the v2.4 `host-facts.md` shape).

## R1 — One `effort` per role, across every route kind

- **Type:** `ReasoningEffort = "default" | "off" | "low" | "medium" | "high"`.
  - `default` sends nothing and changes nothing, so it is today's behaviour. It is the default for every role (overview rule 9).
- **Setting home:** extend plan 13's `routes[role].route.options.effort` to profile routes, so a role has one effort whatever
  its route kind. If plan 13 H7 is not built yet, use the same key shape under `extraction.routes[role]`, so the two merge
  without a rename.
  - The sanitizer falls back to `default` for an unknown value (v2.5 rule 9: no history branches).
- **Mapping, pure and host-free:** `reasoningPayload(route, effort)` → `{ payload, unsupported? }`.
  - It lives beside `samplerPayload` (`modelReply.ts:117`) and is unit-tested per route kind × level.

| Route | `off` | `low` / `medium` / `high` |
|---|---|---|
| CC, an OpenAI-shaped source that accepts effort (F2 table) | the source's lowest accepted value, or `unsupported` | `reasoning_effort` + `include_reasoning: true` |
| CC, custom → llama-server | `custom_include_body` **merged** (F4) with `chat_template_kwargs.enable_thinking: false` | `enable_thinking: true`, plus a budget key if F5 finds one; otherwise the level collapses to `on` and the UI says so |
| TC | a family prefill that closes the think channel, **only** for families R0 measured; otherwise `unsupported` | `unsupported` unless F6 finds a lever |
| Harness (plan 13) | per harness flag | `--effort` / `--variant` / `model_reasoning_effort` (13 H7) |

- **An unsupported level sends nothing and says so.** The role row reads "this connection cannot change reasoning", and the
  call record carries `effortApplied: false`. It never silently pretends.
- **Capability per profile:** probed once per profile (the `stHost/capabilities.ts` shape: present/absent/error, and an
  error is not cached).
- **UI:** in the per-role profile control, an effort select beside each profile select, plus the recommendation from R3 once
  one exists. `CapabilitiesGroup` gains the per-profile read-out.

## R2 — Budget and failure

- **Budget:** when the effort is applied and not `off`, `maxTokens = role answer budget + reasoningBudget[level]`.
  - Starting values are predeclared, then set by R3: low 512, medium 2048, high 6144.
  - They are install-wide, not per story.
- **New failure kind `reasoning-exhausted`** (beside `lapsed | timeout | transport | config`, `modelReply.ts:6`). It is raised
  when `content` is empty and reasoning is present, or when the finish is `length` with no answer.
  - The scheduler treats it as a failed read, not a parse failure: the journal names it, and extraction does not pause
    install-wide on it.
  - Repair shows one line: "the model spent its whole budget thinking — lower the effort for <role> or raise the budget".
- **The answer is `content` only.** Reasoning is never parsed as output; `stripReasoningBlocks` still runs on inline blocks.
- **Meter:** the call record (plan 13 call ring, or the judge-ring shape) gains `reasoningChars` and, when F7 holds,
  `reasoningTokens`.

## R3 — Measurement (decides recommendations, never defaults)

- **Matrix:** 5 roles × {off, low, medium, high} on Artemis (TC and the CC profile) and one hosted CC source (overview W20:
  both hosted and local).
- **Per cell:** the role's existing floor, plus p50/p95 latency and reasoning tokens.
  - read: live-suite tiers, `plotDeltaAccuracy` and per-tier floors;
  - synthesis: canon/scene golden replay + judge rubric;
  - authoring: v2.4 plan 08 calibration;
  - director: plan 14 / v2.2 director accuracy;
  - curator: v2.4 plan 08 curator calibration.
- **Rule:** a level is *recommended* for a role only if it meets that role's floor ×2 **and** its p95 fits the role's cadence.
  For `read`, p95 ≤ the read interval at cadence 3 on the reference hardware.
  - Hypothesis to test, not to assume: `read`/`director` best at `off`, `authoring`/`synthesis` gain at `medium`.
- **Output:** a table in `docs/plans/v2.6/recommended-reasoning.md` and one line per role in the UI. Defaults stay `default`.

## R4 — Checkpoint `effects.reasoning` for the main reply (spike)

- **What:** `effects.reasoning: "off" | "low" | "medium" | "high"` on a checkpoint (e.g. a climax thinks harder).
  - It is armed and disarmed like the preset overlay (v2.4 plan 06 X20, `src/runtime/samplerOverlay.ts`).
  - It is written only into loud requests, and only over keys the request already carries (CC `reasoning_effort`; llama
    `chat_template_kwargs` per F4/F5).
  - `samplerKeys.ts` gains the keys. `SAMPLER_OVERLAY_NEVER` is re-read so nothing else widens.
- **Predeclared floor:** a blind A/B on 20 climax turns across 2 stories, human rater.
  - The effort arm is preferred ≥ 60%, and p95 reply latency grows ≤ 2× the control.
  - Fail = recorded not built, and the measurement kept (spike rule).

## Files

- `src/services/stHost/modelReply.ts`: effort option, budget, the new failure kind.
- `src/services/stHost/reasoningPayload.ts`: new, pure.
- `src/services/stHost/connectionProfiles.ts`: source/family read for the mapping.
- `src/runtime/passProfiles.ts` + `src/extraction/modelRoute.ts`: effort on the resolved route.
- `src/runtime/settingsModel.ts`: sanitizer.
- `src/components/settings/*`: the role row.
- `src/extraction/reply.ts`: the call record.
- R4 only: `src/utils/samplerKeys.ts`, `src/runtime/samplerOverlay.ts`, `src/engine/schema.ts` (`effects.reasoning`), `validate.ts`.

## Gates

- **Pure:** `npm run typecheck && npm run typecheck:test && npm run lint && npm test`. Mapping cases for every route × level;
  `reasoning-exhausted` from recorded CC/TC reply shapes.
- **Runtime:** the above + `npm run build:dev && npm run serve:dev`, `st-session reload`, then live on a lane:
  - one real call per role at each level on the Artemis TC and CC profiles;
  - payload captured at the server hop, asserting the key landed or `effortApplied: false`;
  - a forced small budget to reproduce `reasoning-exhausted` for real;
  - `so-run-header capture` / `diff` around the batch (profiles are install-wide).
- R3 and R4 are measurements with their own archived records.

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Budgets install-wide, or per role too? | **Install-wide `reasoningBudget[level]` only.** R2 already adds it to each role's own answer budget, so the per-role half exists. A per-role override is added only if R3 measures a role exhausting at a level where the others do not. | Nothing measured needs it yet. A per-role table doubles the settings surface for a case that has not been shown. |
| R4: build it, or drop it? | **Run it as a spike.** Its predeclared floor decides; this is not a design call (v2.5 V8). Its 20 human-rated climax turns go into the blind-rating pack (overview rule 11). A floor miss means it is recorded as not built. | R4 never writes the user's preset. It is a per-request overlay, like X20 (`samplerOverlay.ts`), so the "touches the main preset" worry does not apply. |

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Budgets install-wide, or per role too? | **Install-wide `reasoningBudget[level]` only.** R2 adds it to each role's own answer budget, which gives the per-role half. A per-role override is added only if R3 measures a role exhausting at a level where the others do not. | Nothing measured needs it yet. |
| R4: build it, or drop it? | **Run it as a spike.** Its predeclared floor decides (v2.5 V8). Its 20 human-rated climax turns go into the blind-rating pack (overview rule 11). | R4 is a per-request overlay like X20 (`samplerOverlay.ts`) and never writes the user's preset. |
| Hosted source in R3? | **Yes, alongside local** (overview W20). | User. |

## Unresolved questions

None. The hosted source is **OpenRouter** (overview W23). R0 checks how ST's OpenRouter source passes
`reasoning_effort` and picks one reasoning-capable model per R3 run, stated before the run. Budget: about 300–600
calls.
