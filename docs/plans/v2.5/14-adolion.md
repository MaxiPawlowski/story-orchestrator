# Plan 14 — Adolion: clean install, dev enablement, plugin findings

**Status: A and B DONE, C5–C10 landed 2026-09-27 (offline gates green; C live gates owed). C3/C4/C11 open.**
User decisions 2026-09-27: full clean slate; Jev's judge on with every
`judge.uses.*` enabled; triage and fix the plugin findings in this repo; this doc is the only plan artifact;
install + offline gates in this effort, **live lane legs deferred** (fixes mark their live gates owed).

Inputs:
- Campaign `C:\dev\adolion-campaign` @ `master` (`78b0e80`), clean. `SO_PLUGIN` gate defaults to this checkout.
- This repo @ `dc8dac54` (master HEAD). ST `C:\dev\SillyTavern-MainBranch` pinned `7c3994196`, currently **prod** build.
- Findings source: campaign `lab/README.md` §"What the lab found in the plugin (for the plugin team)" plus each
  `lab/*/README.md`; cross-checked against `09-sp*-spike-report.md`.

## Inventory (verified 2026-09-27, before any change)

Current ST install is the old ADAPT 2-story build plus test residue. `world_info.globalSelect` is **empty**. Curator
on (`auto`), judge disabled, nine spike flags present and off, `gatingMode: file`.

| Kind | Present now | Owned by ledger? |
|---|---|---|
| Library stories | `adolion-adventurer` v9 (4 members), `adolion-academy` v11 (4 members), `so-j9-wizard`, `so-j9-fixme` | old + fixtures |
| Lorebooks | 9 ledger books + orphans `The Fantasy World of Adolion.json`, `main_The Fantasy World of Adolion_world_info.json`, `Adalion groupchat.json`; `Xentar*` (plugin example) | 9 yes, 3 orphan |
| Cards | 7 cast (`Adolion Narrator`, Tobias, Belle, Dalan, Natalia, Shiya, Ronan) + `Adolion Storyteller` (a source card, not in the 147) | 7 yes |
| Groups | `1789797226071` Adventurer's Road, `1789797226079` House Nightriver (4 members each), `1757172011689` AdolionGroup | old |
| Chats | 119 group chats + 21 solo chats (much journey/playtest residue) | mixed |
| Wizard sessions | `untitled`, `untitled-story` (SO-* test lorebooks) | test |

