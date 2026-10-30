# v3.0 34 — Place and time grounding

**Status: PLANNED 2026-10-30** (harvest 2026-10-30, index `30-harvest-index.md`). Nothing built. Size: M (measure first).

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
