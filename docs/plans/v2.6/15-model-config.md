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

## 2026-10-01 (evening): Server-flag A/B (A100)

Dedicated pod `jlur25ufnngbia` (A100 SXM 80 GB, EU-RO-1, $1.59/h), 15:18–17:27Z, **129 pod minutes (~$3.40)**, then stopped. The production pod `5mmoei8glfi1gu` was only read (`get-pod`, to get its GPU). Re-runnable kit, raw rows, logs and testsets: `C:\dev\so-lanes\artemis-flags\` (README there). Research input: `15-model-research.md`.

### Setup, and what it cannot show

- **The production binary does not run on an A100.** `/workspace/llama/bin/llama-server` (b11046) is built for CUDA archs `89;120` and exited at load. The test binary is the **same tag b11046** (commit `60081bb2`) built for sm_80, plus the latest tag **b11321** (`b0aca3c6`) for one arm. CUDA 12.8 (not 13.2), driver 13.0. Blackwell (sm_120) kernels were not testable here. Since both symptoms reproduced on the A100 (below), neither one is Blackwell-specific.
- The models were copied to `/dev/shm` (RAM, not the volume). Every GGUF sha256 matches the Hugging Face LFS oid. The production Q4_K_M is bartowski's file (`0637f894…`).
- The same bodies were used as in the morning A/B, all with the recorded sampler params (temperature 1, min_p 0.05, DRY 0.8/1.75/2/4096 with breakers `\n : " *`), `n_predict` 400 and `n_probs` 1:
  - **W** = #39 Dalan;
  - **T** = #37 Talis;
  - **B** = #42 Belle, whose context holds the broken msg 25;
  - **L** = #90 + 4 live loop lines;
  - **L0** = #90 bare;
  - **S** = first turn.
