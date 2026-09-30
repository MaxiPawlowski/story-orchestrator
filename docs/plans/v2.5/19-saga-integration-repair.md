# Plan 19 — The Saga playtest repair (images, progression, talk, defaults)

Follow-on to plan 18, from the same 2026-09-29 playtest (`2026-09-29@12h18m14s697ms`).
Three findings, plus the user's standing decision that every shipped, non-spike feature is on by default.

## Findings

1. **A truncated read stalled the story at the Guild Hall.** `party_name` gates
   `guild-hall -> road-to-wendhope`, and every one of the four reads that quoted "the Nightbringers"
   was refused `truncated response` (shared-read allowance 512). The player had left the hall, taken
   the posting and named the party, but the engine still sat at `guild-hall`. A truncated read is
   refused whole, so one hit of the cap costs the whole turn's write.
2. **The stall pre-check could not recover an absent string.** `buildStallRequest` phrased every leaf
   as `… the answer … is <value>`, so a `!= ""` leaf asked "is the name empty?" — a correct "no"
   counted toward "nothing shown" instead of a recovery.
3. **A chain could repeat its own speaker, and the scene cue fired on a cast change.** The judge could
   pick the Narrator, and then the Narrator again on `chainStep 1` (two near-identical carriage
   paragraphs); a `cast` scene break queued a second automatic illustration on a reply the cadence had
   already drawn.
4. **Default switches.** Image Director `enabled` was `false`; `scanMemory`, the curator and the
   warden defaulted off. The user's decision: every shipped, non-spike feature defaults on.

## What changed (extension)

- `src/extraction/sharedRead.ts` — a first read that ends on `finish: "length"` is re-asked with up
  to 1024 response tokens, but only when that larger allowance still fits the profile's input
  budget (`inputBudget(...).input`); the audit's `budget.maxTokens` reports the allowance used, and
  a still-truncated re-ask is refused as before. 512 stays the first-ask allowance.
- `src/judge/extraction.ts` — `buildStallRequest` phrases the leaf by its operator: `==`/`>=` keep the
  old wording, `!=`/`in`/`<`/`<=` ask "a value … that is <op> <value>". A `!= ""` leaf is now
  recoverable.
- `src/runtime/talkControl.ts` — a chain tracks the roster ids that spoke and excludes them from the
  next candidate pool, so a chain step cannot pick the speaker whose reply just landed.
- `src/image/settings.ts` + `src/image/runtime.ts` — `messageAlreadyDrawn(chat, messageId)` makes the
  automatic triggers idempotent per reply: the cadence and a checkpoint/scene cue that land on the
  same message collapse to the first. A scene break whose reason is `cast` fires no cue (a cast
  change is already a checkpoint effect).
- Defaults: `judge.enabled` and every `judge.uses.*` true (`judge/settings.ts`), `image.enabled` true
  and `automation.mode` `everyN` (`image/settings.ts`), curator and warden on with `review` accept
  mode, `worldInfo.scanMemory` true (`runtime/settingsModel.ts`); the legacy
  `st-image-director` seed no longer forces `enabled: false` (`runtime/settingsStore.ts`). Spikes stay
  off.
- Tests: `judge/extraction.test.ts` (the `!= ""` phrasing), `runtime/talkControl.test.ts` (no
  self-reply / no repeat in a chain), `image/image.test.ts` (the one-per-reply predicate),
  `runtime/sharedReadFinish.test.ts` (the 1024 re-ask), and the default-value fixtures across
  `judge/`, `runtime/`, `image/`.

## What changed (campaign)

- `scripts/build_adventurer.py` — `guild-hall` and `road-to-wendhope`: the counter staff speak their
  own lines (not the Narrator); Belle and Dalan act on their own goals (a clan worth trusting, a party
  that lasts) and may speak without being addressed; Ellie is competent, her fluster an aside, not a
  stutter. Adventurer **v22** (v23 after the regional wire).
- `campaign/cards/Ellie.json` — personality rewritten to competence-first.
- `scripts/campaign/assemble.py` — act-later qualities (`acad_path`, `heir_injuries`,
  `aegis_city_favour`, `deep_partner`, `deep_set_out`, `war_front`) get a `scope_hint.from` at the
  act that owns them, so the Saga's Guild Hall asks about the first act only (read scope 14 -> 8).
  Saga **v10**.

## Install-side (this install, reversible)

- Flipped the runtime settings the new defaults describe: `image.enabled=true`,
  `automation.mode=everyN/everyN=5`, `setScanMemory(true)`; judge/curator/warden were already on.
- Re-installed the Ellie card in place (`install_st.py --update-cards Ellie`), backup at
  `C:\dev\backups\story-orchestrator\2026-09-29-saga-repair\Ellie.png`.
- Repaired the open chat in place from its own transcript (backup
  `…\2026-09-29-saga-repair\2026-09-29@12h18m14s697ms.jsonl`): a manual read wrote the missing
  `party_name`, which fired `guild-hall -> road-to-wendhope`; one manually directed illustration was
  attached to the reply that had none, and the duplicate the old cue had drawn was removed with its
  file.

## Gate record — 2026-09-29

- Extension: `npm run typecheck && npm run typecheck:test && npm run lint && npm test -- --silent &&
  npm run test:debug` -> green; Jest **341 suites / 4,585 tests**, debug 416/416.
  `npm run build:dev && npm run build && npm run test:release` -> webpack success, release **77
  pass / 2 skip / 0 fail**. Prod bundle `3a8e4a581565` served; `dist/manifest.json` flavor `prod`.
- Campaign: `python scripts/build_all.py` -> preflight OK, 9 stories, second run byte-identical;
  `build/validate-stories.mjs` clean; `build/check-scope.mjs` none out of scope; harness **94/94**;
  `check_cast` 0 muted; `check_player_copy` 0 problems; `check_cards` 146/146; `check_lab` 0/9
  failing. PNG compression churn reverted; only `Ellie.png` kept.
- Live (dev build, real model): the image director rendered a scene with the real ComfyUI/FLUX path
  (image attached to the reply, saved to the chat file) after `Artemis Local (Unsloth)` passed one
  authenticated request through the GPU broker; a real manual extraction filled `party_name` and fired
  the transition to `road-to-wendhope` (audit `budget.maxTokens` 1024, no rejected lines). The page
  was returned to the prod build and the chat re-opened.
- Not run live: the free-text fifth-reply cadence, the collapse of cadence+cue on one reply in real
  play (unit-tested and observed as the duplicate this change removes), and the campaign Pass D/E
  playtests.

## Unresolved

- A judge-typed `stated` read (F1) still truncates its own evidence to 160 chars, and a latching
  `party_name` needs the judge to clear the 0.9 floor; the residual LLM read covers it when the judge
  abstains, which is what repaired this chat.
- `progress_toward_after-the-fog` was written during the Guild Hall transition (a lookahead/judge
  artifact); harmless at the road but worth watching in the next playtest.
- The repaired chat is a hand-recovery, not a replay; the clean proof of the fixed loop is a fresh
  Saga chat playing Guild Hall -> road -> walls unattended.
