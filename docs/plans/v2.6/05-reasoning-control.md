# Plan 05 — Reasoning control

**Status: R0-R2 BUILT 2026-09-30 (code + unit tests, see §Gate record). R3/R4 are measurements, not run: recipes below.** Overview: `00-overview.md`.

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

### R0 — verified 2026-09-30 (ST `7c3994196`, source read, no capture yet)

Captures (the "verify by" column above) need a live ST + backend and run with R3; every row below is a source read.

| # | Verdict | Evidence | What the build does with it |
|---|---|---|---|
| F1 | **Holds.** With the profile's preset found, `processRequest` → `presetToGeneratePayload` → `createGenerationParameters(settings)` then `{...payload, ...overridePayload}`; `sendRequest` spreads our payload into the request data first | `custom-request.js:555, 601, 605`; `extensions/shared.js:460` | our `reasoning_effort` / `include_reasoning` / `custom_include_body` win over the preset's |
| F2 | **Holds.** Our override skips `getReasoningEffort` (client mapping, `openai.js:2545-2665`: `auto`→omitted, `min`→`low`/`none`/`minimal` per source), so we send the value each server branch takes | `openai.js:2545`, `:2821` | `reasoningPayload` maps per source (table below) and refuses a level a source cannot take |
| F3 | **Wrong as written.** `chat-completions.js:1122` is `sendDeepSeekRequest`, not the custom source. The custom source forwards `reasoning_effort` only for `OPENAI_REASONING_EFFORT_MODELS` (`o1`, `o3*`, `gpt-5*`) or a `koboldcpp/*` model, `include_reasoning` irrelevant | `chat-completions.js:1071-1183` (DeepSeek), `:2600-2606` (custom/openai), `src/constants.js:461` | llama-server behind `custom` is driven through `custom_include_body` only; a `koboldcpp/` model gets `reasoning_effort` |
| F4 | **Holds.** Client: `custom_include_body` is the preset's (or `oai_settings`') string, macro-substituted (`openai.js:2924`); ours replaces it. Server: `mergeObjectWithYaml` is a SHALLOW `Object.assign` (a YAML sequence folds item by item) | `util.js:844-864`, `chat-completions.js:2409` | the host reads the preset's body (or `oai_settings.custom_include_body` when the preset lacks the key, `custom-request.js:588-593`), substitutes macros, parses it with ST's own `yaml` (`SillyTavern.libs.yaml`, `lib.js:105`), and we send the merged object as JSON (valid YAML), with `chat_template_kwargs` merged one level deeper so an author's own kwargs survive |
| F5 | **Open (needs the pod).** llama-server switches thinking with `chat_template_kwargs.enable_thinking` (gotcha 2026-09-25). No per-request budget key is assumed | gotchas.md | custom: `off` = `enable_thinking:false`; `low`/`medium`/`high` = `enable_thinking:true`, flagged `collapsed` (UI: "only switches thinking on or off"). R3's artemis-cc arm re-checks with a curl |
| F6 | **Holds.** `text-completions.js` has no reasoning handling at all (grep: 0 hits) | `src/endpoints/backends/text-completions.js` | every level on a TC profile is `unsupported`: nothing is sent, no budget is added, the row says so. No prefill lever is built (no family measured) |
| F7 | **Holds.** With `extractData:false` the raw JSON comes back; reasoning sits in `choices[0].message.reasoning_content` (custom/llama, DeepSeek), `.reasoning` (OpenRouter), Claude `content[].thinking`, Gemini `parts[].thought`; tokens in `usage.completion_tokens_details.reasoning_tokens` / `usageMetadata.thoughtsTokenCount` | `reasoning.js:121-140`, `custom-request.js:462-488` | `readReasoning` meters chars (+ tokens when present); the answer stays `content` only |

**OpenRouter (W23):** `bodyParams.reasoning = { exclude: !include_reasoning }` and `reasoning.effort = reasoning_effort` verbatim
(`chat-completions.js:2301-2350`). The client maps `min` to `none` for OpenRouter (`openai.js:2619`), so `none` is accepted.

**Mapping as built (`src/services/stHost/reasoningPayload.ts`).** Kept to the sources this install plays on plus the ones
whose server branch takes the level verbatim; the rest say "not mapped" instead of guessing (the bundle budget, §Gate record,
also argued for a short table). DeepSeek (`low`/`high` only, `chat-completions.js:1122`) and `koboldcpp/*` behind `custom`
(`:2604`) are verified and deliberately left unmapped until a profile needs them.

