# Plan 03 — SP9 restated (witness-filtered transcripts)

**Step 0, committed before any run.** Bars are v2.5's (`v2.5/09-research-spikes.md` §SP9), verbatim.

## Conditions and bars (unchanged from v2.5)

| # | Condition | Pass (verbatim) |
|---|---|---|
| F1 | No chat mutation | chat file and in-memory `chat[i].extra` byte-identical before/after 20 generations (a copy must replace `extra`, not set a key on it) |
| F2 | Filter correct | fixture with authored witness sets: 0 unwitnessed messages in any drafted member's request, 100 % of witnessed kept |
| F3 | Extraction and rollback unaffected | J5 + J6 green ×2 with the filter on |
| F4 | Witness source accuracy | the source chosen (extraction or scene presence) agrees with authored sets on ≥ 0.9 of 40 labelled messages (route recorded) |
| F5 | Cost | interceptor p95 ≤ 5 ms added |

## What changed since v2.5

- **C5 fixed:** presence is recorded name-only (v2.5's 0/40 came from `[name, id]` doubled sets). **Shared-read throw
  fixed** (`7663bbb0`), which failed J6 in v2.5's F3. **C13 built:** guidance secrets are per member
  (`guidance {all, members}`), so the lab's epistemic grep now tests the split.
- **Data:** `adolion-campaign@e1c91fb` `lab/witness/` (`check_lab.py` OK): `adolion-witness.json` (F1/F2/F5 + the
  epistemic grep: 37 messages, 11 asides, 2 arrivals, 24 generations = 8 members × 3, 144 witnessed checks),
  `adolion-witness-f4.json` + `adolion-witness-f4.labels.json` (40 labels written before the run; predicted from the
  build: names-only presence 4/40), story `build/story/adolion-academy.story.json`, group `Adolion - House Nightriver`.

## Procedure (stated)

- **F1/F2 as two rows (plan 03):** row "Summarize on" = the lane as seeded (ST Summarize enabled, `promptInterval` 10);
  row "Summarize off" = `extension_settings.memory.promptInterval = 0` for the run, restored afterwards. Each row ×1.
  The bars apply to each row separately; the report says which row a verdict stands on. F5 is read from both rows.
- **F4:** ×1, route = scene presence (no model). Each run's `so-sp9-f4` record is scored with
  `test/journeys/records/v2.5-batch2/plan09/SP9/score-f4.mts` against the lab's pre-run labels.
- **F3:** J5 + J6 with `spikes.witnessFilter` on (saved, page reloaded, read back), toy group `1759606632088`, ×1.
  The bar says ×2: a green ×1 is reported as **green ×1, ×2 owed to plan 10**, never as F3 PASS.
- **Count rule:** fewer than 20 generations in a run, or a run that never drafted a member, is **not measured**.
- Lane 2, adolion-fresh at the pin, dev bundle as staged (`6f56533e8608`). Generations on `Artemis RunPod RP`;
  extraction is off inside the F1/F2 fixture; J5/J6's reads run on the DeepSeek `read` route (recorded). `judge.enabled`
  off on lane 2's copy (v2.5 ran with judge uses off), restored afterwards. Run header around each batch.
- Toy jest legs keep running: `witnessFilter.test.ts`, `witnessFilterHost.test.ts`.

## Records

`test/measurements/v2.6-03/sp9/` (batch logs, `so-sp9-f1f2f5` and `so-sp9-f4` records, F4 scores, header diff, summary).

## Addendum 2026-10-01 13:22Z — diagnostic row after the declared rows (bars unchanged)

Declared rows ran first: Summarize on (not measured: generation 11 sent no request after Summarize's own quiet pass at
10 messages) and Summarize off (F2 failed: 41 unwitnessed markers visible). The lane as seeded also has ST **Vector Storage
chat vectorization on** (`vectors.enabled_chats: true`, insert 3, protect 5), which re-inserts retrieved older messages
by similarity through its own path. **Diagnostic row (never decides F1/F2):** Summarize off **and** Vector Storage chats off,
×1, same fixture, restored afterwards. It only attributes the leak; the verdict stays on the declared rows. F3 (J5 + J6)
is not run: F2 and F4 already fail as declared, so F3 cannot change the verdict.
- Second diagnostic run (13:30Z), same settings, also records the 700 characters before each of the first 12 leaked markers and which seeded rows' `extra` changed, to name the channel.
