# mvu-helper — 2026-11-08 harvest

meta: github.com/KritBlade/mvu-helper · HEAD v0.3.468 (one squashed commit, new repo) · **AGPL-3.0: ideas only, never code** ·
read: README, `doc/mvu_squad`, `doc/roster/*`, `doc/image_gen/{README,drawing,pic-tag}`, `doc/gamelogic_engine/runtime.md` §Dice,
`devdoc/editing-a-finished-reply.md`, `src/features/{character-roster/dna-core,worldinfo-budget,streetcleaner,small-llm/turn-phase-signal}-core.js`,
`src/sillytavern/{reply-integrity-core,finish-reason-tap}.js` (heads) · skipped: status-menu builder/DSL, event-pack and gamelogic-plugin
formats, logic-engine sandbox internals, comfyui-workflow/, i18n, tests · SECURITY.md verdict: CAUTION · no prior review.

## What it is

A "game inside a character card" layer over MVU (MagVarUpdate) + TavernHelper + ST-Prompt-Template. Per reply: cheap PRE model
classifies the player's line, card EJS renders a per-model view of `stat_data`, main model narrates and reports `/Intent` lines, a
card-shipped JS logic engine (sandboxed Worker) does the arithmetic, a cheap POST model records what the prose shows. Plus a
character look registry ("DNA") and auto image generation from inline `<pic>` tags. Large, heavily documented, Chinese-card-ecosystem
oriented. Most of the game-engine half is what SO already does differently (authored graph, seeded checks, off-path reads).

## How it works (worth knowing)

- **Look registry** (`doc/roster/registry.md`, `src/features/character-roster/dna-core.js:17` `SECTION_RE`): one *disabled* lorebook
  entry per named NPC, `[Body]` / `[Clothes]` / `[Clothes:<place-role>]` / `[Alias]` / `[AllowUpdate]`. First time the story names
  someone, the narrator (or a POST call) appends `<cast name=".." body=".." clothes="..">` once; saved; afterwards the model writes the
  name only. Named outfits must be `<place|role>-<outfit>` (bare "swimsuit" refused); one-off outfits are never saved to the entry but
  kept in per-reply state (`worn_outfit`, stamped with `last_picture_message`, dropped after 100 replies), so swipe/delete roll them back.
  Roles ("the guard") are never registered. Rename/merge/alias UI for one character saved twice.
- **Composition is the shot, never the look** (`doc/image_gen/pic-tag.md:32-62`): the model writes pose/action/contact/scene only;
  when every person in the shot has a stored look, code strips fixed appearance phrases the model wrote anyway (hair/eye colour, size,
  build words), keeps clothing states ("unbuttoned", "wet hair"); leaves the composition alone if anyone lacks a look.
- **Owner-named look blocks** (`doc/image_gen/drawing.md:100-118`): each person's look wrapped in a named open/close block for
  LLM-text-encoder image models; measured 11-12/12 seeds correct vs 8/12 for plain named sentences (Krea 2). Over the per-image
  character ceiling, drop main character first, then last slots, and log who was dropped.
- **Streaming pre-generation** (`doc/image_gen/drawing.md:7-28`, README:259): a `<pic>` tag starts drawing as soon as it is complete
  mid-stream, never inside an open `<think>`, never when a slot's look only arrives at reply end; stream job and draw pass share one job key.
- **Same-reply resolution** (`doc/mvu_squad/README.md`, `doc/gamelogic_engine/runtime.md:62-80`): dice are dealt *while the prompt is
  built*, shown to the model, and the engine resolves with the same die; PRE classifies the player's line before narration so the
  outcome lands in the reply that narrates the attempt. Card check "DIE NOT FROM POOL" flags a model inventing its own number.
- **One write per finished reply** (`devdoc/editing-a-finished-reply.md`): every post-reply edit goes through one redraw owner that
  mirrors the swipe text, then does render + `MESSAGE_UPDATED` + save once, each step caught separately; late writers announce
  themselves with an allowance or miss the write.
- **WI budget arithmetic** (`src/features/worldinfo-budget/worldinfo-budget-core.js:1-60`): inverts ST's budget formula to tell the user
  the Context Size at which the cut entries would fit, rounded up to a typeable number.
