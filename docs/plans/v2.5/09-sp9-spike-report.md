# v2.5 plan 09 — SP9 witness-filtered transcripts, spike report

**Verdict: PENDING.** Conditions are the plan's predeclared table (`09-research-spikes.md` §SP9) and are not retuned. This
file was committed with the fixtures and the measurement procedures below, before any spike code and before any run (rule 1).
The "no message-level hiding" stance is NOT changed by this spike's code: the filter is behind its own install-wide flag
(`spikes.witnessFilter`, off, never flipped by this plan) and loads only through a `__SO_DEV__` dynamic import. The stance is
re-decided by the worth review (rule 8), after the live legs.

## Host facts (ST `7c3994196`)

| Fact | Seen |
|---|---|
| Our generate interceptor is `talkControlInterceptor`; ST awaits every interceptor with `(chat, contextSize, abort, type)` and skips them on a dry run | `manifest.json:13`; `public/scripts/extensions.js:2024-2049`; `public/script.js:4561-4574` |
| `coreChat` is a fresh array of shallow copies (`{...chatItem, mes, index}`, then `{...coreChat[i], mes}`), so `extra` is the LIVE object | `public/script.js:4496-4552` |
| After the interceptors ST reads `coreChat[j]` again for the prompt, so replacing an element is what the request sees | `public/script.js:4770-4834` |
| `IGNORE_SYMBOL = Symbol.for('ignore')` (a registry symbol, so `Symbol.for('ignore')` anywhere is the same symbol); text completion drops a message carrying it, chat completion too | `public/scripts/constants.js:25`; `public/script.js:5841`; `public/scripts/openai.js:584` |
| The WI scan buffer is built from `coreChat` text without looking at the symbol | `public/script.js:4624` |
| In a group ST sets the drafted character before `Generate`, so `characterId` / `name2` name the drafted member inside the interceptor | `public/scripts/group-chats.js:1054-1063` |
| `GENERATE_AFTER_DATA` carries the request ST built, with `dryRun` (the F2 capture point skips dry runs, which never ran the interceptors) | `public/script.js:5318` |
| A group chat file is read with `POST /api/chats/group/get {id}` | `src/endpoints/chats.js:872-881` |

## Witness source (F4's subject)

Scene presence, no model: at every `MESSAGE_SENT` / `MESSAGE_RECEIVED` / `CHARACTER_MESSAGE_RENDERED` the filter records the
story roster members enabled in the group at that moment (the state `cast_changes` drives), plus the speaker. Records live in
memory, keyed by the live message's `extra` object, so a reload forgets them and an unrecorded message is kept (fail-open).
Authored sets (the F2 fixture) take precedence over presence.

## Measurement procedures (predeclared)

- **Deterministic (jest) legs, run once:** `src/runtime/spikes/witnessFilter.test.ts` over `test/fixtures/v25-09-witness.transcript.json`
  (24 messages, three scenes, one whisper, authored witness sets). The chat is shaped the way ST shapes it (a fresh array of
  shallow copies sharing each live `extra`), and each member is drafted in turn.
  - F1 (jest): every live `extra` deep-equal before and after, with no own symbol; control: a mutant that sets the symbol on
    the shared `extra` is caught.
  - F2 (jest): per drafted member, 0 unwitnessed messages without the ignore symbol and 100 % of witnessed ones without it.
  - F5 (jest, indicative only): p95 of the filter over 1 000 calls on a 500-message chat, in node.
- **Live legs, ×2 consecutive on one lane, dev bundle, run header around the batch:**
  - F1 + F2 + F5: `test/scenarios/v25-09-witness.json`: extraction off for the run (nothing may copy a marker into a prompt
    block), the 24 authored messages seeded with `/send` / `/sendas`, 21 real `/trigger` generations (each member in turn), every
    request read at `GENERATE_AFTER_DATA`. F1 compares the seeded rows of the chat FILE and every live `extra` before/after and
    looks for own symbols; F2 searches each request for each message's marker; F5 is the p95 of the filter's own duration per call.
  - F3: J5 and J6, `--strict`, with `spikes.witnessFilter` on (set install-wide, saved, page reloaded) and put back afterwards.
  - F4: `test/scenarios/v25-09-witness-f4.json`: four scenes of five real player turns, `/cp activate` moves the scene and its
    `cast_changes`; the record keeps the transcript and the recorded presence apart. The first 40 messages are labelled BLIND from
    the transcript alone, then scored with `scoreWitnessAgreement` (exact set per message). Route: presence, no model.
- A jest leg is evidence for its condition; the condition's verdict needs its live leg (the conditions name the chat file,
  the request and a real model's chat).

## Conditions

