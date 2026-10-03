# Plan 14 — B10 CLI model as judge, and cloud models per role

**Status (2026-10-03): v2.7 plan 14 (was old v2.7 13). Decided. B10 is DROPPED as a runtime judge (decision 1); the CLI
stays a labelling aid (decision 2); W27 kept. What v2.7 builds from the research: the role picker grouped by source and
the per-source/per-model context table (§Build in v2.7, tracked as v2.7 02 C14); not built.** Source:
`docs/plans/v2.6/v2.7-seeds.md` row "B10 CLI model as judge". Overview: `00-overview.md`.
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D; acceptance D. Model input: the context table changes
how much of an extraction input fits (real-model row `v2.8/01-v27-carry-over.md` §B C14-b); the picker changes nothing
sent.

## Build in v2.7 (review B6 refined, research decisions 1 and 6)

The user has **Claude and Codex subscriptions and the DeepSeek API, no OpenRouter and no Anthropic API key** (research
decision 1). So:

1. **Picker grouped by source.** `RoleProfilesGroup.tsx` groups Connection Manager profiles by source/vendor and labels
   each "cloud" or "local", so a cloud egress is visible where it is chosen; harness routes stay in their own group.
   Same for the image director's select. No route changes.
2. **Per-source/per-model context table** (`src/services/stHost/contextLimit.ts`, today `CHAT_SOURCE_CONTEXT` lists only
   `deepseek`, `:21-28`): a table keyed by source and, where known, model id; precedence **preset value > model row >
   source row > 8192 default**, the default carrying its reason as today. Tests: an unknown model on a known source,
   an unknown source, a preset that wins over the table, truncation at the table's limit, a TC profile untouched.
3. **Docs** (`docs/guide/setup/`): "use a cloud model for a task": one CC profile per provider/model with its own
   `secret-id`, picked under Models per task; the DeepSeek API as the worked example; Claude/Codex subscriptions only
   through the opencode harness (W27); OpenRouter mentioned as an alternative, not the path (B6); egress per role.

Not in v2.7 (each needs a model or a later plan):
- **Lore-creation role** (research decision 2): built with the curator create op, `v2.8/11-curator-create-op.md`.
- **Optional Critic role** (decision 2, "after the wizard work"): `v2.9/05-deferred-items.md` §05.6 (decided by the
  user 2026-10-03, as recommended).
- **Native tool calls over CC profiles** for the agentic wizard (decision 3): a CL spike on the DeepSeek API CC profile
  plus the opencode subscription route (which already has native tools via the MCP bridge), floor = v2.6 plan 11's agent
  checks on the same fixture. Owner: `v2.8/09-wizard-assistant.md` §F, acceptance rows indexed in
  `v2.8/24-test-plan.md` (decided by the user 2026-10-03, as recommended).
- **Labelling aid** (decision 2): offline, per fixture plan in v2.8 (12, 13, 14); the labelling model is never
  calibrated on its own labels; Adolion-derived rows are checked by a second model, never the user (review B4).

## What it is

- Answer judge questions with a general chat model reached through the harness plugin (a CLI such as `opencode run`;
  originally also `claude -p` and `codex exec`), instead of TypeSafe's Jev.
- The catch: a CLI returns **text**, not probabilities. Every judge threshold today reads a probability, so each use
  would need a new decision rule and its own calibration.
- And it is slow: seconds to spawn, so it can never sit on the reply path.

## History and evidence

