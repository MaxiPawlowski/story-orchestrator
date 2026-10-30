# v3.0 34 — Place and time grounding

**Status: BUILT 2026-10-30** on `v3.0-34-grounding` (see Gate record); rating rows owed. Harvest index `30-harvest-index.md`. Size: M (measure first).

## Problem (player)

- The play model sees a wall of messages with no time or place. It loses that a scene moved to the docks at night, puts
  people back in the tavern, or has the sun up again.
- The lore entry for where the party is now fires only if a keyword happens to be in the scan window; a place met this
  turn may get no lore at all.
- Place descriptions written for the wizard and the visual bridge sometimes lean on other places or invent hooks.

## Evidence

- Harvest: `extension-research-2026-10-30/castward.md` P1 (history notes on ST's history copy, scene/time steps, echo
  strip), P2 (current place and just-introduced entity pinned constant on the scan copy until the next user turn), P6
  (self-contained, decorative-only place descriptions).
- Ours: `story_time`/`timeLabel` (`src/engine/life/clock.ts:57`, used only inside clock.ts), location quality
  `PARTY_LOCATION_KEY` (`src/engine/schema.ts:99`), scene card location (`src/runtime/sceneCard.ts`), boundary logs keyed
  `{lastMessageId, chatLength}`. Only chapter folding edits the history copy today (`src/runtime/chapterKit.ts:251`); the one interceptor is `talkControlInterceptor`
  (`manifest.json:13`, set once in `startRuntime()`). Lore force path exists but is judge-picked only (`src/runtime/loreSelect.ts:22`,
  `loreForceWiring.review.test.ts`); `scanGatePlan.ts` only turns entries off. Plan 20 place pack `description` is
  "visible description only" (`20-visual-bridge.md` §Place pack), no rule against cross-references.

## Recommendation

- **S0 Measure (no build, no GPU).** Over recorded sessions, labels frozen before counting: (a) replies contradicting the
  committed location or day part, (b) replies where the current place's lore entry was relevant but not in the scan
  (Sol label on a 40-reply sample, another model, counts only). S1 proceeds only if (a) >= 4/40; S2 only if (b) >= 4/40.
  Otherwise record and stop that slice.