| # | Condition | Pass | Jest leg | Live leg | Result |
|---|---|---|---|---|---|
| F1 | No chat mutation | chat file and in-memory `chat[i].extra` byte-identical before/after 20 generations (a copy must replace `extra`) | 2026-09-26: 24 live extras deep-equal and symbol-free after 3 drafts; control (symbol set on the shared `extra`) caught | pending | pending |
| F2 | Filter correct | authored witness sets: 0 unwitnessed messages in any drafted member's request, 100 % of witnessed kept | 2026-09-26: 0 unwitnessed visible, 0 witnessed hidden, over 61 witnessed checks (DM Narrator 24, Arin 19, Ponticius 18); control (no source) hides nothing | pending | pending |
| F3 | Extraction and rollback unaffected | J5 + J6 green ×2 with the filter on | n/a | pending | pending |
| F4 | Witness source accuracy | ≥ 0.9 of 40 labelled messages (route recorded) | n/a | pending | pending |
| F5 | Cost | interceptor p95 ≤ 5 ms added | one node run, not kept (see deviation): p95 0.12 ms, max 0.39 ms, 1 000 passes of 500 messages | pending | pending |

**No deterministic leg fails**, so the code stays behind the flag and every condition waits for its live leg.

**Deviation (procedure only, bar unchanged).** F5's jest leg was run once (numbers above) and then taken out of the suite:
the code-health ratchet Q1t forbids wall-clock reads in jest (`codeHealth.guard.test.ts`), and a timing number from node
says nothing about the browser anyway. F5 is decided by its live leg alone.

## Build (commit after the procedures)

- `src/runtime/spikes/witnessFilter.ts` (pure): `filterUnwitnessed` replaces a hidden element with `{...row, extra: {...extra,
  [Symbol.for('ignore')]: true}}`, never touching the live `extra`; the drafted member's own words, the continued message and
  any message without a record are kept. `WitnessBook` (WeakMaps keyed by the live `extra`), `presenceOf`, `scoreWitnessAgreement`.
- `src/runtime/spikes/witnessFilterHost.ts`: presence recorder on `MESSAGE_SENT` / `MESSAGE_RECEIVED` /
  `CHARACTER_MESSAGE_RENDERED`, the interceptor step (group, drafted member, not quiet/impersonate), the dev handle
  `storyOrchestratorWitness` (`setAuthored`, `clearAuthored`, `timings`, `export`).
- `src/runtime/wiring/spikes.ts`: `refreshSpikes` reads `spikes.witnessFilter` (install-wide, default off) and, only in a dev
  build, loads the filter through a dynamic import; `talkControlInterceptor` calls it last, after talk and lore, when not
  aborted. `storyOrchestratorSpikes.refresh()` (dev) re-reads the flag without a reload.
- Both spike modules are on the D3 list (`devOnly.guard.test.ts`, `SPIKE_PATTERN`) with a planted-import control each. Prod
  main entry 1 175 031 B (master 1 174 410; +621 for the flag and the hook, no spike code: 0 occurrences of the dev handle or
  the ignore symbol in `dist/index.js`); dev main 1 209 402 B, the filter in its own chunk.

## Pending live legs

Dev bundle served, one lane, ×2 consecutive, a run header around each batch:

```bash
npm run build:dev && npm run serve:dev
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts capture --label sp9
node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group <lane group id> test/scenarios/v25-09-witness.json
node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group <lane group id> test/scenarios/v25-09-witness-f4.json
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-eval.mts "const root = SillyTavern.getContext().extensionSettings['story-orchestrator']; root.settings.spikes = { ...(root.settings.spikes ?? {}), witnessFilter: true }; SillyTavern.getContext().saveSettingsDebounced(); return root.settings.spikes;"
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload
node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict J5 J6
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-eval.mts "const root = SillyTavern.getContext().extensionSettings['story-orchestrator']; root.settings.spikes = { ...(root.settings.spikes ?? {}), witnessFilter: false }; SillyTavern.getContext().saveSettingsDebounced(); return root.settings.spikes;"
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts diff <the captured header>
```

F3's flag write goes through `saveSettingsDebounced`; confirm it landed (reload, then read `getGlobalSettings().spikes`) before
J5/J6, because a flag that never reached disk makes F3 a run without the filter. F4: label the first 40 messages of each run's
`so-sp9-f4` transcript blind, into `test/journeys/records/v2.5-plan09/SP9/f4-labels-run<k>.json`, then score with
`scoreWitnessAgreement`. Records: `test/journeys/records/v2.5-plan09/SP9/live-<bundle12>/`. The worth review (rule 8), and with
it the "no message-level hiding" stance, is decided after these legs.

## Findings so far (not conditions)

- The ignore symbol hides the message from the prompt text, but ST builds the World Info scan buffer from `coreChat` text
  without checking it (`script.js:4624`): an unwitnessed message can still trigger lore by keyword. F2 measures the request's
  message text only; if the stance changes, keyword-activated lore from unwitnessed messages is a second leak to close.
- Presence records are in memory: after a reload every older message is unrecorded and kept (fail-open), so the filter only
  hides what happened since the page loaded. A shipped version would need the witness source persisted.