Campaign build: 9 stories (`adolion-adventurer` v17 … `adolion-saga` v3), 147 cards, 16 installable books (7 named +
9 `Adolion * Checkpoints`; the docs say 15 — confirm against `install_st.py`'s list at A2), 9 groups.

## Part A — Clean slate + full install

### A0 Backup

Copy `data/default-user/` `worlds/ characters/ groups/ chats/ group chats/ settings.json` to
`C:\dev\backups\story-orchestrator\2026-09-27-adolion-clean\`. Nothing under `data/` is deleted; every removal is a
copy-then-remove. ST stopped for A1–A2.

### A1 Remove the old Adolion install

Move to the backup, then remove from `data/default-user/`:

| Target | Items |
|---|---|
| Lorebooks | the 9 ledger names + `The Fantasy World of Adolion`, `main_The Fantasy World of Adolion_world_info`, `Adalion groupchat` |
| Cards | `Adolion Narrator`, `Tobias`, `Belle`, `Dalan`, `Natalia`, `Shiya`, `Ronan`, `Adolion Storyteller` |
| Groups | `1789797226071`, `1789797226079`, `1757172011689` |
| Library | records `adolion-adventurer`, `adolion-academy`, `so-j9-wizard`, `so-j9-fixme`; clear both `wizardSessions` |
| Chats | the three groups' `chats[]` group-chat files + the solo Adolion chats |

**Kept:** `Xentar.json` / `Xentar Checkpoints.json`, `Arin` / `Ponticius` / `DM Narrator`, `Group: Arin, DM Narrator`
(plugin harness fixtures), and every unrelated asset. Group-chat ownership is read from each group's own `chats[]`
array — filenames carry no group id. `MANIFEST.md` is regenerated in A3, not hand-edited.

### A2 Install

1. `python scripts/install_st.py` → the books + 147 cards (all fresh; no `--update-cards` needed on a clean slate).
2. Evict the WI cache (README step 3).
3. Global-select every Adolion book (`/world state=on silent=true "<name>"`), all 16; keep `Xentar Checkpoints` off.
4. Run `build/st-groups.js` in the page → 9 groups.
5. Import the 9 `build/story/*.story.json` (`so-library.mts` to confirm id/title/version).
6. Verify per TESTING §3c: requirements ready; Adventurer's `guild-hall` background + gated entries; Nightriver's
   Javon/Eriana muted and Noble Life on; the Saga mutes every off-scene member.
7. Turn the curator on (`setStagecraftSettings({curatorEnabled:true, acceptMode:'auto'})` — matches the current install).

### A3 Manifest

`install_st.py` rewrites `MANIFEST.md`; commit it together with any `installed.json` it updates.

## Part B — Dev pieces

### B1 Spikes

Dev build only: `npm run build:dev && npm run serve:dev`, then `node scripts/debug/st-session.mts reload`. Flags stay
off by default; the runbook in each `lab/*/README.md` flips only what a leg needs and flips it back. Run
`sh scripts/check_all.sh` (offline) plus each `lab/*/check.py` on the fresh build. Restore prod (`npm run build`)
before any release/acceptance run.

### B2 Jev's judge

- `plugins/story-orchestrator-judge` 1.1.0 must log "Initializing plugin" on ST start; `judge.model: jev-1.13.0`.
- Set `judge.enabled = true` and enable **every** `judge.uses.*` (director, memoryVerify, memoryPairs, sceneTrigger,
  sceneTracker, lookahead, loreSelect, curatorFilter, typedExtraction, stallCheck, expansionCritic, expansionLookahead,
  agencyCheck, houseRules, loreExclusive); warden on under Stagecraft.
- Record the pre-flip values (install-wide) in the gate record so a restore is possible.
- Cost note: lore select over the 263-entry book alone is 5 judge requests per turn; expect slower turns.

### B3 Role profiles

Set the chat model, the extraction profile (may share), and "Wizard and road ahead" (authoring). Without the authoring
profile the A3 generated stubs take their fallback exits.

## Part C — Plugin findings triage + fixes

Verified against `dc8dac54`. Two are already fixed on master and only need re-verification; the rest are open.

| # | Finding | Site | Status | Area |
|---|---|---|---|---|
| C1 | Manual shared read needs a window | `sharedRead.ts:100`, `extractionCoordinator.ts:297` | **fixed `7663bbb0`**, verified on master (`runNow` passes `hosts.chat.chatWindow`); live leg owed | product |
| C2 | Group quiet/impersonate leaves outermost open | `generationLifecycle.ts:61-78` | **fixed `76d93f02`**, verified on master (`wrapperFinished` wired at `wiring/generation.ts:103`); live leg owed | product |
| C3 | `requirements.ready` suppresses ALL checkpoint effects (solo / partial group) | `effectsApplier.ts:233` | open — **needs a design call** (apply the non-requirement effects, or a partial set) | product |
| C4 | `/cp activate` applies only the target's effects (stale scenario + WI) | `runtimeManager.ts:228-233`, `effectsApplier.ts:273` | open — **needs a design call** (path-replay vs release the prior scene) | product |
| C5 | Witness presence is `[name,id]` → exact-set 0/40 by construction | `wiring/spikes.ts:13`, `roster.ts` | **fixed 2026-09-27**: `nameForRosterId` (roster.ts) replaces `namesForRosterId` in `enabledNames`; tests in `roster.test.ts` | spike |
| C6 | Rollback does not rewind `firedNpcReplies` | `effectsApplier.ts`, `rollback.ts` | **fixed 2026-09-27**: `npcReplyRewind.ts` records each fire's message id; `rollbackOnce` quarantine rewinds and clears `lastSelfInjectionMessageId` | spike |
| C7 | Spent complication pools re-release once releases leave the 200-entry log | `spikes/sp6Complications.ts` | **fixed 2026-09-27**: `ReleaseInput.spent` seeds `used` from releases older than the window; the seam keeps a rollback-aware retired set; `install.ts` shares it with the view | spike |
| C8 | Curator refusals repeat; prompt never mentions spans | `stagecraft/proposal.ts`, `curatorTiers.ts`, `curatorDigest.ts`, `types.ts`, `prompt.ts` | **fixed 2026-09-27**: `CuratorPlan.refused` persists refused ops; `declinedOps` merges them; prompt declares `{{// so:protect}}` spans | spike |
| C9 | Digest index invites no-op enables | `stagecraft/curatorDigest.ts` | **fixed 2026-09-27**: index marks `[currently on]`/`[currently off]` and the header names the allowed switch per state | spike |
| C10 | Director parser matches roster ids; 24 Adolion ids are ordinary words | `talk/parse.ts` | **fixed 2026-09-27**: name-only match (`buildCandidates` already maps a nameless member's name to its id) | spike |
| C11 | Lore select chunks 263 entries into 5 calls/turn; `lore.json` uids churn | `judge/lore*.ts`, fixture | open — deferred: cost/accuracy tradeoff needs the live token measurement (A9) | judge |
| C12 | onEnter replies bury the gating reply (65% of saga transitions) | design | documented (caps swipe-back/edit live reach) | — |
| C13 | `cast_changes` decides who speaks, not who hears; guidance secrets reach every drafted member | design | documented (SP9 stance) | — |
| C14 | SP5 C4 pass rule assumes distinct card texts; `/cp activate` jump leaves stale scenario | test fixture | documented; covered by C4 | — |

**Order:** C3, C4 (product paths) → C5–C11 (dev-only, behind flags) → C12–C14 (doc). C5–C10 landed 2026-09-27;
C3/C4 await the design call; C11 awaits the live measurement.

**Gates:** every fix takes the tier of the area it touches (CLAUDE.md §Validation). Product-path C3/C4 need
`typecheck && typecheck:test && lint && test && test:debug` + `build && test:release` + a real-LLM live gate. Spike and
judge code takes the pure-module gates plus `build`. **The live gates are owed** (deferred with the lane legs) and the
handover states so; no fix is called green without one.

## Part D — Gate record

### C5–C10, 2026-09-27 (master `dc8dac54` + this work)

```
npm run typecheck          → 0
npm run typecheck:test     → 0
npm run lint               → 0
npm test                   → 337 suites / 4542 tests pass
npm run test:debug         → 416 pass / 0 fail
npm run build              → ok, main 1 186 869 B (budget 1 250 000)
npm run test:release       → 76/79; 1 fail ("UP: clean-host.sh keeps a pre-release suffix…",
                             scripts/release/versions.test.mjs, untouched here — a bash/clean-host
                             environment assertion, pre-existing); 2 skipped
```

Files: `runtime/roster.ts`, `runtime/wiring/spikes.ts`, `runtime/npcReplyRewind.ts` (new),
`runtime/effectsApplier.ts`, `runtime/rollback.ts`, `runtime/types.ts`, `runtime/extras.ts`,
`runtime/spikes/sp6Complications.ts`, `runtime/spikes/install.ts`, `stagecraft/proposal.ts`,
`stagecraft/curatorTiers.ts`, `stagecraft/curatorDigest.ts`, `stagecraft/types.ts`, `stagecraft/prompt.ts`,
`talk/parse.ts` + their tests.

**Live gates owed** (deferred with the lane legs): C1 (SP5/SP2), C2 (SP6 K2), C5 (SP9), C6 (SP7), C7 (SP6),
C8 (SP8 W3), C9 (SP8 W4b), C10 (SP3 director). No fix is called green until its live leg passes.

### A (clean slate + install), 2026-09-27

- Backup: `C:\dev\backups\story-orchestrator\2026-09-27-adolion-clean\` (28 MB: worlds, characters, groups,
  chats, group chats, settings.json, `installed.json.bak`).
- Removed: 12 books (9 ledger + 3 orphans), 8 cards, 3 groups, 29 group chats, the `Adolion Storyteller`
  solo chat dir, 4 library records, 2 wizard sessions. One pre-existing `Ellie.png` was the author's
  untrimmed original; it was replaced with the campaign's adapted card (backed up).
- Installed: 16 books, **147 cards**, 9 groups (created), 9 stories (`adolion-adventurer` v17,
  `adolion-academy` v17, `adolion-aegis` v3, `adolion-deep`/`east`/`esha`/`night`/`war` v2, `adolion-saga` v3),
  each selected in its own group chat with requirements ready. All 16 books selected globally.
- Verified: adventurer `guild-hall` (entry set `Cast - The Party` + `CP guild-hall - Scene`), academy
  `nightriver-house` (`royal.jpg`, 9 members muted). `MANIFEST.md` updated with groups + stories.

### B (dev pieces), 2026-09-27

- Served build = **dev** (`dist/` bundle `c1da06a46118`); `npm run build` restores prod.
- Spike flags present, all off (flip per `lab/*/README.md`; dev-only).
- Judge: plugin 1.1.0 loaded; `judge.enabled = true`, **all 15 `judge.uses.*` on**, model `jev-1.13.0`;
  warden on; curator `auto`. Pre-flip values: judge disabled + all uses off, warden off.
- Role profiles: `extraction.profileId` and `extraction.profiles.authoring` = `Story Orchestrator Memory RunPod`.
- Offline gates: `check_all.sh` reached validate-stories (clean, 0 warnings) + check-scope (none out of
  scope), then its harness step fails on this shell (`mktemp` gives a POSIX `/tmp` path Windows Python
  cannot open). Run directly: harness **85/85**, `check_cast` 0 muted, `check_cards` 146/0, `check_lab`
  **9/9 OK**.

### C live gates owed

C1 (SP5/SP2), C2 (SP6 K2), C5 (SP9), C6 (SP7), C7 (SP6), C8 (SP8 W3), C9 (SP8 W4b), C10 (SP3 director) — the
lane legs in each `lab/*/README.md`, deferred with the pod.

## Unresolved questions

- C3/C4 change checkpoint-apply semantics for solo/partial groups (and for jumps) — accept the behaviour
  change, or hold for a design decision? C3/C4 are the two product-path findings still open.
- C11 (lore-select chunk count) is held until the live token measurement exists.
- Judge all-uses-on slows every turn (lore select alone is 5 calls); confirm intended for the dev build.
- The extraction/authoring profile was set to `Story Orchestrator Memory RunPod`; change it if a different
  backend is wanted for the dev install.
