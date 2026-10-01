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

## 2026-10-01 (afternoon): Artemis word-dropping and line loops, DRY A/B

Two symptoms were reported by plan 14 Part B.
- **Word-dropping** comes from T1-2-1, msgs 23, 25 and 26. It is mild in 23 ("Ourra-light", "falis"). Msg 25 (Dalan) is unreadable ("bow sliding his into grip … Ashs looks Belle then Tal, nods"). Msg 26 (Belle) drops its articles, with msg 25 already in its context. The prompts were about 42–46k characters, and the server evaluated 9.9–10.5k tokens.
- **Line loops** come from T1-3-1, msgs 48, 51, 53, 54, 56 and 58. Each reply runs to the 600 cap repeating "The valley is quiet." or "The air is still." The first one is msg 48, captured as request #90 (56.8k characters, 13.7k tokens).

Every request used the profile `Artemis RunPod RP` and the preset `Artemis v1.1 RP`, read from `data/default-user/TextGen Settings/Artemis v1.1 RP.json`:
- `temperature` 1 (the war checkpoint's 0.8 overlay before the front, 1 after it);
- `min_p` 0.05;
- DRY: `dry_multiplier` 0.8, `dry_base` 1.75, `dry_allowed_length` 2, `dry_penalty_last_n` 4096, `dry_sequence_breakers` `["\n", ":", "\"", "*"]`;
- `top_n_sigma` 0, `xtc_probability` 0, `adaptive_target` -0.01 (off), `repeat_penalty` 1, `top_k` 0, `top_p` 1.

The session prompts and bodies came from `test/sessions/T1/T1-2-1/payloads.jsonl` (#37, #39) and `T1-3-1/payloads.jsonl` (#90). They were replayed through the pod's `/completion`, one call at a time, with `n_predict` 400 (200 for the loop arm). The harness is `C:\dev\so-lanes\artemis-ab\ab.py` and the full log is `calls.jsonl`.

**Fixed seeds are not reproducible on this server.** The server runs 4 parallel slots with `--kv-unified`, and the same seed and body gave different text across runs. So every arm is n=1–4 samples, not a controlled pair.

### The metric that names the cause

Each call also asked for `n_probs: 1`, which returns the model's raw (pre-sampler) probability of the chosen token and of the top token. The metric `belowMinP` counts chosen tokens with raw probability < 0.05 × the raw top.
- With `min_p` 0.05 and no penalties, such a pick is impossible.
- Every such pick is therefore a token the model did not want, chosen because a penalty pushed the model's own choice down.

Examples from the base preset:

| Context | Picked (raw p) | Model wanted (raw p) |
|---|---|---|
| "He looks at the player" | " as" (0.011) | "," (0.82) |
| "He looks at Belle" | " and" (0.037) | "," (0.93) |
| "We ride as the" | " Lantern" (0.05) | " Ash" (0.94) |
| "the blue crystal at the" (n1024 arm) | " tip" (0.03) | " top" (0.97) |

**Each of these is DRY punishing the model's own stock phrasing.** Late in a session the chat is full of "He looks at the player, and his …" and "A beat, and …". "\nHe looks at the player" is a 5-token match, so DRY takes 0.8 × 1.75³ ≈ 4.3 logits off the right comma. `min_p` is applied after DRY, relative to the penalised top, so junk continuations pass the filter. That is where "theis the", "a small, smile", "this've", "theLash" and "hisL-s-" came from. The curly apostrophes in msg 26 ("We’re") are the same mechanism: the straight `'` was penalised.

**The loop is the same imitation, which DRY cannot see.** "\n" is a sequence breaker, so a match never spans more than one line. "The valley is quiet." is about 5 tokens, so DRY's largest penalty on it is about 2.45 logits, against a loop the model holds at p ≈ 0.99. In the loop arm below, the base preset has `belowMinP` 0 to 1 per 200 tokens: DRY barely touches the loop.

### Arms

Prompts:
- **W** = T1-2 #39 (Dalan, 10.5k tokens). T1-2 #37 (Talis, 9.9k) is noted where used.
- **L** = T1-3 #90 plus the first 4 lines the live reply actually produced ("…The valley is quiet." ×3). L measures whether the samplers break out once a loop has started.
- **S** = T1-2 #1 (Tobias, the first turn, 4.6k tokens).

| Arm | Overrides | Prompt: samples | belowMinP (picks / tokens) | Reading |
|---|---|---|---|---|
| base | none | W: 4, Talis: 2 | 9/932 metered, plus a probe of 3/322 | 3 of 6 have merged or dropped words ("theis the", "this've gone", "a small, smile", "the looks at", "theis eyes"); the rest clean. The severity of msg 25 was not reproduced |
| dryoff | `dry_multiplier 0` | W: 2 | (n/a) | 1 of 2 loops a full line 3×, with "bright and and" (the 2026-09-19 failure) |
| n1024 | `dry_penalty_last_n 1024` | W: 4, Talis: 1 | 1/392 metered | 1 of 5 corrupt ("there-s-", "hisL-s-", "Lanterners") |
| n512 | `dry_penalty_last_n 512` | W: 2 | (n/a) | 1 of 2 has "as if if" and "theLash", then a line loop ("The Ash Lanterns." ×4) |
| m04 | `dry_multiplier 0.4` | W: 2 | 2/359 | both readable; 1 has "the looks at" (the shared seed prefix) |
| al4 | `dry_allowed_length 4` | W: 2 | 5/542 | 1 of 2 loops ("We'll have to be very ready." ×6) |
| base | none | L: 2 | 1/400 | **2/2 loop to the cap** (33 and 31 repeats). Reproduced |
| nobrk | breakers `[":", "\"", "*"]` (no "\n") | L: 2, plain #90: 2 | 5/150 | **2/2 escape the loop** (eos after 10–29 tokens) |
| cand | nobrk + `dry_multiplier 0.5` + `dry_allowed_length 3` | L: 2, W: 2, Talis: 2, S: 2 | 13/1387 | L: 2/2 escape. **W and Talis: 2 of 4 collapse.** One spells letters ("heL-I-L-E-S-O-T-O-O-R-O-S-A-M-E-R-O-A-D…"); the other runs "her pale face pale and pale…" for 8 lines. S: 2/2 clean, no loop |
| rp | `repeat_penalty 1.05`, `repeat_last_n 256` | L: 1, W: 1 | 5/331 | L: **still loops** (33 repeats). W: readable |

### Reading

- **Both symptoms are reproduced.** Word-dropping is reproduced in its mild form (3 of 6 base samples); the severity of msg 25 was not seen in 20+ samples. The loop is reproduced 2/2 from the live onset.
- **Cause: the model imitates itself in context, and DRY handles that imitation badly in both directions.**
  - Within a line, DRY over-penalises short stock phrases and drops or merges words.
  - Across lines, the "\n" breaker leaves line loops unpunished.
  - The symptoms appear late in a session rather than at a prompt length, because a long chat is mostly the model's own formulaic prose.
- **No DRY setting tested fixes both.**
  - Taking "\n" out of the breakers is the only lever that breaks the loop. On long prompts (even at multiplier 0.5 and allowed length 3) it produced the worst output measured: DRY then penalises every repeated multi-line structure and forces the model out of distribution. This must not ship.
  - A smaller window or multiplier (n1024, m04) lowers the over-penalty rate but does not remove it: n1024 still gave "hisL-s-". Neither changes the loop, which never relies on the window.
  - A mild classic repetition penalty does not break the loop.
- **What we inject is not the seed.** Request #90 was checked.
  - The injected blocks (narrator guidance 14.7k characters, `[Earlier scenes]`, `Current state` with 34 one-line facts, `[Recent events]` with the pacing line, `[Scene: dawn. Present: Kanna.]`) contain no duplicated line. "quiet" appears 2× and "A beat" 0×.
  - All 19 "A beat" and both "The valley is quiet." in the prompt are the model's own earlier replies. **Msg 45, the narrator's previous turn, already ended "A beat, and the valley is quiet.\nThe valley is quiet."**, and that is the seed of msg 48.
  - Two injection-side contributors are worth a prompt review, not a fix here:
    1. **The narrator is drafted with nothing new to narrate.** Kanna has just spoken for herself, and the guidance says "Narrate only the world and the characters outside the group … Concrete sight, sound and smell". The pacing line says "sustain the mood without spiking or releasing it … End on the world". Together they invite pure atmosphere lines.
    2. **The `Current state` block is a 4.5k list of terse one-line facts** at depth ~1. It is the last thing before the reply, in the same terse-line register as the loop. Its goals are also stale (Dalan's active goal "Get the horses", Forre "location=war room").

### Recommendation

**Preset: no change.** Keep `Artemis v1.1 RP` as it is (DRY 0.8 / 1.75 / 2 / 4096, breakers `["\n", ":", "\"", "*"]`). Every tested arm is either no better on one symptom or worse on the other, and the one arm that breaks loops corrupts long-context prose. Since no preset change is recommended, there is no JSON diff and no seed-time patch. Lanes copy `TextGen Settings` from the real install at seed, so a future change would need one.

What to do instead, in order:
1. **Swipe a reply with a repeated line at once** (the memory note `artemis-rp-config` already says one spiral seeds more). For plan 14 Part B: when a reply repeats any line ≥3 times, or shows a broken run like msg 25, the autonomous driver should `swipe-new` or `regen` before the next turn, and record it as a model defect, not a product finding. Otherwise every later turn plays inside the loop, as msgs 51–58 did. A loop guard has to live in the harness or the product: llama.cpp offers no sampler that punishes a repeated short line without also hitting stock phrases.
2. **Prompt review (plan 15 prompt audit):**
   - Do not draft the narrator for a turn on which an in-group character has just spoken and nothing in the world changed. Or give the narrator guidance a "if nothing changes, one short line" escape.
   - Soften "sustain the mood … End on the world" for that case.
   - Consider moving `Current state` above the chat history, or rendering it as prose.
3. **The next sampler arm, if the lead wants more data:** "\n" kept, with `dry_penalty_last_n` 1024 and `dry_multiplier` 0.6, for word-dropping only. It needs about 10+ samples per arm, because the seeds do not reproduce.
4. **Not pursued:** the msg 25 request was sent twice, 0.2 s apart (#39 and #40, same Dalan prompt), into the 4-slot `--kv-unified` server. No replay came close to msg 25's damage. Whether the concurrent duplicate on shared slots made it worse is untested.

Calls to the pod: 40 in total (`/health`, `/props`, then 38 `/completion` with `n_predict` ≤ 400), all sequential.
