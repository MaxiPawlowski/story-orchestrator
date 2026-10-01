# Plan 15 Part A item 5: model configuration audit

Date: 2026-10-01. Pod `5mmoei8glfi1gu` (RTX PRO 4500), llama-server b11046, model `TheDrummer_Artemis-31B-v1.1-Q4_K_M.gguf`, through the SSH tunnel at `127.0.0.1:18080`. Measured on lane 1, which was freshly seeded from adolion-fresh. The real install (`C:\dev\SillyTavern-MainBranch`, ST at :8000) was only read.

Decisions in force (user, 2026-09-30):
- Main RP runs on Artemis via the profile `Artemis RunPod RP`.
- Every orchestrator role stays on DeepSeek flash (profile `deepseek 4.1 flash`).

## What the product actually sends (source-verified)

- **`ConnectionManagerRequestService.sendRequest` applies only the profile's `preset` and `instruct`.** It never applies the profile's system prompt, context template or reasoning template (`public/scripts/extensions/shared.js:462-482`, `custom-request.js:284-330`). Those fields matter only when a profile is *selected* as the main connection with `/profile`. The captured prompt below has no system block.
- **Our passes send all four TC budget keys** (`max_tokens`, `max_new_tokens`, `n_predict`, `num_predict`; `modelReply.ts` `textCompletionBudget`). A raw `sendRequest` does not: the probe below carries `max_tokens 160` next to the preset's `n_predict 600`. That is an ST quirk, and our product path already covers it.
- **A CC profile with no preset receives our per-pass samplers** (temperature 0.1, top_p 0.9 for reads; `samplerPayload` `hasPreset`). Without a preset, the context limit falls back to the 8192 default (`readProfileContextLimit`). See F6.

## Findings

