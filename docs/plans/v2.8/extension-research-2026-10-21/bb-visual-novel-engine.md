# BB Visual Novel Engine — 2026-10-21 harvest

meta: https://github.com/maxkara14/BB-Visual-Novel-Engine · `pre-refresh-2026-10-21` (`b2ad005`) .. HEAD `326f4ad`, 4 commits, 24 files,
+1.7k/-0.2k · **no licence** → ideas only · read: full diff of CHANGELOG (EN), README.en, `modules/{constants,social,
recalculation-queue,relationship-status-ui,image-storage,snapshot,utils}.js`, test titles · skimmed: `hud.js`, `settings.js`
(perf + lazy editor wiring) · prior: `docs/plans/v2.8/extension-research-2026-10-14/bb-visual-novel-engine.md`, triage rows
H11a/H11b/R31/R32/R33/R69 in `61-harvest-triage-2026-10-14.md`.

## What it is / what changed
Same tracker (see prior). New since b2ad005, version unchanged (3.2.2):
- Prompt: first-time tracking of a named character on direct interaction with `none` impacts, separate from the "new beat only"
  rule; kinship/established ties fix `user_label` regardless of score (`modules/constants.js:107-111`, `:126`).
- Missing/rejected label shows "Status not set" + a Set status action instead of falling back to a score-tier word ("Stranger");
  player can type a manual label (≤160 chars, "scores will not change"), manual wins over model, "Automatic" clears it
  (`modules/relationship-status-ui.js:1-54`, `modules/social.js` `createRelationshipStatusSession`, `getCombinedSocial` status line).
- Avatars moved out of `chat_metadata` into `/api/images/upload` files, with byte-for-byte read-back and an explicit backed-up
  migration (`modules/image-storage.js`).
- Perf: 16 ms coalescing of received/rendered/ended recalcs, flushed before any prompt read (`modules/recalculation-queue.js`);
  per-operation memo caches released in `finally` (`social.js` `withScopeOwnershipCache`).
Nothing on reply post-processing, voice or prose.

## How it works
- Label session = stale-guarded editor: captures chat array identity, persona ref, chat/char/group ids, scope state object, char
  identity id **and the initial label value**; `save` refuses unless all still match (`social.js` `createRelationshipStatusSession`).
  Same shape as their event editor (prior P3).
- Status precedence in the injected block: `profile.relationshipStatus || stats.status || 'Not established'` — the old fallback
  was the affinity tier label (`social.js` `buildCombinedSocial`, diff hunk at old `:2220`).
- Image store: deterministic expected path `/user/images/<folder>/<id>.<fmt>`; reject any other returned path; GET it back
  `cache:'no-store'` and compare bytes; `assertCurrent()` (chat/meta/chat-length/persona identity) before and after the await;
  migration collects all inline slots, uploads all, re-collects and refuses unless every slot is unchanged, then swaps all
  references at once (`image-storage.js:58-104`).
- Recalc queue: pending task keyed by scene tuple (chat array, metadata object, chat id, char id, group id, persona); a scene
  change cancels; `flush()` before generation so a prompt never reads stale stats (`recalculation-queue.js:3-34`).

## Patterns for SO

Player-experience lens: little new here. The two label changes confirm choices plan 51 already made; the rest is hygiene.

### P1. Honest empty label, never a score-tier fallback — pattern · People pages · present · value — · effort —
Theirs: dropped "Stranger"-from-score fallback for "Status not set" (CHANGELOG 2026-10-16). Ours already does this: no row holds →
no label row (`src/runtime/labelView.ts:15-26`); labels are authored, not banded (`src/engine/life/labels.ts:42`). Kinship-
independent-of-score = an ungated `public` row (`row.when` optional, `labels.ts:107`). Nothing to take; note as confirming 51.

### P2. Player-set "what am I to them" label — feature · player/People · absent · value 2 · effort M · SKIP-leaning
Theirs: player types the label, model output demoted to a suggestion, scores untouched (`relationship-status-ui.js:27-50`).
For SO this would be the player writing story state an author owns (51: labels authored, `follows_feeling`/`hold`), and it
reaches their prompt block. If ever wanted, only as a **private player note** on a People page that never reaches any prompt
(no shared tier, no member block) — a journal convenience, not a label. No session asked; triage would put it with R31 (SKIP).

### P3. Read-back verify on image upload — pattern · image host · partial · value 2 · effort S
Theirs: reject an unexpected returned path, then re-fetch and byte-compare before persisting the reference
(`image-storage.js:72-81`). Ours: `imageSave` trusts `saved.path` as returned (`src/services/stHost/image.ts:79-85`). The player
symptom it prevents is a broken image in a scene after a half-written upload; low on loopback. Cheap form: assert the returned
path equals `user/images/<folder>/<name>.<format>` (sanitize-aware) and HEAD it; return `WriteResult` per `stHost/typedResults`
rule (today `imageSave` throws/returns string — check whether `typedResults.test.ts` exempts it). Fold into 69 hardening if done.

### P4. Coalesce burst events, flush before prompt read — pattern · runtime · present (different shape) · value 1
Theirs: `recalculation-queue.js`. Ours: boundaries commit only at rendered reply via TurnBridge with dedupe, and a store write
refreshes its own injection (architecture.md "If a write changes injected state…"). Their "flush before prompt read" = our
write-refreshes-injection rule. Nothing to take.

## For per-character polish
Nothing relevant: no reply rewriting, voice, lexicon or style config, before or after this refresh. Closest is the per-character
profile `description` (free text used for portraits/profile prompts, not reply style). Their only post-processing of a reply is
stripping their own hidden `<bb-social-updates>` block (`social.js` `stripHiddenSocialDataFromText`). The one transferable
safety idea for a polish pass is their stale-guard shape: capture message identity + swipe id + text before an async rewrite
and refuse to write if any moved (prior P4/`generator.js:189-212`), which SO already does with RunOwnership + revision keys.

## Host facts
- `/api/images/upload` (`SillyTavern-MainBranch/src/endpoints/images.js:39-73`): `filename` gets `removeFileExtension` then
  `.<format>` appended, both `sanitize`d; `fs.promises.writeFile` **overwrites silently** an existing file of that name; no
  size limit beyond the body parser. SO's `cast_${key}` name (`src/image/castSceneHost.ts:91`) is content-keyed, so overwrite
  is idempotent; `director_${Date.now()}_${seed}` (`src/image/runtime.ts:323`) unique. No bug.
- Returned `path` is `clientRelativePath(root, file)` → `user/images/<folder>/<file>` without leading slash; BB accepts both
  forms (`image-storage.js:76`).

## Not worth taking
- First-time tracking via the play reply's hidden block: in-band, costs reply budget; our roster is authored and
  `knownEntities` already pages an enabled member without an entry (architecture.md Disclosure).
- Per-operation memo caches / lazy editors: their perf problems (full-chat recompute each event), not ours.
- Embedded-image snapshot export (100 MiB JSON): plan 45 carry is a public projection, no images.
- Russian regex word-boundary fix in `utils.js`: language-bound.