- **S1 History notes.** Pure `runtime/historyNotes.ts` `(chatCopy, boundaryLog, story, resting)` returns
  `[Day N, evening, <place>]` for the **first message of each scene break or time step only**, derived at read time from
  committed boundaries (no stored state). Prepended inside the existing interceptor body on ST's prompt copy (never
  `chat[]`, never re-assign the interceptor), behind `continuity.historyNotes` (on by default once adopted). A note must be
  fixed once written: computed from the boundary's own committed values and the disclosure state **at that boundary**
  (not today's), cached by message id; a delayed read, a later disclosure or a resting-filter change never rewrites an old
  note. Boundary logs keep 200 entries (`src/engine/engine.ts:296`): past the floor the cached note stays as written, and a
  message with no cached note and no log gets none (explicit unknown, never recomputed). No per-turn "now" note. Chapter
  folding runs in the same interceptor: notes apply only to messages the fold keeps. Place names pass `knownEntities` and the resting filter
  (a hidden scene's place never appears). Echo handling: if a reply starts with a bracketed note, the strip goes through
  the polish write path and thought-leak rules (`stHost/polishWrite.ts`), never a new `.mes` writer, and keeps `extra.reasoning` intact.
- **S2 Here-pin.** Code-decided additions to the existing force list: the lore entry bound to the current place and
  codex/person entries latched at the last boundary, until the next player send. Plan 20 binds checkpoints to visual
  packs, not WI entries, so S2 needs a new authored binding `requirements.place_lore: { <location value>: <book> / <entry
  comment> }`, validated against the story's own books (no fuzzy match, no inferred binding; guide topic + validator). Never a gated or held-secret entry (the gate wins),
  never keys the scan copy lacks (`scanGatePlan.ts:70`), no sticky/cooldown edits; placed late through `lorePlacement`.
- **S3 Place description rule.** One guide line in `story-guide.md` (place topic): a description stands on its own as an
  image prompt and invents no hooks. Wizard prompt line. No diagnostic (landmarks and spatial relations are legitimate).
  `npm run docs:guide`; Adolion: route the campaign's place descriptions through another model for review (never the owner).

## Invariants touched

- Engine purity: notes are runtime read-models; the engine only supplies boundary logs.
- Rollback ≡ replay: derived from committed boundaries; a rolled-back boundary takes its note with it.
- Held secrets: resting filter on note place names and on pins; disclosure is not knowledge (pins only latched entries).
- Prefix (13): notes fixed per committed boundary; S1 + S2 need `so-payload-golden prefix` green.
- Prompt layout is quality-rated: S1 needs the blind rating; S2 changes which lore lands (output-changing): rated too.
- World Info rules: S2 is a scan-copy view, writes no file.

## Floors (predeclared, informational)

- D: notes only on scene/time-step messages (40/40 fixture), 0 notes naming an unknown place or a hidden scene; old notes
  byte-identical after a delayed read, a later disclosure and crossing boundary 200 (planted cases); pins 0 gated/secret
  entries over 40 cuts.
- RP: echo rate (reply opens with a note) <= 2/50; location/day-part contradictions vs control down >= 50 % (Sol label);
  blind pairs no category below -0.2, flags <= control + 2, thinking closure no worse (owner decision 4).

## Tests and gates

- jest: `historyNotes` pure cases (no scene break, time step, rollback, resting filter), interceptor idempotence (runs
  twice, one note), pin list keys; payload goldens (notes, pins); `place_lore` validator fixtures.
- `npm run gates`; live gate on a model lane with a sealed time step.

## GPU / rating

- S1 + S2 share one RP window: est. ~40 min for 25 prompts x 2 arms (TO ESTIMATE). Blind Sol rating owner-gated: ask first.

## Unresolved questions

- Note format: `[Day 3, evening, the docks]` vs prose ("Later that evening, at the docks"). Default bracketed (strippable).
- Should the narrator see notes on every member's turn, or only on narrator turns? Default every loud generation.

## Gate record 2026-10-30 (v3.0 build, branch `v3.0-34-grounding`)

Scope per the owner brief 2026-10-30: S2 lore pins built and on; S1 history notes built behind a setting that ships off,
with its blind-rating arm prepared (recipe in `31-outward-narration-and-swipe-contrast.md` §Gate record 2026-10-30); S3
guide + wizard line. S0 not run (see Owed).

- **S2 lore pins (built, on).** Authored bindings `requirements.place_lore` (`{<location value>: {book, entry}}`) and
  `requirements.people_lore` (`{<codex people id>: {book, entry}}`), `engine/loreBindingSchema.ts`; shape in
  `validate/loreBindings.ts` `readLoreBindings` (book in `requirements.lorebooks`, exact entry comment, no other key),
  `checkLoreBindings` (place key a `location` value, people key a codex People id). Pure pick `runtime/lorePins.ts`: the
  current place (only while its People and Places page is known) plus codex places and people latched in the latest round
  (boundaries since the player's last message, or the exchange before it until a reply lands, so the reply to the next
  send still gets them). `pinLore` loads the scan copies (`getScannableEntries`, already gated and placed by the
  ENTRIES_LOADED listeners, so a pin lands at the late depth), refuses an entry the copy holds `disable: true` (the gate
  wins), one the resting filter changes (held secret) and a missing one, and forces the scan's own objects through
  `forceActivateEntries`: no key added, no timed-effect edit, no file write. RunOwnership checked after the await and before
  the force (census row `lorePins.ts#pinLore`, checked). Wired after lore select in the interceptor (`wiring/lore.ts`
  `onIntercept`), withheld for quiet/impersonate, owned chat only; evidence ring gets select picks + pins. An exclusive lore
  select that switched a pinned entry off on the copy wins (the pin sees `disable`). Setting `worldInfo.lorePins` (on),
  control `#so-wi-lore-pins` (World › Lorebooks, Author view). Studio `setRequirements` and wizard `parseFields` keep the
  bindings; no Studio editor for them (JSON/import only): deviation, Studio is plan 29's zone.
- **S1 history notes (built, OFF).** Pure `runtime/historyNotes.ts`: `[Day N, part, place]` on the first message after a
  boundary that moved the place or the day part, computed from that boundary's own before/after values (codex place name
  only when known at that boundary, else the quality's `player_labels`, resting filter at write time), cached per chat +
  story by message id: a later read, disclosure or filter change never rewrites it; a rolled-back boundary drops its note;
  past the 200-entry floor a cached note stays and an uncached one is never recomputed. The cache is in memory: after a
  page reload notes older than the floor are gone once (deviation from "fixed forever", recorded). Applied in the talk
  interceptor after the chapter fold, on ST's prompt copy only (rows mapped by their shared `extra`, the fold idiom),
  idempotent, never on the message a continue extends. Echo: reply repair `history-note` (between thought-leak and
  keep-last) strips a leading known note or the note shape via `rewriteReplyText`, reasoning kept. Setting
  `memory.historyNotes` default **off**: the exception to on-by-default until ARMS-34S1 passes; control `#so-history-notes`
  (Characters › Added to the reply prompt, Author view). Deviation: the plan's `continuity.historyNotes` lives under
  `memory` (no continuity settings section).
- **S3 (built).** Visual packs Good line in `story-guide.md`; `PLACE_DESCRIPTION_RULE` in the agentic wizard rules
  (`copilot/agent/prompt.ts`); staged wizard prompt unchanged. Campaign place-description review: NOT done (campaign repo
  not opened by rule).
- Payload goldens not extended: interceptor edits (pins, notes) do not run on ST's dry run (`script.js:4562`), so
  `so-payload-golden` cannot see them; the prefix check rides ARMS-34S1's real requests.
- FEATURE_STATE: no row (install-wide settings, no StoryFeatureId). Plan 24 matrix rows added.
- Tests: `lorePins.test.ts` (11), `historyNotes.test.ts` (14).
- Owed (GPU queue): **ARMS-34S1** (notes, Sol blind 25 pairs; recipe in plan 31's record, `--gate notes`), 34 S2 live gate on a
  model lane (a pin lands in `storyOrchestratorLoreEvidence`, a gated entry stays off), S0 baseline counts (not built),
  campaign `place_lore` adoption. Lane checks: NOT run (no staging, brief).

Gates (branch tree `b2c47f1d`, shared by plans 31 and 34):

- `npm run gates:quick`: RED first (expected fixture and census updates: injection registry, reply-repair order, show-me rows,
  ownership census, session baseline, worldInfo settings), fixed, targeted jest 228/228 green, `typecheck:test` clean.
- `npm run gates -- --no-storybook` (run 1): RED at `debug:typecheck` (two type errors in `lib/promptArms.mts`), fixed (`b2c47f1d`).
- `npm run gates -- --no-storybook` (run 2, no `--resume`): typecheck, typecheck:test, build, lint, test, test:replay (32 of 32
  killed), debug:typecheck, test:plugin, test:release ok; **test:debug FAIL** on `scripts/local/orphans.win.test.mjs` "a
  hard-killed controller leaves no text server behind" (controller reaper timing, untouched by this branch, machine saturated
  by parallel builders). Rerun alone: 3/3 pass. `npm run gates -- --no-storybook --resume`: "gates: all green in 239.2s (8
  step(s) reused)", test:debug ok.
- Storybook alone on port 6234 (`npm run storybook:build`, then the http-server + test-storybook pair, `--maxWorkers 2`):
  168/169 suites, 1024/1025 tests; the one failure `Studio/StudioModal › Seeded` timed out at 15 s in a tab loop (274 s
  suite under load, file untouched). Rerun alone (`--maxWorkers 1 src/studio/StudioModal.stories.tsx`): 13/13 pass.
- Main bundle 1,270,115 B (budget 1,300,000): history notes and swipe contrast ride lazy chunks; pins load lazily too.
- `node --test scripts/debug/promptArms.test.mts`: 8/8.
- Lane checks and real-LLM gates: NOT run (no GPU, no staging, brief 2026-10-30).
- UI-rework-zone files touched: `src/components/settings/PlayGroups.tsx` (CharacterStateGroup trial rows, lore-pins state),
  `src/components/settings/WorldInfoGatingGroup.tsx` (`#so-wi-lore-pins` row), `src/studio/mutations.ts` (`setRequirements`
  keeps the bindings).