- **Finish-reason tap** (`src/sillytavern/finish-reason-tap.js:1-60`): wraps `window.fetch`, clones completion responses, reads the
  finish reason ST discards, to tell a content-filter cut from a dropped stream. Observation only.
- **Phase ledger** (`src/features/small-llm/turn-phase-signal-core.js`): busy signal on idle→busy edge only; an unbalanced close is
  refused so the count can never go negative and kill later busy edges.

## Patterns for SO

### P1. Harvest an unknown NPC's look once, as a curator create — feature · image track · our state: partial · value 4 · effort M
What: a named NPC with no authored look gets one described once, then reused for every later picture.
Their evidence: `doc/roster/registry.md` §How a character gets on file, §When clothes get saved; `dna-core.js:17`.
Our state: roster members get `illustrations.appearances` (`src/image/cast.ts:38-58`) and card values (`publicLook`, `cast.ts:53`);
non-roster NPCs get a look only from an authored `Public appearance:` lore line (`src/image/lore.ts:9,30`, `visualLore`). An NPC the
story invents in play is drawn from the director's guess each time; 18 records eye/outfit drift (`docs/plans/v3.0/18-image-e2e-review.md:139`).
Fit: route it through the existing curator create path so "stagecraft proposes, never writes" holds: an applied create in the story's
`stagecraft.lorebooks`, carrying the created stamp (`stagecraft/createdStamp.ts`) and a `Public appearance:` line, which `visualLore`
already reads; near-duplicate warning (A15) covers the "saved twice" case; `memory/nameFold.ts` already refuses roles/ambiguous names.
Take their rules: named only (never a role), body vs clothes split, clothes saved only for first sighting or a uniform-like outfit, never
the player's persona. The entry is public text, so it passes the resting filter like any lore. Sketch: image director (or the scene
read) emits `look_harvest {name, body, clothes}` for a visible named subject with no look on file; curator op; picture waits for it only
when the op applies on the spot (`auto` mode).

### P2. Strip appearance phrases the director wrote when every subject has a pinned look — pattern · image · absent · value 3 · effort S
Their evidence: `doc/image_gen/pic-tag.md:50-62` (colour on hair/eyes, size, build words; keep states and garments; skip when anyone
lacks a look; never empty the composition).
Our state: `src/image/tagHygiene.ts:21-37` strips names, framing, angle and counts only; the "appearance is authoritative" rule is
prompt text to the director (`src/image/prompt.ts:71`). Land in `tidyTags` behind `hygiene` gaining `allLooked: boolean`
(true when every visible subject has `identityTags`, `src/image/visualPlan.ts:19`). Pure, unit-testable; image quality claims need the
18 consistency probe rerun.

### P3. Owner-named look blocks in multi-person prompts — pattern · image · partial · value 3 · effort S
Their evidence: `doc/image_gen/drawing.md:100-118` (measured 11-12/12 vs 8/12).
Our state: the template path joins looks unnamed with `"; "` (`src/image/prompt.ts:40`); director path pins identity tags
(`visualPlan.ts:19`) without owner marking. Only relevant for text-encoder models (Qwen/Flux class), not SDXL tag models; gate on the
model source's family. Measure on the 18 probe before adopting (predeclared floor).

### P4. Same-reply check outcomes (pre-reply attempt read) — feature · game layer · absent · value 4 · effort L
Their evidence: PRE classifier + dice dealt at prompt build, `doc/mvu_squad/README.md` §One reply step by step; `runtime.md:62-80`.
Our state: checks roll at the boundary after the attempt is read; "the next reply is told the outcome"
(`docs/authoring/story-guide.md:626`; `src/runtime/storyCheckDraws.ts:44-57,107-117`). So the reply to "I climb the wall" is written
without the outcome (see defect D1). Sketch: while a checkpoint check with `when` is pending, the drafted-member pre-pass slot
(`src/runtime/draftedBeat.ts`, already awaited in the generate interceptor) asks a tiny yes/no read on the player's line for the `when`
keys; on yes, resolve with the same seeded units (`checkUnits`, `storyCheckDraws.ts:34`) and inject via `checkOutcome`
(`src/constants/injectionRegistry.ts:45`) for this reply. Invariant care: the read is a proposal; the boundary must still commit the same
roll from the real read (rollback ≡ replay), and a mismatch (pre-read yes, boundary read no) must be journaled, never silently kept.
Adds one model call per pending-check turn; thinking/inner voice untouched.

