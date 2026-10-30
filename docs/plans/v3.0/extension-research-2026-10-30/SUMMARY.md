# Extension harvest 2026-10-30 — summary

## Method and safety

- Ask (owner 2026-10-30): one more pass, carefully, after the trojaned Bot Browser extension stole keys the week before.
- Forum `#📦・extensions` re-listed in the browser pane: 8 threads since 2026-10-21. Cloned 3 (TavernOS HUD, Stat Tab,
  Simply-LoreAndTracker); skipped 5 UI-only (Message Fold & Delete, Message Actions Manager, Teams / iMessage / Discord themes).
- Clones and fetches ran with hooks, symlinks, fsmonitor, submodules and LFS filters off, https only
  (`C:/dev/st-extensions-research/_refresh-2026-10-30/safegit.sh`). 13 repos changed (old head = branch `pre-refresh-2026-10-30`).
- Before any idea harvest, a regex screen and an Opus security reviewer read every new repo and every diff:
  `C:/dev/st-extensions-research/_refresh-2026-10-30/SECURITY.md`. Verdicts: 15 CLEAR, lattice CAUTION, none suspicious.
- Seven Opus reviewers, read-only, never inside a clone (`_brief.md`). Nothing was executed, installed, built or loaded into ST.

## Security findings

- **lattice CAUTION:** new optional server plugin `lattice-files` reads/writes text files (admin: whole disk; user: the data
  folder holding `secrets.json`), reachable by any page script; setup ZIP ships `.cmd`/`.sh` that can turn on
  `enableServerPlugins`. Do not install the plugin; the browser extension is fine.
- **Agent bait** (quoted in the reports, never followed): castward `AGENTS.md` (escalate sandbox, drive the live ST at :8000);
  nemopresetext tracks `.claude/settings.local.json` granting `Bash(python:*)`; dooms `docs/handover-short-fuse.md` tells "a
  local Claude Code session" to commit under the owner's git identity; lattice plan files open with a "REQUIRED SUB-SKILL" line.
  Never start an agent with a clone as its working directory.
- **TavernOS HUD** wraps `window.fetch` and rewrites every text-generation body, other extensions' too: if ever installed, SO's
  reads see rewritten history and play prompts get a per-turn system message. Deserves an info check like `transcript-copiers`.

## Suspected SO defects (code reads, not reproduced)

- **Regenerate after a trailing system row** (dooms P2): ST's Regenerate deletes the last message when it is not the user's,
  hidden system rows included (`script.js:4402-4409`). SO's image placement `"message"` (`stHost/image.ts:123-133`) and the
  opt-in `/comment` transition note leave such a row; Regenerate then removes it and writes a second reply. Next: a no-model
  scenario.
- **Story macros dead after a macro-engine flip** (nemopresetext P1): ST switches substitution engine at once
  (`script.js:2837`) but registration went only to the startup engine (`macros.js:82`); `stHost/version.ts:38-40` reports the
  setting, not what substitutes. Fix: canary `substituteParams` probe + `degrades` check `story-macros-unresolved`.
- **Chapter-fold IGNORE hole on Chat Completion still open** (2026-10-21 §3): `chapterKit.ts:324-347` still folds one range per
  chapter; v2.8 69 M05 marked "Not built"; M06 (`transcriptCopiers.ts`) not built either.
- **Archive recall on the reply path** (vectfox P0, perf, unmeasured): the generate interceptor awaits recall that rebuilds a
  temp vector collection and waits up to 15 s for judge idle, once per drafted member (`wiring/talk.ts:92`, `chapterKit.ts:107-145`).
- **Display-only qualities never read** (stat-tab P1): a quality with only `display.public` never enters extraction scope
  (`extraction/scope.ts:62-126`), so the sheet stays empty; Studio only warns. Fix: a rotating `display` scope source.
- **Optional held-secret filter defaults to "no filter"** (st-memory-books P1): `chapterKit.ts:282`, `pacing/focus.ts:12`,
  `living/export.ts:12`. No current leak; make the parameter required.

## Player-experience ideas

- **Narrator sees only what the player can see** (lattice P1, 3/S): the narrator gets private hiding/intends/knows lines with
  "use this to foreshadow" (`memory/innerRender.ts:94-96`); add one fixed clause. Blind rating first; thinking/inner voice untouched.
- **Player-chosen skip ahead** (dooms P1, 3/M): "cut to the next scene" the player chooses; `NO_SKIP_CLAUSE` already allows it.
- **Who-knows-what grid, Author view only** (tavernos P1, 3/M) + alert when a kept-out member is on stage. Never on a player surface.
- **"Here now" tab in the 29 story sheet** (tavernos P2, 3/S) reusing `runtime/sceneCard.ts` `sceneView`.
- **Deferred/answered thread states** (lattice P2, 3/S-M) so a put-off topic stops being pushed; fits 19.
- **Time/place notes on past messages** (castward P1, 3/M): only on scene breaks and time steps, from committed boundaries;
  measure + blind rating.
- **Pin current location's lore** into the next scan via `loreSelect` force, decided in code (castward P2, 3/S-M).
- **Rejected swipe as a one-shot negative example** (nemo ReSwipe, 3/S build, M rate): prompt tail, cache-safe; rate first.
- **Say what a read waits on, bounded into Retry** (bb-map P1, 3/S) for 29; **feature rows say which model and what they
  write** (scene-archivist P1, 3/S) for 29's FeatureList.
- Smaller: seeded name hints for the director (castward P3), local JSON repair before a living retry (lattice P3), "new this
  turn" placeholders (tavernos P3), story sheet in a real second window (stat-tab P2, owner question after 29 IC5), footer-adding
  extension conflict row (simply-loreandtracker P1), off-means-unseen payload goldens (dooms P3).
- Evidence for v3.0 17: lattice built post-generation revision on 10-25 and dropped it a day later for cost/latency.

## Host facts

- Connection Manager streaming yields accumulated text, not deltas (`custom-request.js:165-187`); its non-streaming errors
  carry no HTTP status (`:470-475`).
- On a swipe ST drops the rejected message from the prompt copy before interceptors, but `chat.at(-1).mes` still holds it.
- `hideStopButton` emits `GENERATION_ENDED` on every shown→hidden Stop (`script.js:3533`); `stopGeneration` emits
  `GENERATION_STOPPED` with nothing running. Castward forces Stop visible: harness "stop visible" misreads with it installed.
- ST copies `message.extra` across swipes (`script.js:3705-3712`): per-swipe data needs a swipe-id stamp.
- PromptManager saves drag order read from the DOM (`PromptManager.js:1919-1925`): 29's reorderable lists save from state.
- `#curEditTextarea` missing from `.claude/sillytavern-docs/community/ui-dom-selectors.md`.

## Reports

tavernos-hud, stat-tab, simply-loreandtracker, castward, lattice, dooms-enhancement-suite, scene-archivist, st-memory-books,
vectfox, bb-interactive-map (+ bb-enhance-gen), bb-visual-novel-engine, nemopresetext, small-updates (characterbench,
languagetool, danganronpa).