| # | Profile | Field | Before | After | Where fixed | Proof |
|---|---|---|---|---|---|---|
| F1 | `Artemis RunPod` (`b907b9ce`) | instruct | `Gemma 4 Thinking` (its story-string prefix injects `<\|think\|>` plus a planning instruction when the profile is selected) | `Gemma 4` | lane 1; seed patch; real install recorded below | P2 |
| F1 | `Artemis RunPod` | preset | `Artemis v1.1` (adaptive_target 0.25: the adaptive-P setting that produced garbage, see memory `artemis-rp-config`) | `Artemis v1.1 RP` (adaptive_target -0.01, dry 0.8/4096) | same | P2: `adaptive_target -0.01`, temp 1 |
| F1 | `Artemis RunPod` | model | `gemma4-mtp` (stale; llama-server ignores it) | removed | same | P2: request carries no `model` |
| F2 | `Story Orchestrator Memory Local` (`afcc7073`) | whole profile | `generic` at `:1235`, no preset; nothing routes to it | removed (only if no role, image or sprite route names it) | lane 1; seed patch; real install recorded below | P1: `API request failed \| cause: Response not OK` in 310 ms |
| F3 | `Story Orchestrator Memory RunPod` (`c400ff9a`), `Story Orchestrator Memory Unsloth` (`55f61212`), `Image Director` (`68422a21`) | sysprompt / sysprompt-state | `Sphiratrioth - Roleplay - 3rd person` / `true` | removed / `false` (ST's own convention for an off state, `connection-manager/index.js:236`) | lane 1; seed patch; real install recorded below | P3 |
| F4 | `Artemis RunPod RP` (`4581c7d9`) | all | TC `llamacpp` :18080; instruct/context `Gemma 4`; reasoning `Gemma 4`; preset `Artemis v1.1 RP`; sysprompt Sphiratrioth | unchanged (correct) | n/a | P4: real turn |
| F5 | `deepseek 4.1 flash` (`975bc0dc`) | source/model/samplers/reasoning | CC `deepseek`, model `deepseek-flash`, no preset; temperature 0.1 / top_p 0.9 sent per pass; `include_reasoning` absent → `thinking: disabled`, `reasoning_content` empty; every role at effort `default` | unchanged (correct) | n/a | P5 |
| F6 | `deepseek 4.1 flash` | context limit used by the read budget | **8192 (default: "the profile names no settings preset")**. DeepSeek V4 flash takes 1M (ST `openai.js:5882`). At turn 1 on Adolion war the read used 5616 of 6860 input tokens, so a few turns more and windows get trimmed, and the 1024 retry stops fitting | 131072 for a preset-less CC profile on source `deepseek` (`CHAT_SOURCE_CONTEXT`); source `"source"` in the capability read-out | code branch `v26-model-config` | unit tests; live after merge |
| F7 | per-role budget `sharedRead` (plan 05) | first-ask max tokens | **512**: 15 of 20 DeepSeek reads hit `finish: length` and were re-asked at 1024, so 35 calls did the work of 20 | 1024 (retry doubles to 2048) | code branch `v26-model-config` | P5 counts; unit tests |
| F8 | pod llama-server flags | `--host 127.0.0.1 --ctx-size 196608 --parallel 4 --kv-unified --cache-type-k/v q8_0 --flash-attn on --jinja --no-slots` | n_ctx per slot 196608 (unified pool), 4 slots | unchanged | n/a | `/props`: `total_slots 4`, `n_ctx 196608` |
| F9 | `max_context` / `truncation_length` 98304 vs pod ctx 196608 | | 98304 per request | unchanged, deliberately: the 196608 pool is shared by 4 slots, so 98304 lets two maximal requests run at once. Real prompts are about 6k tokens (main turn `tokens_evaluated 6055`) | n/a | P4 |
| F10 | `stripReasoningBlocks` coverage | | Artemis on TC emits an empty `<\|channel>thought\n<channel\|>` before every reply, with thinking off | covered: the main chat's reasoning auto-parse (`Gemma 4` template) strips it (P4 `extra.reasoning ""`, mes clean), and product passes are covered by `parse.test.ts:80` (the empty-block case) | n/a | P1, P4 |
| F11 | `Artemis Local (Unsloth)` (`beba5264`), the **selected** profile on the real install and therefore on every fresh lane | api-url | `generic` :18888 answers `401 Not authenticated` to a plain request | unchanged (it is the user's local profile). Lanes must `/profile Artemis RunPod RP`, which the so-session pin does. **Any other script on a fresh lane talks to :18888 until it switches.** | n/a | `curl :18888/v1/models` → `authentication_error` |
| F12 | API type for Artemis | | every Artemis profile is TC (`llamacpp`, raw `/completion` prompt) | unchanged. TC is correct here: the `Gemma 4` instruct template keeps thinking off. A CC profile on this server would go through `--jinja` and needs `chat_template_kwargs {enable_thinking:false}` (gotchas.md). No CC profile points at the pod | n/a | P1/P4 request shape |

## Proofs (real calls, lane 1, 2026-10-01 ~11:05–11:20 UTC)

**P1. Every profile through `sendRequest` before the fixes.** Prompt: "In two sentences, describe a rainy harbor at dusk.", max 160.

Each Artemis profile sent the prompt `<|turn>user\nuser: …<turn|>\n<|turn>model\n` with stops `<turn|>`, `<|turn>user`, `<|turn>model`, `<|turn>system`, `truncation_length 98304`, `add_bos_token true` and `skip_special_tokens true`. None of the requests carried a system block.

| Profile | Samplers | Reply |
|---|---|---|
| `Artemis RunPod RP` | temp 1, min_p 0.05, dry 0.8/4096, adaptive -0.01 | `<\|channel>thought\n<channel\|>Rain-slicked cobblestones reflect the amber glow…` (eos, 48 tokens, 2.4 s) |
| `Story Orchestrator Memory RunPod`, `Image Director` | temp 0.6, dry 0, preset `Artemis Extraction` | ok |
| `Artemis RunPod` (stale) | temp 1, adaptive 0.25, plus `model: gemma4-mtp` | ok |
| `Story Orchestrator Memory Local` | — | `API request failed \| cause: Response not OK` |

**P2. F1 after the fix.**
- `/profile Artemis RunPod` now sets instruct `Gemma 4`, with story-string prefix `<|turn>system\n` (no `<|think|>`), preset `Artemis v1.1 RP`, temp 1 and adaptive -0.01.
- Probe request: `temp 1, adaptive -0.01`, no `model`. Reply: "Golden light spills from swinging lanterns, casting amber shadows across weathered timber beams…"

**P3. F3 after the fix.**
- `/profile Story Orchestrator Memory RunPod` sets `sysprompt.enabled false` and preset `Artemis Extraction` at temp 0.6. Probe reply: "Warm amber light spills from weathered lanterns…"
- `Image Director` probe reply: "Warm light spills from swinging lanterns…"
- `/profile Artemis RunPod RP` afterwards restores `sysprompt.enabled true` with the Sphiratrioth prompt, `Gemma 4`, `Artemis v1.1 RP` and temp 1.
- On-disk check of `so-lanes/1/.../settings.json`: the three non-RP profiles carry `sysprompt-state "false"`; save answered `POST /api/settings/save` 200.

**P4. Main RP, real turn.**
- Setup: a new chat in the group `Adolion - Fire and War` (`1790852149187`), chat `2026-10-01@08h07m01s032ms`, story `adolion-war`, requirements ready.
- Player line: "I step into the war council tent, shaking the rain from my cloak, and ask the Narrator what news has come from the northern front."
- Request (`/api/backends/text-completions/generate`):
  - `llamacpp` :18080, streaming;
  - `max_new_tokens/max_tokens/n_predict 600`, `truncation_length 98304`;
  - `temperature 0.8`: the story's authored checkpoint preset overlay "Adolion: War Council" (`{temperature: 0.8}`), journaled in the effect ledger. This is correct.
  - min_p 0.05, dry 0.8/4096;
  - stops: the cast names plus the Gemma turn markers;
  - prompt 26,431 chars, opening `<|turn>system\nImpersonate Adolion Narrator…` (the Sphiratrioth system prompt), closing `<|turn>model\nAdolion Narrator:`;
  - the server evaluated 6055 tokens.
- Reply (Adolion Narrator, 588 chars, in character): "The war council tent is pitched in the mud outside the palace, rain drumming on canvas. King Alexander stands by the map table…" `extra.reasoning ""`, and the message carries no thought tokens.

**P5. DeepSeek shared read, real product path.**
- Trigger: cadence 1 after P4, plus the forced cue reads. Each call was `/api/backends/chat-completions/generate` with `chat_completion_source deepseek`, `model deepseek-flash`, `temperature 0.1`, `top_p 0.9`, one user message (about 16–22k chars, opening `[STORY STATE READ — output structured lines only…`) and `max_tokens` 512.
- Representative reply (`finish stop`, prompt 3938 / completion 420 tokens): `DELTA q=location value="war_throne_room" evidence="Zegallan banners from the last war hang above the palace map table."` … `FACT importance=3 text="The Crown seeks a free company…"` … `MEMORY type=scene …`. `reasoning_content` was empty.
- Audits: 20 reads, all accepted (2 deltas each, 0 rejected). The epistemic and ledger passes also ran on DeepSeek, each with a well-formed reply.

## DeepSeek calls made by this audit

Every call came from the one product turn (P4/P5) and the story selection before it. No direct DeepSeek probe was sent.

| Calls | Breakdown | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| 37 captured (38 in the model-call ring) | 35 story reads, 1 epistemic, 1 ledger | 171,282, of which 127,744 were cache hits | 20,465 | `usage.cost` is null: DeepSeek does not return a cost, so spend has to be priced from the token counts |

Judge (TypeSafe) calls of the same turn are separate and are not counted here.

## Changes

### Lane 1 (applied, live)

Applied in-page and saved by ST (`POST /api/settings/save` 200):
- F1, F2 and F3 exactly as in the table.
- Backup before the change: `C:\dev\so-lanes\backups\lane1-settings-20261001T081635.json`.
- The selected profile was left on `Artemis RunPod RP`.
- The P4 sandbox chat was left on the lane copy. It is harmless; re-seed to drop it.

### Real install: NOT edited, because ST at :8000 is running

Backup taken anyway: `C:\dev\so-lanes\backups\settings-20261001T081635.json`. The live page saves its in-memory settings over the file, so an edit on disk now would be lost or would fight the page.

Apply either in the :8000 UI (Connection Manager → edit each profile), or with ST stopped:

```python
import json; p=r"C:\dev\SillyTavern-MainBranch\data\default-user\settings.json"
s=json.load(open(p,encoding="utf-8")); cm=s["extension_settings"]["connectionManager"]
cm["profiles"]=[x for x in cm["profiles"] if x["id"]!="afcc7073-3510-4f67-8070-35ce449d4792"]          # F2
for x in cm["profiles"]:
    if x["id"]=="b907b9ce-a720-4858-8ff1-fbe604169a24":                                             # F1
        x["instruct"]="Gemma 4"; x["preset"]="Artemis v1.1 RP"; x.pop("model",None)
    if x["id"] in ("c400ff9a-4fc7-4012-b095-ba1b4f40c0e5","55f61212-a59e-4bf3-9dcd-4029845293c4","68422a21-7c97-4af8-a1ca-bbe44d83d138"):  # F3
        x["sysprompt-state"]="false"; x.pop("sysprompt",None)
json.dump(s,open(p,"w",encoding="utf-8"),indent=4,ensure_ascii=False)
```

### Code branch `v26-model-config` (worktree `C:\dev\so-cfg-wt`, not merged)

- **Seed patch:** `scripts/debug/lib/adolionFresh.mts` `laneProfiles()` runs inside `stripPlan`, before the lane server starts.
  - It applies F1 (aligned to `Artemis RunPod RP`), F2 (only when no route names the profile) and F3.
  - It reports the changes in `removed.profiles`.
  - It is idempotent, with tests in `adolionFresh.test.mts`, including the control that a routed dead profile is kept.
  - So every adolion-fresh seed inherits correct profiles even before the real install is fixed.
- **F7:** `MAX_TOKENS_TABLE.sharedRead` 512 → 1024, and `runSharedRead` now sends it on the first ask; the length retry doubles it, up to 2048.
- **F6:** `readProfileContextLimit` gives a preset-less CC profile on a listed source its known context (`deepseek: 131072`, deliberately below DeepSeek's 1M to bound spend), with `ContextLimitSource "source"`. The settings read-out names it.
- Gates: see the gate record below.

## Needs the lead's decision

1. **Merge `v26-model-config`** (F6, F7 and the seed patch). The F6/F7 live proof needs it staged into ST. Staging touches every lane, so it was not done while lanes 2–4 are in use.
2. **Forced-cue reads multiply DeepSeek spend.** This is not a model setting, but it is the largest cost seen. On `adolion-war`'s hub checkpoint, 9 transitions share broad `extractor_trigger` regexes (`banner|company|go|…`). Each matching transition queues its own P0 read of the same window, so one turn produced 9 identical cue reads plus the cadence read: 19 reads over 2 boundaries, about 171k input tokens. Two fixes, which can be combined: dedupe cue reads per window and boundary in the product, and narrow the campaign's triggers. This belongs in the prompt and spend review.
3. **Epistemic budget:** its 384-token floor hit `finish: length` once on DeepSeek (1 of 2 calls). Raise the floor (e.g. to 768) if the next run repeats it.
4. **Real install F1–F3:** apply them in the :8000 UI, or with the script above once ST is stopped. Deleting `Story Orchestrator Memory Local` (F2) is the user's call on their own install.
5. **Model id:** `deepseek-flash` is accepted, and the API echoes `deepseek-flash`. ST's canonical id is `deepseek-v4-flash`. Leave it, unless the provider deprecates the alias.

## Gate record

Branch `v26-model-config`, commit `747d88d7`, on top of master `30e40711`. Worktree `C:\dev\so-cfg-wt`.

| Command | Result |
|---|---|
| `npm run typecheck` | green |
| `npm run typecheck:test` | green |
| `npm run lint` | green, after one `max-len` fix in `CapabilitiesGroup.tsx` |
| `npm test` | 399 suites passed, 1 skipped; 5204 tests passed, 1 skipped |
| `npm run test:debug` | 738/738 |

Notes on the gate runs:
- **`test:debug` needs a build first.** Its first run in the fresh worktree failed 1 test, `so-run-header` "reads plan 08's nested manifest", because the worktree had no `dist/manifest.json`. After `npm run build` it passed 738/738.
- **A flaky suite.** `src/runtime/spikes/reasoningEffect.test.ts` failed once inside a full run and passed alone, both in this worktree and on master (34/34). It is order-dependent and does not touch these files.

Live gates:
- F1, F2 and F3 were proven on lane 1 (P1–P3), the main RP on lane 1 (P4) and the DeepSeek read on lane 1 (P5).
- **F6 and F7 are NOT live-proven.** They need the branch merged and staged, which was not done (see the decisions above).