### P5. Lore-budget check names the number — pattern · lore/checks · partial · value 2 · effort S
Their evidence: `worldinfo-budget-core.js:1-60` (budget = pct × (context − response) / 100, capped; solve for context; round up).
Our state: `lore-budget-starved` names cut entries and the top consumer but says only "Raise the World Info budget"
(`src/runtime/checksSetup.ts:389`). Add "needs about N tokens more: set Context % to X or Budget Cap to Y" from the snapshot's
`loreBudget` (no write; owner applies).

## Suspected SO defects

- **D1. Attempt reply has no "outcome pending" clause.** A pending check's outcome is injected one reply late
  (`src/runtime/storyCheckDraws.ts:107-117` header "Show each one happening in this reply", lines filtered to
  `record.messageId === lastMessageId`), and nothing tells the narrator of the attempt reply to leave the attempt unresolved
  (grep for a pending-check clause in `src/runtime`, `src/engine`: none; nearest is `src/engine/agency.ts:36`, which covers objectives,
  not checks). Risk: the attempt reply narrates success, the next reply is told "fails". MVU's design exists to avoid exactly this
  (`doc/mvu_squad/README.md` "when PRE decides something, PRE writes it"). Cheap fix independent of P4: while a check waits for its
  attempt at the active checkpoint, add one clause to the turn's guidance ("If {{user}} attempts <label>, show the attempt starting, not
  how it ends"). Needs a live check on a public-check fixture before calling it a defect.

## Host facts

- ST discards `finish_reason` on the main reply at every client layer (their claim, `finish-reason-tap.js:1-6`; SO already reads it for
  its own side calls, `src/services/stHost/modelReply.ts:105`). Not verified here.
- `updateMessageBlock` rebuilds `.mes_text` and destroys anything mounted inside it; `MESSAGE_UPDATED` is the signal for others to
  remount (`devdoc/editing-a-finished-reply.md` §TRACK1). SO never mounts in `.mes_text` and its repairs run in the first
  `MESSAGE_RECEIVED` listener (`src/runtime/replyRepairsLive.ts`, `replyRepairs.ts`), before ST's own save, so no change needed.

## Not worth taking

- Card-shipped JS logic engine / Worker sandbox, EJS views, TavernHelper scripts: SO stories are data; running author code is a security
  surface we do not want.
- PRE model writing state before narration (`<JSONPatch>`): breaks "reads apply only at the next boundary"; P4 keeps it a proposal.
- `/Intent` lines in the visible reply: SO reads off-path with quoted evidence; no visible markup.
- Inline `<pic>` tags written by the narrator + streaming pre-generation: SO's director is a separate pass so the reply prose stays clean;
  mid-stream drawing would fight the GPU broker's text/image arbitration.
- Unseeded crypto dice: SO chance is seeded by design.
- Status-menu DSL, event-pack/plugin mod system: SO has widgets, offers and authored checkpoints; a mod ecosystem is out of scope.
- Finish-reason fetch wrapper: low value on the local llama.cpp setup; a `window.fetch` wrap is a broad host override.
- Bust LoRA multiplier: not applicable.

## Security notes

- CAUTION per SECURITY.md, confirmed by read: `src/features/mvu-bootstrap/mvu-bootstrap.js` installs a global TavernHelper script that
  `import()`s a jsDelivr bundle (MagVarUpdate, tag-pinned) on every chat; installed schemas import an *unpinned* jsDelivr module
  (`StageDog/tavern_resource/dist/util/mvu_zod.js`); card/pack engine text runs via `new Function` in a Worker (CSP-restricted). Pack
  regex/EJS rows run unsandboxed on the page via ST-Prompt-Template. `src/sillytavern/finish-reason-tap.js` wraps `window.fetch`
  (observes only). Unsafe to install as-is.
- None of P1-P5 needs remote code, a fetch wrapper, secrets or user endpoints.
- Agent-addressed text: `doc/ai_guide/*.md` open with "You are an AI coding assistant in a clone of the `mvu-helper-template`
  workspace". Treated as data; not opened further, not followed.
- AGPL-3.0: ideas only; nothing above copies code.