- Two llama-server instances shared the GPU (ports 8080/8081). Screening tok/s is therefore halved; the solo numbers are in the capacity table.
- Metrics:
  - `corrupt` = word damage in W/T, **hand-read** (detector hits that were false positives are excluded);
  - `B drop` = article-dropping in B (the detector's `noart`/`dbl`/`detfunc` hits, spot-read);
  - `forced` = chosen tokens below 0.05 × the raw top probability, i.e. picks a penalty forced;
  - `loop` = an identical line ≥3× or an identical sentence ≥4×.

### Reproduction (production flags: ctx 196608, `-np 4`, `--kv-unified`, q8_0 KV, b11046)

- **Loop: reproduced.** L looped 4/4 sequentially and 8/8 with 4 concurrent requests.
- **Word damage: reproduced at a low rate.**
  - W/T: 1 of 40 replies over the three production runs (sequential, 4-concurrent, 8 extra seeds). The hit was card text bleeding in mid-sentence: "…a magic-hunger that isTalis Dacaryn is a young elven wiza…".
  - Across all the production-sampler server arms: 7/125.
  - Every damaged site that was read sits on a forced pick. The model wants "He looks at the player", DRY pushes "player" down, and the junk passes min_p. That produced "He looks at the and his cheeks", "looks up at the the player", "with the a bare whisper", "theis direction" and "heL eyes … hisL eyes".
  - **B damage reproduces readily: 31/88 across all non-template arms.** Examples: "Belle's on feet", "hammers into palm", "Ashs". These picks are **not** forced (forced = 0). The model imitates the broken msg 25 in its context.
- So the A/B is valid on this hardware.

### Arms (Artemis v1.1 Q4_K_M unless noted)

| Arm | Change vs production | W/T corrupt | B drop | L loop | L0 loop | forced/100 tok | VRAM (MiB) |
|---|---|---|---|---|---|---|---|
| A0 prod (seq + conc4 + 8 more seeds) | none | 1/40 | 5/20 | 12/12 | 1/8 | 0.6–0.9 | 31 052 |
| A1 KV f16 (seq + conc4) | `-ctk/-ctv f16` | 1/16 | 2/8 | 4/4 | – | 0.8 | 38 512 |
| A12 f16, np2, ctx 98304, no unified | f16 + 2 slots | 2/8 | 2/4 | 4/4 | – | 0.85 | 29 466 |
| A2 np1, ctx 65536, no unified | 1 slot | 0/8 | 2/4 | 4/4 | – | 1.3 | 23 180 |
| A10 np4 unified, ctx 65536 | ctx only | 0/8 | 3/4 | 4/4 | – | 0.6 | 24 460 |
| A3 b11321 (latest) | binary | 1/8 | 1/4 | 4/4 | – | 0.6 | 31 052 |
| A6b `--swa-full`, f16, np1, ctx 20480 | SWA full | 1/8 | 2/4 | 4/4 | – | 0.6 | 36 976 (at 20k ctx) |
| A8b FA off, f16, np1, ctx 20480 | `--flash-attn off` | 0/8 | 1/4 | 4/4 | – | 1.1 | 24 198 |
| M3 Q8_0 weights | weight quant | 1/8 | 2/4 | 4/4 | – | 0.8 | 43 486 |
| S8 `cache_prompt:false` | no prefix reuse | 0/13 | 3/4 | – | – | 0.7–0.9 | – |
| S1 `min_p` first in sampler order | sampler | 1/8 (dialogue "there's a and there's") | 2/4 | 4/4 | – | **0** | – |
| S2 DRY off | sampler | 2/8 ("and and", "is is") | 1/4 | 4/4 | – | 0 | – |
| S3 top-nσ 1.5 | sampler | 0/8 | 1/4 | 4/4 | – | 0.6 | – |
| S4 XTC 0.5/0.1 | sampler | 2/8 | 2/4 | 2/4 | – | **4.1** | – |
| S5 temperature 0.8 | sampler | 1/8 | 1/4 | 4/4 | – | 0.7 | – |
| S6 DRY last_n 1024, mult 0.6 | sampler | 1/8 ("heL eyes") | 1/4 | 4/4 | – | 1.1 | – |
| **T1/T1b empty thought channel, last turn** | template | **0/24** | **0/12** | 3/4 | **0/8** | 0.2–0.3 | same |
| T2 empty thought channel, every model turn | template | 0/8 | 0/4 | 3/4 | 0/4 | 0.6 | same |
| **C1 thought channel + `min_p` first** | template + sampler | **0/8** | **0/4** | 4/4 | 0/4 | **0** | same |
| M1 Artemis **v1.2** Q4_K_M | model | 1/8 ("and and there's a narrator's") | 0/4 | 2/4 | – | 0.7 | 30 976 |
| M1-tc v1.2 + thought channel | model + template | 0/8 | 0/4 | 3/4 | – | 0.2 | 30 976 |
| M2 **Cydonia-24B v4.3** Q5_K_M (Mistral V7-Tekken) | model | 0/8 | 0/4 | 3/4 | 0/4 | 0.4 | 33 336 |

Notes on the table:
- 4 samples per body unless noted.
- The S arms and template arms ran on the production server. Their VRAM is the production row.
- "L loop" counts any reply with a line repeated ≥3 times. Several "3/4" escapes are short replies that still repeat "The valley is quiet." three times and then stop.

### Reading

1. **No server flag changes either symptom.**
   - KV f16 (q8_0 KLD was the research's lead suspect), one slot without `--kv-unified`, a smaller context, `--swa-full`, flash-attention off, the latest build, no prefix reuse and Q8_0 weights all sit inside the production noise: W/T 0–2/8, B 1–3/4, L 4/4.
   - The cause is not KV quantisation, slot sharing, SWA cache or weight quantisation.
   - `--swa-full` is also unusable on this card: 37 GB at a 20k context, and 50 GB of KV alone at 64k (OOM).
2. **The empty thought channel is the one change that moves both symptoms' precursors.**
   - The change: `<|channel>thought\n<channel|>` after the final `<|turn>model\n`, which Gemma-4-31B was trained to emit when thinking is off.
   - **Word damage: 0 in 54 W/T replies** (T1, T1b, T2, C1, M1-tc, F1/F2), against 7/125 without it (one-sided Fisher p ≈ 0.08 on W/T alone).
   - **B drop: 0/24**, against 31/88 without it (p < 0.001). The B replies are full, varied prose even with msg 25 in context.
   - Forced picks drop 2–3×. With the thought channel the prose is less formulaic, so DRY collides with it less.
   - **Loop onset (L0):**
     - Without it, most of the 8 replies (6 or 7, by reading) are terse atmosphere lines ("The valley is quiet. / A beat, and…"), the register the loop grows from. 1 of 8 ran to the cap.
     - With it, 0/16 loop and every reply is a paragraph of concrete narration.
   - **It does not rescue a loop already in the reply** (L: 3/4).
   - Wrapping every past model turn (T2) is no better than the last turn only (T1).
3. **`min_p` before DRY removes the forced-pick class by construction** (forced = 0 in S1, C1 and the blind pack). It does not touch B imitation or loops. On top of the thought channel it adds nothing measurable here (both are 0/8). It is kept as a cheap guard against the "theis the" mechanism found this afternoon. There is no sign of a downside (S clean, loop rate unchanged).
4. **No sampler arm fixes the loop.**
   - XTC breaks 2/4, but forced picks rise to 4.1/100.
   - DRY off brings back doubled words.
   - The loop guard in the harness (swipe a reply with a line ≥3×) stays necessary.
5. **Models.**
   - Artemis v1.2 is at least as clean as v1.1. It was the only model without the thought channel that resisted B imitation (0/4).
   - Cydonia 24B is clean, 44% faster (46.7 vs 32.4 tok/s solo), and loop-prone once a loop is in context (3/4).
6. **Determinism.** Greedy runs (temperature 0) of the same arm were not always identical:
   - production W identical, T diverged at token 34;
   - np1 without unified KV diverged at tokens 68 and 4;
   - f16 diverged at tokens 92 and 88;
   - b11321 and Q8 weights were identical.
   - So the run-to-run nondeterminism is not specific to `--kv-unified` or parallel slots. It follows the prompt-cache path (the first call evaluates the full prompt, the second reuses the cache and re-evaluates only the last token). It is harmless: different but valid continuations.

### Blind pack raw material (20 real turns × 4 configs, seed 1001, `n_predict` 600)

`C:\dev\so-lanes\artemis-flags\testset\blind-20\` (manifest: session, payload, speaker, phase, known symptom; 5 of the 20 turns are known loop or word-drop turns) and `results\blind-20\` (`replies.jsonl`, `configs.json`, `checklist.jsonl`, `checklist-summary.json`). The two stories captured so far are adventurer and war, so there is no academy or saga turn.

| Config | Loop | Corrupt | Forced picks | Acts or speaks for player | Narrator voices a member | Mean words |
|---|---|---|---|---|---|---|
| BL0 v1.1 production as-is | 2/20 | 1 by hand ("claspshed" in b13, which also loops "Please!") | 17 | 1 (false positive: a recap) | 1 | 153 |
| BL1 v1.1 + thought channel + `min_p` first | 0/20 | 0 | 0 | 0 | 1 | 122 |
| BL2 v1.2 + thought channel + `min_p` first | 0/20 | 0 | 0 | 0 | 0 | 179 |
| BL3 Cydonia 24B Q5_K_M (Mistral) + `min_p` first | 1/20 | 0 | 0 | 0 | 1 | 154 |

- On b20 (the loop-polluted context), BL0 and BL3 run to the 600 cap on "A beat, and…" chains. BL1 and BL2 write a normal reply.
- "Guidance leak" hits are all b02/b03, recap turns that are asked to restate earlier scenes.
- The "addressed member answered" check is constant across configs (it measures the recorded director's pick, not the model), so it is reported in `checklist.jsonl` but not scored.

### Capacity (solo, A100; the RTX PRO 4500 Blackwell has 32 GB)

| Server config | VRAM | tok/s 1 stream | tok/s per stream at 4 concurrent | Lanes |
|---|---|---|---|---|
| Production: ctx 196608, np4, unified, q8_0 | 31.1 GB | 32.4 | 14.0 (≈56 aggregate) | 4 (≈49k tokens each, shared) |
| Artemis v1.2, same flags | 31.0 GB | 32.7 | 14.6 | 4 |
| f16 KV, ctx 98304, np2 | 29.5 GB | 37.9 | – | 2 |
| f16 KV, ctx 196608, np4 | 38.5 GB | – | – | does not fit 32 GB |
| Cydonia Q5_K_M, ctx 98304, np2, q8_0 | 24.7 GB | 46.7 | – | 2 (or 4 sharing 98k) |
| Cydonia Q5_K_M, ctx 196608, np4, q8_0 | 33.3 GB | – | – | does not fit 32 GB |

### Recommendation

**Server: no change.**

```
LLM_CTX=196608
LLM_PARALLEL=4
LLM_KV_TYPE=q8_0
LLM_EXTRA_ARGS=--kv-unified
```

Capacity is unchanged: 4 lanes share it, as today. No server flag measured better, and the only plausible quality flag (f16 KV) halves the lanes (`LLM_CTX=98304 LLM_PARALLEL=2 LLM_KV_TYPE=f16 LLM_EXTRA_ARGS=`) for no measured gain. Do not use `--swa-full`.

**The fixes are on the ST side (high confidence for the thought channel, medium for the sampler order):**
1. **Instruct template for the RP profile.** Set `last_output_sequence` to `<|turn>model\n<|channel>thought\n<channel|>` (today it is empty, so `output_sequence` `<|turn>model\n` is used). Past turns stay as they are. This is what every winning arm sent: the speaker prefix ("Dalan:") follows the empty thought block.
2. **Preset `Artemis v1.1 RP`.** Move `"min_p"` to the front of `samplers`:

   ```
   ["min_p","penalties","dry","top_n_sigma","top_k","typ_p","tfs_z","typical_p","xtc","top_p","adaptive_p","temperature"]
   ```

   Keep every other value. The lanes copy `TextGen Settings` and the instruct presets from the real install at seed, so both changes must land in the install (or in an `adolion-fresh` seed patch) before the next sessions.
3. **Keep the harness loop guard** (swipe or regen a reply with a line repeated ≥3 times). Nothing here escapes a loop that is already in the context.
4. **Model.** Artemis v1.2 is a safe drop-in: same template, flags, VRAM and speed, and at least as clean. Decide after the blind pack. Cydonia 24B is a credible alternative only with `LLM_CTX=98304`. It needs the Mistral V7-Tekken template and still loops once a loop is in context.

**Not tested:** Blackwell sm_120 kernels; the live ST path end to end (the bodies were hand-edited the way the template change would render them, and should be verified with one `st-payload` capture after the preset edit); more than 8 seeds per body on W/T. The W/T result rests on the low base rate, and B is the strong evidence.

### Lane preset overlay (2026-10-01)

The two ST-side fixes run on the lanes from T2 onward without touching the real install:

- `scripts/debug/adolion-fresh.presets.json` (checked in) lists the two edits: instruct `Gemma 4` `last_output_sequence` = `<|turn>model\n<|channel>thought\n<channel|>`, and textgen `Artemis v1.1 RP` `samplers` with `min_p` moved to the front (every other entry and value kept).
- `adolion-fresh seed` applies it to the **lane's copy** right after the strip, before the lane server starts: the preset files under `instruct/` and `TextGen Settings/`, and the copy of the active preset in the lane's `settings.json` (`power_user.instruct`, `textgenerationwebui_settings`). The mirror matters: ST does not re-read a preset that is already selected (`selectInstructPreset` and `/preset` return early when the name matches), so a file-only edit would not reach the running page.
- Fail closed: a missing preset, key, or `min_p` entry, a wrong type, or a write that does not read back fails the seed with nothing written. The seed report and `<lane>/adolion-fresh/preset-overlay.json` record each key before/after and the overlay sha256 (LF-normalised). `--no-preset-overlay` seeds the old condition and records it as such.
- `so-session start` copies that record into `session.json` (`presetOverlay`) with the values the page actually runs (`power_user.instruct`, `textCompletionSettings`), and fails the start (`preset-overlay`) if an applied overlay and the page disagree. A lane seeded before the overlay has no record: that start goes ahead with a warning naming the pre-overlay condition, so already-recorded sessions keep their validity. `--no-preset-overlay` passes through to the seed.
- Checked against a copy of lane 1's real files (read only): both edits applied, both mirrors hit, and the rest of `settings.json` was unchanged.
- Not yet verified on a live page: one `st-payload` capture after the next seed should show the thought channel after the final `<|turn>model` and `min_p` first in `samplers`.
- Gate (2026-10-01, agent worktree): `npm run gates` green on every step through `test:plugin` (typecheck, typecheck:test, lint, test, build, build:dev, test:debug, debug:typecheck, test:release, test:replay, test:plugin). `test-storybook:ci` is not runnable in the agent worktree: the runner resolves to the main checkout through the node_modules junction and matches 0 stories. That is equivalent to `-- --no-storybook`; no `src/` file changed.

## 2026-10-02: Thinking and model A/B (5 models)

Dedicated pod `vkheow0wtqxl0t` (RTX PRO 4500 Blackwell 32 GB, EU-RO-1, $0.72/h; the $0.34/h community price had no stock), 06:07–08:29Z, **2.36 pod-hours (~$1.70)**, then stopped and terminated after the results were copied. The production pod `m4dmlnzn70qgj2` was only read (`get-pod`). Re-runnable kit, raw rows, logs and testsets: `C:\dev\so-lanes\artemis-think\` (README there; `logs/session.md` lists what went wrong). It extends the A100 kit: same bodies, sampler and detector.

Five models were planned; four were measured. **Rocinante-XL 16B was excluded by the user: its context is too short for our 10–14k-token prompts** (its card says good to about 16k). It was never downloaded.

### Setup, and what it cannot show

- **This time the binary is production's.** `/workspace/llama/bin/llama-server` (b11046, archs `89;120`) runs natively on sm_120. Every server used the production flags (Artemis: ctx 196608, `-np 4`, `--kv-unified`, q8_0 KV). Requests ran 4 at a time, as four lanes would. Model sha256s match the HF LFS oids (`arms.json`).
- The bodies, sampler and counters are the same as on the A100 (W, T, B, L, L0, S; temperature 1, min_p 0.05, DRY 0.8/1.75/2/4096). Two things differ: `min_p` runs first in every arm, and the budget is 800 tokens of reasoning plus 400 of reply. Word damage is **hand-read** over every W/T/B/S/L0 reply (the texts are in `handread/`). The detector alone misses "murmets" and "has to drained".
- **Every body is a group turn.** The prompt ends on ST's speaker prefix (`<|turn>model\nDalan:`), so the group question is built into every arm. Solo turns were approximated by dropping the name (`sts`).
- **What the Gemma 4 template really emits** (from the GGUF, `templates/`): thinking on puts `<|think|>` at the top of the first system turn and generates after a bare `<|turn>model\n`. The model then opens `<|channel>thought\n…<channel|>` itself. Thinking off adds the empty channel, which is yesterday's fix.
- Thinking shapes measured (full table in the kit README):

| Shape | Prompt end (Gemma 4) | What ST would need |
|---|---|---|
| `off` | `<|turn>model\n<|channel>thought\n<channel|>Dalan:` | today's lane overlay |
| `stg` | `<|think|>` + the `Gemma 4 Thinking` instruct's brief-plan line; ends `<|turn>model\nDalan:` | the existing `Gemma 4 Thinking` instruct, as is |
| `stga` | as `stg`, then the opener: `…Dalan:<|channel>thought\n` | that instruct + **Start Reply With** `<|channel>thought\n` |
| `after` | `<|think|>` only, `…Dalan:<|channel>thought\n` | `Gemma 4 Thinking` with no brief-plan line + Start Reply With |
| `before` | `<|think|>`, `<|turn>model\n<|channel>thought\nDalan:` | `last_output_sequence` ending in the opener |
| `sts` | as `stg` with no name: `<|turn>model\n` | the instruct in a solo chat |
| `2s` | stage 1 `<|turn>model\n<|channel>thought\n` up to `<channel|>`; stage 2 appends `<channel|>Dalan:` | not expressible in ST (two requests); used only as the clean reference |

- **Speaker stop strings off (`-ns`) in every thinking arm but the first.** The first two-stage arm kept the body's stop list. In 4 of 6 replies the reasoning stopped on `\nBelle:`, `\nDalan:`, `\nTobias:` or `\nKanna:`, because the model lists the characters line by line. ST adds those strings in groups (`getStoppingStrings`, `power_user.context.names_as_stop_strings`). Thinking in a group therefore needs the context template's "Names as Stop Strings" switched off.
- The bodies are hand-built from recorded payloads, as on the A100. ST's own rendering of these shapes, and its reasoning auto-parse, were **not** run live.

### Arms (4 seeds per body unless noted; n is the number of replies read)

| Arm | Model, shape | n | Word damage (hand-read) | B drop | Loops (L0 + other, not L) | Reasoning: opened / closed | Reasoning tokens, median | Empty reply | First reply token, median (4 concurrent) |
|---|---|---|---|---|---|---|---|---|---|
| A11-off | v1.1, empty channel (yesterday's fix) | 26 (+4 L) | **0/26** | 0/6 | 0/26 | – | – | 0 | 12 s |
| A11-think-stg-ns | v1.1, `Gemma 4 Thinking` as is | 20 | **10/20** (+1 doubtful; "Belle's on feet", "her excitement has to drained", "she murmets", "hisL hands", "assesses the and you") | 3/4 | **4/20** ("And he is waiting." ×160, "The valley is quiet." ×190) | **0/20** | 0 | 0 | 12 s |
| A11-think-stga-ns | v1.1, instruct + opener after the name | 20 | **0/20** (1 doubtful) | 0/4 | 0/20 | 20/20 / 20/20 (4 closed at once, empty thought) | 381 (352 with the empty ones) | 0 | 65 s |
| A11-think-after-ns | v1.1, `<|think|>` + opener after the name | 24 | **0/24** | 0/4 | 0/24 | 24/24 / 19/24 | 698 | **5/24** (3 over the 1200-token budget, 2 drafted the reply inside the thought and stopped) | 76 s |
| A11-think-before-ns | v1.1, opener before the name | 4 (W, S × 2) | 1/4 ("until his knuckles white") | – | 0/4 | 4/4 / 3/4 | 606 | 1/4 (reply inside the thought) | 39 s |
| A11-think-sts-ns | v1.1, solo shape (no name) | 16 (W, B, L0, S) | 1/16 (the one reply that did not reason) | 1/4 | 0/16 | 15/16 / 14/15 | 478 | 1/16 | 53 s |
| A11-think-2s-ns | v1.1, two-stage reference | 20 (+4 L) | 1/20 ("haists") | 1/4 | 0/20; L 4/4 | 24/24 / 17/24 within 900 | 742 | 0 | 100 s |
| A11-think-2s | v1.1, two-stage, speaker stops on | 6 | 0/5 | 0/1 | 0/5 | 6/6 / 2/6 (4 cut by a speaker stop string) | 442 | 0 | 69 s |
| A12-off | v1.2, empty channel | 16 (W, T, B, S) | 1/16 ("carve it throat out") | 1/4 | 0/16 | – | – | 0 | 14 s |
| A12-think-stga-ns | v1.2, instruct + opener after the name | 16 | 1/16 | 0/4 | 0/16 | 16/16 / 16/16, but **14/16 closed at once** | 1 | 0 | 15 s |
| CY-off | Cydonia 24B Q5_K_M, Mistral V7-Tekken | 16 | 0/16 | 0/4 | 0/16 | – | – | 0 | 7 s |
| CY-think-after-ns | Cydonia, `Dalan:<think>\n` | 16 | 1/16 ("looks back at player") | 0/4 | 0/16 | 16/16 / 16/16 | 106 | 2/16 | 7 s |
| CY-think-before-ns | Cydonia, `<think>\nDalan:` | 4 | 0/4 | – | 0/4 | 4/4 / 4/4 | 66 | 0 | 2 s |
| SK-off | Skyfall 31B v4.2 Q4_K_M, Mistral V7-Tekken | 16 | 0/16 | 0/4 | 0/16 | – | – | 0 | 8 s |
| SK-THINK-after-ns | Skyfall, `[THINK]` (+ Magistral system text) | 16 | – | – | – | **0/16 closed: never emits `[/THINK]`** | – | **16/16** | – |
| SK-think-after-ns | Skyfall, `<think>` | 6 (W, B, S × 2) | 0/6 | 0/2 | 0/6 | 6/6 / 6/6 | 65 | 0 | 13 s |

Notes on the table:
- Forced picks (`bmp`) are 0 in every arm, because `min_p` runs first.
- "Loops" counts W, T, B, S and L0. With a loop already in the context (L), every arm that ran it still loops: A11-off 3/4, A11-think-2s-ns 4/4. Thinking does not rescue a loop in progress.
- A11-off's B row has 6 replies (seeds 11–16).
- The first-token time is measured with 4 requests in flight, so prompt processing is included. Solo, the extra cost is the reasoning length divided by the solo speed (capacity table): about 13 s for `stga` on v1.1.
- "Empty" means the player would see no reply.

### Reading

1. **The September failure is the prompt shape, not thinking itself.**
   - The existing `Gemma 4 Thinking` instruct puts `<|think|>` in the system turn but ends the prompt on ST's speaker name, `<|turn>model\nDalan:`. Artemis then **never opens a thought (0/20)** and degrades worse than production did:
     - word damage in 10/20 replies (hand-read);
     - B imitation 3/4;
     - 4 runaway loops in 20 replies with no loop in context.
   - This is the "ends with no thought block" shape again, now with a thinking switch that the prompt never honours.
   - Once a thought block is actually opened, the replies are as clean as the empty-channel fix:
     - `stga` 0/20 and `after` 0/24, against `off` 0/26;
     - B imitation 0/4 against 0/6.
   - So the hypothesis holds: **both trained shapes are clean, and only the shape with no thought block degrades.**
2. **Thinking costs time and empty replies, and the brief-plan line pays for itself.**
   - Plain `<|think|>` (`after`):
     - reasons a median of 698 tokens;
     - in 5/24 replies the player would see nothing: the reasoning ran past 1200 tokens, or the model wrote its answer inside the thought and stopped.
   - With the instruct's brief-plan line ("at most 5 bullet points … Do not draft the reply inside your thinking", `stga`):
     - the median drops to 381 tokens;
     - no reply in 20 was empty.
   - In 4/20 of the `stga` replies v1.1 closed the thought at once. Its first-token odds of `<channel|>` are 5–21% on these bodies (`results/first-token.jsonl`). Those replies are ordinary "off" replies and were clean.
   - On the 20 blind turns (one seed, longer and later contexts):
     - `stga` left 2/20 empty and 1 cut to 10 tokens;
     - `after` left 4/20 empty.
   - Latency: at four concurrent lanes the first reply token comes after a median 65 s (`stga`) against 12 s for `off`. Solo it is about 13 s more per turn.
3. **Group chats can think, but only with the opener after the name.**
   - `before` (the opener in `last_output_sequence`, so the name lands inside the thought) worked in 3 of 4. In the fourth, the reply was written inside the thought.
   - Without the name (`sts`), the reasoning is fine, but in group bodies 5/16 replies started as a different character (the model picks its own speaker).
   - The working order is `<|turn>model\nDalan:<|channel>thought\n`. That is exactly what ST builds from names forced plus **Start Reply With** `<|channel>thought\n` (`formatInstructModePrompt` appends the prompt bias after `Name:`). The reply then follows `<channel|>` as Dalan.
   - In 3/20 of the replies the model also repeats `Dalan:` at the start of the reply text (whether ST strips it was not checked).
4. **Artemis v1.2 barely thinks.** With the same shape it closed the thought at once in 14/16 replies. It is a fine non-thinking model (`A12-off` 1/16 damage, as on the A100) but not a thinking one.
5. **CC switch on b11046 (plan 05 F5): verified.**
   - `/apply-template` shows `enable_thinking: false` renders exactly `<|turn>model\n<|channel>thought\n<channel|>`. `true` renders `<|think|>` and a bare `<|turn>model\n`. **No kwarg at all also means thinking on.**
   - `reasoning_content` comes back separated (default reasoning format) and `content` carries no markers. `reasoning_format: "none"` puts the raw channel back into `content`.
   - Budget exhaustion: with `max_tokens` 120, `content` is `""` and `finish_reason` is `length` (3/3).
   - `reasoning_effort` `low` and `high` give byte-identical output: the Gemma 4 template ignores the level. **`reasoning_effort: "none"` turns thinking off** (the same output as `enable_thinking: false`).
   - **`thinking_budget_tokens: 64` caps the reasoning at about 64 tokens and the reply follows**, so it is a per-request budget. `reasoning_budget` has no effect.
   - In the W body every CC reply came back as **Tobias** (6/6 with text), not the director's pick Dalan, because a chat request carries no forced speaker prefix. Group thinking is therefore a Text Completion feature.
6. **Skyfall 31B v4.2.**
   - Its base is **Magistral-Small-2509** (card and GGUF), not Mistral-Small-3.1. It uses Mistral V7-Tekken, and `[THINK]`/`[/THINK]` exist as special tokens (ids 34/35).
   - Clean without thinking: 0/16 damage, 0 loops. One reply drifted to another character and was cut off mid-sentence.
   - Thinking:
     - `[THINK]` does not work: the finetune never emits `[/THINK]` (0/16 replies, 0/2 in a token-level probe). It writes the reply, sometimes mixed with planning, and stops.
     - A plain-text `<think>` prefill works: 6/6 closed, short (median 65 tokens), clean. That is only 6 replies.
7. **Cydonia 24B v4.3.**
   - Clean without thinking (0/16).
   - With `<think>`:
     - short reasoning (median 106 tokens), often in the character's own first person, which is promising for the inner voice;
     - 1/16 damage;
     - 2/16 empty replies;
     - 5/16 replies repeat the speaker name;
     - 1 reply came back as another character.

### Capacity (solo, RTX PRO 4500 Blackwell 32 GB, production binary)

| Model | Server config | VRAM | tok/s, 1 stream | Lanes |
|---|---|---|---|---|
| Artemis v1.1 Q4_K_M | ctx 196608, np4, unified, q8_0 | 30.9 GB | 28.6 | 4 (shared 196k) |
| Artemis v1.2 Q4_K_M | same | 30.8 GB | 28.8 | 4 |
| Cydonia 24B Q5_K_M | ctx 131072 (its maximum), np4, unified, q8_0 | 27.4 GB | 41.8 | 4 (shared 131k) |
| Skyfall 31B Q4_K_M | ctx 98304, np4, unified, q8_0 | 29.6 GB | 33.0 | 4 (shared 98k); 131k was not tried |

- With 4 requests in flight, decode speed per stream fell to 2–14 tok/s whenever other slots were processing 10k-token prompts. That matches what the lanes see.
- Thinking multiplies the generated tokens per turn by about 3 (`stga`) to 4.5 (`after`).

### Blind pack (`test/sessions/rating-pack/model-blind-20-think/`)

The same 20 turns as `model-blind-20`, seed 1001, 600 reply tokens (plus 800 for reasoning). Reasoning is shown folded under each reply, and the raters judge the reply. The key is sealed: sha256 `cb90b3f6…d9ff1`, checked with `so-model-blind.mts verify-key --out …`.

| Config (sealed) | What it is | Why it is in |
|---|---|---|
| v1.1 empty channel + `min_p` first | the A100 `BL1` replies, reused (same prompt, sampler and seed; A100 GPU) | the control: today's lane overlay |
| v1.1 `<|think|>` + opener after the name | `after`, plain thinking | the ST-expressible thinking order, unbriefed |
| v1.1 `Gemma 4 Thinking` instruct + opener after the name | `stga` | the recommended thinking config |
| Skyfall 31B v4.2, no thinking | Mistral V7-Tekken | the cleanest new model. Its only working thinking shape (`<think>`) has 6 samples, too few to put in front of raters |

Not in the pack:
- v1.2 does not think (14/16), and its non-thinking replies are already rated in `model-blind-20` (BL2).
- Cydonia is in `model-blind-20` (BL3).

Blind counters:
- `after`: 4/20 empty replies.
- `stga`: 2/20 empty, and 1 reply of 10 tokens.
- Skyfall and the control: 0 empty, 0 loops, 0 detector hits.

A judge first pass scored all 20 turns blind (`openai/gpt-6-astra` through `opencode run --pure`, the same route and prompt as the first pack, 20/20 scored, no problems). Its per-config result is only in `judge-first-pass/unsealed-summary.md` and is deliberately not repeated here, so it cannot steer the human rating.

### Recommendation

**Answers:**
1. **Thinking-on does not degrade Artemis v1.1 when a thought block is actually opened.**
   - `stga` 0/20 and `after` 0/24 word damage, against 0/26 for the fix; B imitation 0/4.
   - The September garbage is reproduced only by the shape the current `Gemma 4 Thinking` instruct produces in a group: 0/20 replies reasoned, 10/20 damaged and 4/20 looped.
2. **Group thinking works with the opener after ST's name prefix.**
   - The prompt must end `<|turn>model\nName:<|channel>thought\n`.
   - ST needs:
     - (a) the `Gemma 4 Thinking` instruct (`<|think|>` + the brief-plan line in `story_string_prefix`), with `last_output_sequence` left empty;
     - (b) **Start Reply With** = `<|channel>thought\n`;
     - (c) **Names as Stop Strings off** in the context template, or the reasoning is cut at the first character line (4/6);
     - (d) reasoning auto-parse with the `Gemma 4` reasoning template (`<|channel>thought\n` … `<channel|>`);
     - (e) a response length of at least 1400 tokens (800 reasoning + 600 reply).
   - Putting the opener in `last_output_sequence` (before the name) fails in about a quarter of replies (1/4). Dropping the name lets the model pick the speaker (5/16 wrong).
3. **The CC switch works on b11046.**
   - `chat_template_kwargs.enable_thinking` true/false renders the two trained shapes, `reasoning_content` is separated, and budget exhaustion gives `content: ""` with `finish_reason: "length"`.
   - `reasoning_effort` levels do nothing on Gemma 4 except `"none"`, which turns thinking off.
   - `thinking_budget_tokens` is the working per-request budget, so plan 05's effort control should map onto it.
   - CC cannot force the group speaker (6/6 replies as the wrong member), so group thinking stays on Text Completion.
4. **Skyfall 31B v4.2:**
   - as clean as Artemis without thinking (0/16) and 15% faster (33.0 against 28.6 tok/s);
   - 4 lanes at 98k shared context, against Artemis's 196k;
   - thinking only through a `<think>` prefill (6/6 short and clean); its native `[THINK]` is broken in the finetune.
   - **Rocinante-XL 16B:** excluded by the user (context too short for our prompts); not measured.
   - **Cydonia 24B** (for reference): the fastest (41.8 tok/s), 4 lanes at 131k, short in-character reasoning, but 2/16 empty replies and speaker slips with thinking.
5. **Pack:** the four configs above. Thinking is represented twice (plain and briefed) because that is the decision on the table; Skyfall is the new model; v1.1 without thinking is the control.

**What to change, if the raters do not prefer the control clearly:**
- run T5–T7 with the `stga` setup on Artemis v1.1;
- keep `min_p` first;
- drop the empty-channel `last_output_sequence`;
- turn "Names as Stop Strings" off;
- add Start Reply With `<|channel>thought\n`;
- raise max response tokens to 1400;
- turn harvest on.

As a lane overlay it is the same mechanism as `adolion-fresh.presets.json`, with one more key (Start Reply With) and one context-template key. Expect about 10% empty replies on hard turns, and about 13 s more per turn solo, several times that with 4 busy lanes.

Keep the harness loop guard: thinking does not escape a loop already in context (4/4). Do not switch to v1.2 for thinking.

### Not tested

- The live ST path end to end: Start Reply With combined with reasoning auto-parse; whether ST strips the repeated `Name:`; the harvest reading `reasoning`.
- One `st-payload` capture on a lane should confirm the prompt ends `Dalan:<|channel>thought\n`.
- L/L0 on v1.2, Cydonia and Skyfall.
- `stga` on Cydonia or Skyfall.
- Skyfall `<think>` beyond 6 replies.
- Skyfall at 131k context.
- More than 4 seeds per cell; the blind turns are single-seed.
- Rocinante-XL 16B (excluded by the user).
- Turns past about 15k tokens of context.
