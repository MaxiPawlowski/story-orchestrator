# J8 op-agnostic re-green — 2026-09-19

J8.2 failed 3 of 3 strict runs earlier the same day on the Artemis backend. It hard-coded that the
real curator proposes a text change, and Artemis answers the "flooded road" entry with
`[disable] "The washed road"`. This directory is the durable copy of the pair that re-greened it.
`.debug` rotates.

- **Tree**: working tree of 2026-09-19 ~04:00 UTC. The extension bundle was `dist/index.js` built
  02:17 UTC, so the uncommitted `src/services/stHost/worldInfo.ts` edit from 03:20 UTC is **not** in
  it. Only harness files changed for this re-green: `scripts/debug/so-ui.mts`,
  `scripts/debug/so-scenario.mts`, `test/journeys/j8-stagecraft.journey.json`.
- **Model**: `TheDrummer_Artemis-31B-v1.1-Q4_K_M` (llama.cpp :18080). Main chat went through the
  "Artemis RunPod" profile. Every off-path pass went through "Story Orchestrator Memory RunPod"
  (`ST_DEBUG_PROFILE`). No `debugResponse` in J8.2.
- **Browser**: headed Chromium over the shared CDP session. It was reloaded once before run 1 to
  drop stale fetch wrappers left by earlier runs. No peer drove it during the runs (checked with
  ListAgents and confirmed by the busy peers).
- **Mode**: `so-journey.mts run J8 --strict`.

| Run | Result | What the real curator proposed | Notes |
|---|---|---|---|
| 1 | J8.1 ✓ · J8.2 ✓ · **J8.3 ✗** | not logged (the `log` modifier came later) | J8.3 read memory 8 → 9: J8.2's last turn was still being read off-path. Fixed with `wait: {schedulerIdle}` |
| 2 | ✓ ✓ ✓ | `disable` | green, but superseded by the harness fix below |
| 3 | J8.2 **✗** at `curate` | `disable` (in flight in the background) | harness race, see below. Fixed in `curatePass` |
| **4** | **✓ ✓ ✓** | `disable` | first run on the final tree |
| **5** | **✓ ✓ ✓** | `disable` | second consecutive. **This pair is the gate** |
| text plumbing | J8.1 ✓ · J8.2 ✓ (`--only`) | fixed reply `[rewrite, disable]` | the text branch. Only the curator reply is mocked (see below) |

Artemis chose `disable` in every run it answered, so runs 4 and 5 prove the switch branch:
- the entry was in 2 of 2 first-turn prompts before the change (the control)
- the drawer card was accepted as proposed
- `disable: true` in `/api/worldinfo/get`, with the entry text unchanged
- the entry was in 0 of 2 prompts on the next turn

The text branch never came up live on this backend. `j8-text-plumbing.journey.json` is J8.1 + J8.2
with only the `curate` step's reply fixed to a mixed `[rewrite] … || …` + `[disable]` proposal (the
shape of the failed run 2). The drawer review, the boundary write and the main generation all ran
for real. `curator-accept pick: text-first` picked the rewrite over the switch and edited its
textarea. Only that op was accepted (`rewrite:accepted, disable:pending`), the server file held
exactly the edited text with `disable: false`, and the edit was in 2 of 2 prompts. This is a plumbing
check, not gate evidence for an LLM path.

## Findings fixed on the way

1. **J8.2 assumed the op kind** (the reported failure). `curator-accept` gained `pick: "text-first"`,
   which takes the first pending text change on the newest proposal that still has one waiting, and
   otherwise its first pending switch. Later steps read the accepted op from runtime state and assert
   the kind that actually ran:
   - text: the edited text in the server file and in every captured prompt
   - switch: `disable` in the server file and the entry gone from the prompt
2. **Step 8 read the DOM once.** `ui: {action: "stagecraft", minOps: 1}` now re-opens the drawer and
   re-selects Scheduler until the cards render. `getStagecraftState` no longer swallows a failed tab
   switch: it reports `tabError`, and the wait throws with the on-screen counts.
3. **The payload wrapper could catch the wrong request.** The old fetch wrapper captured every
   `/api/backends/` call, including memory-model passes and the curator's own prompt, which contains
   the entry. Prompts now come from `GENERATE_AFTER_DATA`, which only the main `Generate()` path
   emits (script.js:5318). The comparison is against the server file, not the client
   `loadWorldInfo` cache.
4. **J8.3 isolation raced background passes** (run 1). Its before-snapshot now waits for
   `wait: {schedulerIdle: true, quietMs: 5000}`, which took 14–17 s after a full J8.2 in runs 2, 4 and 5.
5. **`curate` could report "proposed nothing" for a pass that had proposed** (run 3). A curator
   pass writes `lastPass` before it awaits `save()`, and its in-flight flag is still set. A `curate`
   step that read `before` inside that window waited for a change that never came. The step now
   also re-asks while it waits. The in-flight check comes before any model work, so re-asking is
   cheap, and the next call runs once the other pass is done.
6. **Run logs could not show what a nondeterministic step got.** A new `"log": true` step modifier
   prints the step's output after the ok line (see `logs/J8-run4.log` and `logs/J8-run5.log`).

## Contents

- `journey-J8.md`: run 5's matrix and human checklist. J8.4 is left to the operator.
- `journey-J8-run4.json` and `journey-J8-run5.json`: machine records, including cleanup. Both
  deleted the sandbox chat by id, removed `SO-J8 Lore` and the chat's memory-mirror book, and
  reported `clean: true`.
- `logs/J8-run{1..5}.log`: runner output for every run of the day, failures included.
- `j8-text-plumbing.journey.json`, `journey-J8-text-plumbing.json`, `logs/J8-text-plumbing.log`:
  the text-branch plumbing run.