| Source | `off` | `low` / `medium` / `high` |
|---|---|---|
| `openrouter` | `reasoning_effort: "none"`, reasoning excluded | the level, `include_reasoning: true` |
| `custom` (llama-server etc.) | `custom_include_body` merged with `chat_template_kwargs.enable_thinking: false` | `enable_thinking: true` (collapsed: one "on" level) |
| `makersuite`, `vertexai` | `reasoning_effort: "min"` (Flash budget 0; Pro keeps its minimum, `prompt-converters.js:1182`) | the level |
| `openai`, `azure_openai`, `claude`, `xai` | **unsupported** | the level (the server maps or drops it per model: OpenAI only for reasoning models, Claude via `calculateClaudeBudgetTokens` as a fraction of `max_tokens` with a 1024 floor) |
| anything else, Text Completion | **unsupported** ("not mapped" / "Text Completion sends a raw prompt") | **unsupported** |

**Decisions made while building (R1/R2):**

- `inner` is not added to `PASS_ROLES` here. Plan 06 Q4 makes it its own role, and plan 06 owns the pass, its self-test run
  (`roleSelfTest.ts` `RUNS`), its live-suite `ROLE_PASS` entry and its Repair consequence. Effort and budget are keyed by
  `PassRole` everywhere (`sanitizeRoleRoutes` iterates `PASS_ROLES`), so `inner` gets both the moment plan 06 adds it.
- `reasoningBudget` is an install-wide settings key (`extraction.reasoningBudget`, sanitized per level to an integer in
  0–32768, defaults low 512 / medium 2048 / high 6144). No panel control: R3 sets it, and the three number inputs cost more
  bundle than the budget had left.
- The "Models per task" disclosure (`RoleProfilesGroup`) is now a lazy chunk (the `SettingsPanel` `ImageGroup` shape): the
  effort select lives there, and the main entry had 6.9 KB of headroom against ~8 KB for the feature.
- `reasoning-exhausted` is also raised when a reply was ONLY an inline think block (`stripReasoningBlocks` left nothing):
  before, that read as an empty answer and a parse failure. A probe that exhausts still counts as the model answering.
- The call record is per role, in memory, on `roleHealth` (the snapshot's `roleRoutes`), not a new ring: the last
  observation per role carries the meter (`effort`, `applied`, `collapsed`, `unsupported`, `budget`, reasoning `chars`,
  `tokens`) or the exhaustion. An observation made under another profile or effort is ignored, so a fixed setting clears the
  Repair row at once. There is no plan 13 call ring in the tree to extend.

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

### R3 run recipe (not run; batched with the measurement schedule)

Pre-declared in `test/measurements/v2.6-05/r3-matrix.json` (arms, roles, commands, floors, latency bounds, output paths).
Both harness entry points take `--effort <level>`, pin `extraction.routes[role]` for the run, read back what the connection
did (`reasoning.applied/unsupported/collapsed`, reasoning chars/tokens) into the report, and restore + read back the
role map afterwards (`scripts/debug/lib/roleEffort.mts`).

1. Lane from `adolion-fresh` is not needed (fixtures are self-contained); any seeded lane with the three profiles. Dev build:
   `npm run build:dev && npm run stage -- --flavor dev`, `st-session.mts reload`.
2. `so-run-header.mts capture --label v26-05-r3` (profiles and settings are install-wide).
3. OpenRouter arm: write the chosen model into the matrix file and commit it before the first call.
4. Per arm × role × level, twice consecutively:
   - read: `node scripts/debug/so-live-suite.mts run --effort <level> --expect-count 29`
   - others: `node scripts/debug/so-role-calibration.mts run --role <role> --effort <level> --arm <arm>-<level>-r<n>` (`--profile <name>` to
     route the role to the arm's profile; authoring adds `--holdout`)
5. `so-role-calibration.mts verdict r1 r2` per cell; read cells need both reports `ok:true` and p95 within the bound.
6. `so-run-header.mts diff` against step 2; copy every report to `test/measurements/v2.6-05/<arm>/`; write
   `docs/plans/v2.6/recommended-reasoning.md`; the UI line per role reads from it. Defaults stay `default`.

### R4 spike recipe (not run; code NOT built)

R4 needs its own build before the measurement: `effects.reasoning` in `schema.ts`/`validate.ts`, an arm/disarm in
`samplerOverlay.ts` keyed chat + checkpoint, written by `samplerOverlayHost` into loud requests only and only over keys the
request already carries (`reasoning_effort`; for `custom`, `chat_template_kwargs` merged as in F4), behind a spike flag
(`spikes.reasoningEffect`, default off, `__SO_DEV__` dynamic import like `runtime/spikes/`). `reasoningPayload` is reusable.
Then: 20 climax turns across 2 Adolion stories from `adolion-fresh`, each turn generated twice (control = checkpoint without
`effects.reasoning`, arm = `high`), payload captured with `st-payload.mts arm --persist` to prove the key landed, pairs
shuffled blind into the rating pack (overview rule 11). Floor as declared above: arm preferred ≥ 60 % and p95 reply
latency ≤ 2× control; a miss is recorded as not built.

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