| When | What | Where |
|---|---|---|
| v2.5 plan 13 | "LLM-as-judge via a harness" kept as candidate H-S3, belonging to plan 06; harness plugin designed (`/complete`, spawn per call) | `docs/plans/v2.5/13-harness-routing.md:49-50` |
| v2.5 plan 06 J8 | Contract = verbalized label (+ optional stated confidence); corpus = existing fixtures; columns harness vs Jev vs off; off-path only; setting `judge.transport[use]`; privacy row per vendor; "not a v2.5 build unless the user asks" | `docs/plans/v2.5/06-judge-next.md:197-207`; risk note "J8 looks like a cheaper judge and is not one" `:253-254` |
| v2.5 plan 06 J5 | Why the harness is not a Jev host: Jev is a System One classifier; a CLI is "a different contract" | `v2.5/06-judge-next.md:150-158` |
| v2.6 Q4 | B10 recommendation **defer**: text not probabilities, 2–7 s spawn, needs the harness build | `docs/plans/v2.6/00-overview.md:278` |
| v2.6 W16 | User: plan 12 Phase C spikes it (row C12, floor = the Jev use's floor on the same fixture, its own decision rule declared first); C12 waits on 04 H | `00-overview.md:173`; `v2.6/12-open-judge.md:97,109` |
| v2.6 W27 | **Harness scope = opencode only, no CLI logins.** "The Claude Code and Codex arms are dropped, not pending" | `00-overview.md:184` |
| v2.6 04 H | Harness plugin built (H1–H4 + agent bridge), opencode only offered; Claude/Codex support kept in code, unoffered | `docs/plans/v2.6/04-remaining-builds.md:12,310,340` |
| v2.6 plan 12 Phase 0 | Survey F6: all three CLIs **verbalized** only; "latency 2-7 s rules out the 1500 ms reply path. Off-path only" | `v2.6/12-survey.md:73-79,169-177` |
| v2.6 plan 12 Phase C | Never started | `v2.6/12-open-judge.md:3` |
| v2.6 T6-3 (2026-10-02) | Harness route **never exercised live**: opencode account hit its usage limit ("opencode reports its usage limit"), role Test took 75–89 s to report it | `test/sessions/T6/SUMMARY.md:160,203-218` |

Measured latency (probe, not a judge run):
- `claude -p` haiku, isolated flags: 402 input tokens, wall **2.1–3.4 s** (2 calls) (`v2.5/13-harness-routing.md:100`).
- `opencode run` gpt-6-astra(-fast): wall **6.0–6.7 s**; inline agent cut input to 133 tokens but wall stayed 6.7 s,
  so startup dominates (`v2.5/13-harness-routing.md:109-110`).
- `codex exec`: not found (`v2.6/12-survey.md:196`).

Judge budgets it would have to fit (`src/judge/policy.ts`): director and lore 1500 ms (reply path), scene 2500, critic
2500, memoryVerify/memoryPairs 3000, stall/warden/curatorFilter 4000, typed 5000. **Every one is below opencode's
measured 6–7 s.**

## Why it was deferred

- Contract mismatch: no probability, so no existing threshold, readiness row or floor reasoning carries over.
- Latency: above every current judge budget.
- W27 removed two of the three CLIs, and the remaining one (opencode) ran out of quota in the v2.6 sessions.
- Privacy: opencode's own policy lists prompts for "Improving the Services" and the training question was closed
  unanswered (`v2.6/12-survey.md:79,173`).

## Current state in code

- `DecisionContract` already has `"verbalized"` (`src/judge/providers.ts:8`), but `JUDGE_PROVIDER_IDS` is only
  `typesafe`, `llama-logprob` (`:3`). No verbalized provider exists.
- Harness plugin: `server-plugin/story-orchestrator-harness/` (`POST /complete`, concurrency 2 and queue 8 per harness,
  single-flight per user/harness/role, admin-only, `offer` gate) (`v2.6/04-remaining-builds.md:310`). Not offered unless the
  server `config.json` sets `offer: true`.
- Judge plugin provider table: `typesafe`, `llama-logprob` only (`server-plugin/story-orchestrator-judge/index.mjs:9-11`).
- No `judge.transport[use]` setting; routing is `judge.provider[use]` (`src/judge/settings.ts`, v2.6 plan 12 Phase A).

## Options

**A. Verbalized provider, off-path uses only.** New provider id `harness-verbal` behind the existing seam. One CLI call per
judge *request* (all its questions in one JSON answer), parsed strictly; a parse failure is that use's fallback. Each use
gets a declared decision rule (e.g. Noul → yes/no label, p := 1/0, or a stated-confidence band) and a calibration row on
its existing fixture. Budgets raised per use for this provider only, or the use limited to work nobody waits for (canon
verify, chapter-seal verify, memory backlog). Cost: per-call subscription/API quota; 6–7 s each. Risk: quota outages
(seen 2026-10-02) turn into fallbacks; vendor privacy row needed.

**B. Labelling aid, not a judge.** Use the CLI model offline to *propose* labels for new fixtures (J7, J6d, v2.8 14),
which a human or a second pass confirms before any judge answer is read. No runtime code, no new provider. Cost: one-off
quota. Risk: model-proposed labels bias the fixture toward that model; mitigate with the user spot-check and by never
calibrating the same CLI model on fixtures it labelled.

**C. Restore Claude Code / Codex arms** (reverse W27) to get the faster `claude -p` (2–3 s). Still above the reply path,
still verbalized; needs logins the user ruled out.

**D. Drop it.** The local judge question is better served by v2.8 14 (a model that returns real probabilities on this
machine).

## Recommendation

**D for the runtime judge, plus B as tooling.** A verbalized, 6–7 s, quota-bound judge adds a contract, a decision rule
per use and a privacy row, to serve only uses nobody waits on, and it failed on quota the one time it was scheduled.
v2.8 14 is the better path to a non-TypeSafe judge. Using the CLI as a labelling aid gets value from the harness without
putting it on any play path.

## Decisions for the user

1. Build a verbalized CLI judge provider in v2.7? **Rec: no (drop B10 as a runtime judge).** I would like to have it for multiple purposes, maybe not for the judge, but for example the wizzard. Idk if CLI is the right approach, but i want to be able to connect to multiple cloud providers. And i think ST do not support this like this.
2. Use the harness CLI as a fixture-labelling aid for J7 / J6d / plan 15 fixtures? **Rec: yes, with your spot-check of 5
   rows per fixture, and the labelling model never calibrated on its own labels.** sure
3. W27 (opencode only, no logins): keep? **Rec: keep.** Reopen only if B10 is wanted as a runtime judge after all. keep
4. If you do want A anyway: which uses? **Rec: only canon verify (plan 14 J7.2) and the chapter-seal verify, which run
   off-path with no player waiting.** what do you recommend? explore uses and come back with proposals

## Floor and measurement before building

Only if decision 1 is "yes" (option A):
- Per use: its decision rule declared **before** any answer is read (`v2.6/12-open-judge.md:97`), then the Jev use's
  existing floor on the same fixture, ×2, with judge-off and TypeSafe columns (`v2.6/12-provider-matrix.md` shape).
- p95 latency per use against a budget declared for this provider; quota-failure rate recorded as fallbacks.
- A calibration row per provider × model × use (`readiness.ts`), bound to the fixture revision; an unlisted model is
  refused by the harness allowlist.
- Privacy row for the vendor before any routing (the provider notice, `JUDGE_PROVIDERS`).

For option B: no floor; record which fixture rows were model-proposed and which the user confirmed.

## Gates

- B (tooling): `npm run test:debug` for any script; docs.
- A (provider): judge seam + plugin → `npm run gates` + `npm run test:plugin`; a mutant routing to an uncalibrated
  `harness-verbal` must be refused (Phase A routing test pattern); live: the routed use ×2 on a lane with the harness
  offered and warmed (`HARNESS_LIVE=1`), real model, quota recorded.

## Links

- v2.7 02 C14 (the build row), v2.8 01 §B C14-b (enlarged inputs, real-model row).
- v2.8 14 open-source Jev (the recommended path to a non-TypeSafe judge).
- v2.8 13 J7 judge ideas, v2.8 12 J6d shadow record (fixtures B10-as-labeller would help build).
- v2.8 11 curator create op (Lore-creation role), v2.8 09 wizard assistant §F (native tools), v2.9 05 §05.6 (Critic).
- v2.7 12 model choice (a hosted model choice may change the harness model list).
- No direct dependency: v2.7 06, v2.8 18, v2.8 20, v2.9 03 (deferred), v2.8 01 §C, v2.9 02 (deferred), v2.9 01
  (deferred), v2.7 13, v2.8 15, v2.7 11, v2.7 09, v2.9 04 (deferred), v2.7 08.

## Research 2026-10-03: multiple cloud providers per role

Asked by the user's answers to decisions 1 and 4 above, and by old plan 12 (now v2.8 11: "its own model selector, maybe a
cloud model, or something like opencode"). Code read only; nothing measured live in this pass. Plan numbers inside this
research are old v2.7 numbers unless version-qualified: 01 = v2.7 01, 03 = v2.7 05 / v2.8 10, 11 = v2.6 plan 11,
12 = v2.8 11, 14 = v2.8 13, 15 = v2.8 14, 24 = v2.8 22.

### 1. How the extension calls models today

Two route kinds per role, plus two consumers outside the role map:

- **Role map ("Models per task").** Six pass roles: `read`, `synthesis`, `authoring`, `director`, `curator`, `inner`
  (`src/extraction/passRole.ts:1-12`). A role holds a Connection Manager profile id, or a harness route
  `{kind:"harness", harness, model}` with an optional `onFailure` profile (`src/runtime/passProfiles.ts:18-23,37-47`).
  Unset = the memory model profile; a missing profile refuses (`passProfiles.ts:78-92`). Route type:
  `ModelRoute = profile | harness` (`src/extraction/modelRoute.ts:12-14`). UI: `RoleProfilesGroup.tsx:92-120`, one
  select per role with optgroups "Connection profiles" and "Cloud harness (on the SillyTavern server)"; egress copy per
  role `:55-62`.
- **Profile route.** `requestModelReply` → `ConnectionManagerRequestService.sendRequest(profileId, …)`
  (`src/services/stHost/modelReply.ts:162-191`, host `connectionProfiles.ts:93-109`). One user message,
  `stream:false`, `extractData:false`, preset + instruct included; returns text only (`modelReply.ts:180-182`).
  Reasoning effort is mapped per CC source: openai/azure, claude, makersuite/vertexai, xai, deepseek, custom,
  openrouter (`src/services/stHost/reasoningPayload.ts:27-29,46-49,72-74`). Usage read from `usage.*`, cost only when
  the provider returns `usage.cost` (OpenRouter does) (`modelReply.ts:142-148`).
- **Harness route.** `POST /api/plugins/story-orchestrator-harness/complete` (`src/services/stHost/harness.ts:8-48`).
  Text in, text out, "You have no tools" (`harness.ts:10`). Harness ids claude/codex/opencode exist in code
  (`src/utils/harness.ts:1`) but only opencode is offered (W27); default models `openai/gpt-6-astra(-fast)`
  (`server-plugin/story-orchestrator-harness/index.mjs:36-40`). The plugin copies **only subscription (oauth) logins**
  into the owned home; API-key entries are dropped (`index.mjs:158-193`, `ownedLoginCopy`). So the harness cannot
  today use an API-key provider configured in opencode.
- **Agentic wizard.** `localRoute` = a one-JSON-object text protocol over any role route plus one repair
  (`src/copilot/agent/route.ts:38-57`); `harnessRoute` = native tool calls through the opencode MCP shim bridge, else
  the text protocol (`src/copilot/agent/bridge.ts:25-49,85-96`). Native tools exist only on the harness route.
- **Outside the role map:** the image director has its own profile select (`src/image/settings.ts:29`,
  call `src/image/runtime.ts:157-163`, host `src/services/stHost/image.ts:68-78`); the sprite stage reuses it with a
  llama.cpp `grammar` (`src/sprites/stage.ts:410`). The judge goes through its own plugin with provider ids
  `typesafe`, `llama-logprob` (`src/judge/providers.ts:3-8`; keys server-side, `server-plugin/story-orchestrator-judge/index.mjs:7-11`).

Consumers per role (callers found by `role:` in `src/`):

| Role | Passes / consumers | Route kinds today |
|---|---|---|
| read | shared read (`extraction/scheduler.ts:505`, `extractionCoordinator.ts:323`), epistemic + ledger (`extractionCoordinator.ts:437,452`), supersession (`memoryCoordinator.ts:490`), memorize backlog (`runtime/memorizeBacklog.ts:118`) | profile, harness |
| synthesis | scene summary, short-term (`extractionCoordinator.ts:368,409`), arc summary (`memoryCoordinator.ts:308`), canon (`runtime/canonSynthesis.ts:71`), chapter seal (`runtime/chapterSeal.ts:175`) | profile, harness |
| authoring | wizard stages (`copilotCoordinator.ts:43`), agentic wizard (`copilot/agent/turn.ts:38,75`), expansion generation (`expansionCoordinator.ts:280`), critic inherits it (`generation/critic.ts:105`, `generate.ts:117`) | profile, harness (+ native tool bridge, opencode only) |
| director | speaker direction (`runtime/wiring/talk.ts:31`) — reply path | profile, harness (2-7 s, `RoleProfilesGroup.tsx:59`) |
| curator | WI curator (`stagecraftCoordinator.ts:193`), create-op suite (`runtime/liveSuite.ts:131`) | profile, harness |
| inner | inner voice (`innerCoordinator.ts:76`) — before the drafted speaker | profile, harness |
| — | image director, sprites | profile only (own select) |
| — | judge | judge plugin providers only |

### 2. What ST already supports

- **Any CC source per profile.** `ConnectionManagerRequestService` accepts Chat Completion and Text Completion
  profiles (`public/scripts/extensions/shared.js:402-407`). A CC profile carries `chat_completion_source`, `model`,
  `api-url`, `proxy` and `secret-id` into `ChatCompletionService.processRequest` (`shared.js:438-466`). Sources
  include openai, claude, openrouter, makersuite (Google AI Studio), vertexai, mistralai, custom (any OpenAI-compatible
  URL), cohere, groq, deepseek, xai, fireworks, azure_openai, moonshot, zai and more (`src/constants.js:187-214`).
- **A non-active profile, by id.** `sendRequest(profileId, …)` reads the profile's fields and never switches the UI
  connection (`shared.js:423-480`). Proven in use: the v2.6 autonomous sessions ran every orchestrator role on the CC
  profile `deepseek 4.1 flash` while the main reply ran on `Artemis RunPod RP` (W28, `docs/plans/v2.6/00-overview.md:185`;
  `docs/plans/v2.6/15-model-config.md:25,71`).
- **Keys stay server-side and can be several per source.** `secrets.json` holds an array of keys per secret slot, one
  active (`src/endpoints/secrets.js:80-88,242-251,277-278`); `readSecret(directories, key, id)` picks by id or the active
  one (`secrets.js:448`). Profiles store `secret-id` (CC and TC, `connection-manager/index.js:50,68,88,179`), and the
  backend reads the key by it (e.g. custom `src/endpoints/backends/chat-completions.js:1801-1802`, claude `:232`,
  deepseek `:1073`). So two `custom` endpoints with two different keys work: two profiles, two `api-url`s, two
  `secret-id`s. With ST user accounts, secrets are per user (`request.user.directories`).
- **Native tool calls pass through.** `createRequestData` forwards unknown props (`public/scripts/custom-request.js:428-451`),
  the override payload wins over the preset (`custom-request.js:609-619`), and the backend forwards `tools`/
  `tool_choice` for Claude (`chat-completions.js:248-292`), Gemini (`:571-640`), several named sources (`:912-914,
  1094-1096, 1206-1208, …`) and the generic OpenAI-compatible path incl. custom/openrouter (`:2636-2637`). ST's own
  ToolManager adds nothing on `quiet` requests (`public/scripts/tool-calling.js:694-699`), which is the type the CC
  request service uses (`custom-request.js:609`). With `extractData:false` we already get the raw JSON
  (`modelReply.ts:177`), so `tool_calls` is readable. **Not verified live**, and the reply shape per source
  (Claude/Gemini conversion to the OpenAI shape) needs a probe.

So the user's "ST does not support this" is mostly not the case: ST connects to many cloud providers, per profile,
with server-side keys, and our role map already routes per role to any of them.

### 3. Gap analysis

What already works: pick a CC profile (any source, own key via `secret-id`) for any of the six roles under Models per
task. Reasoning effort, sampler pass-through and usage metering already understand the main cloud sources.

What does not, and why:

| Gap | Why | Size |
|---|---|---|
| Wizard agent on a CC profile has no native tool calls | `localRoute` uses the text JSON protocol (`route.ts:38-57`); `requestModelReply` reads text only (`modelReply.ts:180`) | new `AgentRoute` passing `tools` in the override payload and reading `tool_calls`; a probe per source first |
| Context limit for a preset-less cloud profile is 8192 except DeepSeek | `CHAT_SOURCE_CONTEXT` lists only `deepseek` (`src/services/stHost/contextLimit.ts:21-28`); v2.6 F6 found the trimming (`v2.6/15-model-config.md:26`) | small: per-source table, or read the model's context from ST's model list |
| Curator create op has no selector of its own | it would ride the `curator` role (`stagecraftCoordinator.ts:193`) | a 7th pass role, default "same as curator" |
| Critic shares the generator's model | critic inherits `authoring` (`critic.ts:105`) | optional 8th role; a different model reduces self-grading |
| Image director / sprites cannot use cloud reliably | sprites pass a llama.cpp `grammar` (`sprites/stage.ts:410`); cloud sources ignore it | `json_schema` path for CC sources (ST supports it, `chat-completions.js:318`) |
| Harness cannot use API-key providers | oauth-only login copy (`harness index.mjs:186-193`), W27 | plugin change + key storage outside ST |
| Cost per call | only when the provider returns `usage.cost` (`modelReply.ts:147`) | OpenRouter gives it; others need a price table |

Options:

| | What | Providers | Keys / privacy | Tool calls (wizard) | Latency | Cost | Effort |
|---|---|---|---|---|---|---|---|
| **A. ST CC profiles per role** (today's seam) | document it; picker groups profiles by source; per-source context; new roles where asked | every ST CC source + any OpenAI-compatible URL | in ST `secrets.json`, server-side, per profile by `secret-id`; ST user accounts respected | text protocol today; native via a new route (ST forwards `tools`) | network only (no spawn) | per-token API billing | small (docs, picker, context table); medium for the native-tools route |
| **B. Provider seam in our plugin** (judge-style) | our own OpenAI-compatible client + keys | whatever we write | a second key store beside ST's | we would implement it | network only | API billing | large; duplicates ST's backend for ~25 sources. Only worth it for something ST cannot do (logprobs for the judge, v2.8 14) |
| **C. Harness CLIs** (opencode; claude/codex) | per-role CLI spawn | the CLI's providers; subscription logins only today | logins in the CLI's home; vendor terms/training rows (`v2.6/12-survey.md:79,173`) | native, via the MCP bridge (built) | 2-7 s spawn per call (`v2.5/13-harness-routing.md:100,109-110`); quota outages seen T6-3 | subscription quota | built; API-key providers need a plugin change; claude/codex need reversing W27 |
| **D. OpenRouter as one gateway** | one CC profile per model, one key | hundreds of models via one source | one key in ST secrets | as A (openrouter takes the generic path, `chat-completions.js:2636`) | network | per-token + reports `usage.cost` | none beyond A |

### 4. Uses that benefit from a separate cloud model

| Use | Role today | Player waiting? | Recommended route |
|---|---|---|---|
| Wizard / agentic wizard | authoring | no (author) | **A**: a strong cloud CC profile (Claude/GPT/Gemini direct, or OpenRouter). Text protocol works now; build the native-tools CC route after a probe. Keep C as an option only |
| Curator create op (v2.8 11) | curator | no (review mode) | **A** with its own role "Lore creation" (default: same as curator). Its floor is per model: a new model needs its own Phase A row |
| Image director | own select | no | **A**, after a `json_schema` path for CC sources; sprites stay on the local llama.cpp grammar |
| Chapter seal | synthesis | no | **A**, long-context cloud model; sends whole chapters (egress row) |
| Canon | synthesis | no | **A**, same profile as chapter seal |
| Expansion generation | authoring | no (pre-generation) | **A**, same as wizard |
| Critic | authoring (inherited) | no | **A**, optional own role on a *different* model than the generator |
| Labelling aid (decision 2) | none, offline | no | **A** from a debug script over a CC profile (no runtime code); C also fine |
| Living-story director (v2.8 22) | not built ("memory or harness profile", old v2.7 24, now `v2.8/22-living-story-director.md`) | no (per anchor) | **A** on authoring, or its own role if it should differ from the wizard |
| Briefing drafting (v2.8 10) | wizard Premise step (old v2.7 03; now `v2.8/10-briefing-drafting.md`) | no | **A**, authoring role |
| Story reads, epistemic, ledger | read | indirectly (state lags) | cheap fast cloud (DeepSeek flash proven) or local; unchanged |
| Director, inner voice | director, inner | **yes** (before a reply) | fast cheap cloud or local only; never C (spawn) |
| Judge | judge plugin | yes for director/lore | stays on the judge plugin (needs probabilities); v2.8 14 for non-TypeSafe |

### Recommendation

**A, with D as the documented easy path, and no B.** ST already gives every role any cloud provider with its keys
server-side; the role map already routes per role, and the v2.6 sessions ran six roles on DeepSeek this way. The work is
small and concrete:

1. Docs (v2.7 01): "use a cloud model for a task" — create a CC profile per provider/model (own `secret-id`), pick it
   under Models per task; OpenRouter as the one-key route; egress per role.
2. Picker: group profiles by source/vendor in `RoleProfilesGroup` and label "cloud" vs "local", so a cloud egress is
   visible where it is chosen.
3. Context limits: per-source table (or ST's model list) instead of `deepseek` only (`contextLimit.ts:21`).
4. New roles only where a use is built: "Lore creation" (v2.8 11), optionally "Critic". Default = same as the parent role.
5. Native tool calls over CC profiles for the wizard agent: spike on two sources first, then a `profileToolsRoute`
   beside `localRoute`/`harnessRoute`. Floor = v2.6 plan 11's agent checks on the same fixture. *Superseded by review
   B6: the user has no OpenRouter or Anthropic API key, so the spike runs on the DeepSeek API CC profile and the opencode
   subscription route (§Build in v2.7, "Not in v2.7").*

C stays as built (opencode, W27); reopening API-key harness providers adds a second key store for no provider ST lacks.
B only if v2.8 14 needs a logprob provider ST cannot proxy.

For decision 4 (if A-as-judge were wanted anyway): no judge use benefits from a verbalized cloud model enough to justify
a contract per use; the off-path value is in the generative roles above, not in the judge.

### Decisions for the user (this research)

1. Route cloud models through ST Connection Manager profiles per role (option A), with OpenRouter documented as the
   one-key path? **Rec: yes.** I dont use openrouter, but i know its possible to have jev and everything else there. I do have a claude and codex subscription and the deepseek one we've been using.
2. Add a "Lore creation" role for the curator create op (plan 12), defaulting to the curator's route? **Rec: yes, only
   when plan 12 builds.** Also a separate "Critic" role? **Rec: optional, after the wizard work.** sure
3. Spike native tool calls over CC profiles for the agentic wizard (OpenRouter + one direct source), then build the route
   if it passes plan 11's agent checks? **Rec: yes.** sure
4. Keep the harness at opencode with subscription logins only (no API-key providers, W27)? **Rec: keep.** keep
5. Build our own provider seam in the plugin (option B)? **Rec: no**, unless plan 15 needs it for logprobs. as you recommend
6. Fix the 8192 context default for preset-less cloud CC profiles (per-source table)? **Rec: yes, small, v2.7 carry-in.** yes

## Review 2026-10-03

Applied: B6 refined (no OpenRouter or Anthropic API key: the native-tool spike runs on the DeepSeek API plus the opencode
subscription route; OpenRouter stays docs only), the Claude-B note "13 decisions need a home" (role picker grouped by
source and per-source context table here, as v2.7 02 C14; Lore-creation role → v2.8 11; Critic and the CC native-tool
spike: questions), F36 ("plan 11 agent checks" = v2.6 plan 11), Sol split item 5 (picker + table deterministic here;
enlarged extraction inputs keep a real-model row in v2.8 01), B4 (labels from Adolion evidence checked by a second
model), B12 (references).

Round 3 (Sol): R3-15 applied; its homes decided by the user 2026-10-03 (as recommended).

## Gate record

2026-10-03, branch `worktree-agent-a1eb7b669f3b8ce6a` (merged `master` at `7371a44e` first), code commit `8f850724`.
Built together with v2.7 02 C14 (same files); not merged into master (the lead merges after freeze-2).

| Item | Built |
|---|---|
| 1. Picker grouped by source | `src/utils/profileGroups.ts` (pure): `profileLocality` labels a profile `local` (a self-hosted TC backend, or a CC `custom` endpoint, on a loopback/LAN/link-local address or with no URL for a TC backend) or `cloud` (every other CC source, the hosted TC services, any public host such as a RunPod proxy URL); a profile whose API the host map cannot resolve is `unknown` and keeps the old "Connection profiles" group, never claimed local. `groupProfiles` groups by source + locality, local first, then cloud, then unresolved, vendor names from ST's source/type ids. `stHost/connectionProfiles.ts` now returns `kind`, `source` (CC source or TC type from `CONNECT_API_MAP`) and `apiUrl`. `ProfileOptions.tsx` renders the optgroups (`data-so="profile-group"`, `data-locality`); used by every profile select in the Memory model group: memory model profile, fallback, Models per task and the per-role harness fallback. A task explicitly on a cloud profile shows `data-so="role-egress"` `data-locality="cloud"`: what it sends and to which provider. Harness routes keep their own group. No route, setting or request changed |
| 2. Context table | see v2.7 02 C14 gate record |
| 3. Docs | `docs/guide/setup/memory-model.md` §"Use a cloud model for a task" (one CC profile per provider/model with its own saved key, DeepSeek API as the worked example, Claude/ChatGPT subscriptions only through the opencode harness (W27), OpenRouter as an alternative, egress per task) and §"How much the model is sent" (the precedence) |
| Registry (rule 9) | no new feature or setting: the `models-per-task` entry's `what` now says profiles are grouped and labelled and a cloud task names its egress; `src/features/registry.test.ts` green |

**Model input (rule 6):** the picker changes nothing sent. The context table does (v2.7 02 C14 record); its real-model
row is `v2.8/01-v27-carry-over.md` §B C14-b.

Gates (tier D), all on the branch after the code commit:

| Command | Result |
|---|---|
| `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook` | all green: typecheck, typecheck:test, lint, test (502 suites passed, 1 skipped; 6141 tests passed, 1 skipped), build, build:dev, test:debug (87 pass, 3 skipped), debug:typecheck, test:release, test:replay, test:plugin; Storybook skipped by the flag and run separately below |
| `npm run typecheck:test` | green (inside the gates run) |
| `npm run storybook:build` (to `.sb-static`), `npx http-server .sb-static -p 6063 -s -c-1 -a 127.0.0.1`, `node node_modules/@storybook/test-runner/dist/test-storybook.js --index-json --url http://127.0.0.1:6063` | 71 suites, 447 tests passed (includes the new `Settings/RoleProfilesGroup` `GroupedBySource` story with its a11y check); server stopped |
| prod bundle `dist/index.js` | 1,117,438 B (budget 1,250,000 B) |

Live gate: **NOT run** (no ST, lanes, pod or ComfyUI in this build session). The tier-D live row in `16-test-plan.md`
(the picker on a lane with a TC, a DeepSeek CC and a harness route in the right groups; run header `profiles` diff empty)
is still owed.

Deviations:
- **The image director's select is not grouped.** The plan says "same for the image director's select"
  (`src/image/ImageGroup.tsx`); the build brief limited settings edits to the Memory model group. `ProfileOptions` is a
  drop-in for it (one line), left for whoever owns the Images group.
- The locality rule is mine (the plan says only "cloud" or "local"): a RunPod pod reached through a loopback SSH tunnel
  reads `local`, because the request leaves SillyTavern for a loopback address; the same pod through its public proxy URL
  reads `cloud`. Stated in the tests.

Open questions:
- Should the image director's select (Images group) take `ProfileOptions` too, and who builds it?
- Should "Same as memory model" also show the cloud egress line when the memory model profile is cloud? Built: only
  where a profile is explicitly chosen.
