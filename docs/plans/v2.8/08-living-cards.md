# Plan 08 — Living cards: a per-chat overlay on cast cards and the player persona

**Status (2026-10-03): v2.8 plan 08 (was v2.7 plan 32). Decided (all recommendations, see Decisions); not built;
S32-1 and S32-2 not run.** Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D; acceptance RP (S32-1, the overlay block on the main
model) and LI (look sprites, S32-2, after v2.8 06).

The user's words: "a persona or a character card can change along the story. Not only by some memories but visually
or idk. Should we have a copy of that card within the story and be able to change it from any story event? Like, if
they dye their hair, image and description should get updated? ... What's changed in a story should remain in that
story's memory, and if I create another chat, the card should be as default." Follow-up: "would be hard to manage
expressions too, don't they? we could handle them on demand in that case?"

## Problem

- A character's card text is fixed for every chat. If Arin dyes her hair red at checkpoint 3, the card still says
  "black hair" on every later request. Only memory (facts tier, ledger) records the change, at a lower priority than
  the card, so the model can drift back.
- Visuals don't follow either. Image prompts use the authored `appearances` or the card. Sprites pick a set by
  checkpoint, place or keyword, and a keyword set resets on the next move (`sprites/stage.ts:278-279`). Nothing makes a
  look change stick.
- The same applies to the player: a persona's description is install-wide, and nothing the story says changes it.
- The obvious fix, editing the card, is wrong. The card file is global (every chat, every story), and rollback and a new
  chat would both have to undo it.

## What exists (verified)

### SillyTavern host (`C:\dev\SillyTavern-MainBranch`; from the original draft, not re-checked 2026-10-03)

| What | Where | Per chat? |
|---|---|---|
| Card fields into the prompt: `getCharacterCardFieldsLazy` (description, personality, scenario, mesExamples, charDepthPrompt, creatorNotes, system, jailbreak) | `public/script.js:3402-3466` | read live from `characters[chid]` |
| **Scenario override** `chat_metadata.scenario \|\| character.scenario` | `script.js:3445`; group: replaces every member's scenario `group-chats.js:560-566` | **yes** (SP5 uses it: v2.7 02 C1, v2.8 16) |
| **Example messages override** `chat_metadata.mes_example` | `script.js:3451`; group `group-chats.js:561,567` | **yes** |
| System prompt override `chat_metadata.system_prompt` | `script.js:3415` (only with `prefer_character_prompt`) | yes |
| UI for the three overrides | `script.js:9002-9053` | |
| Description, personality, depth prompt (`data.extensions.depth_prompt`), creator notes | `script.js:3425,3432-3441` | **no per-chat override** |
| Group "join" mode concatenates each member's card description/personality | `group-chats.js:497-568` (`collectField`) | no override; reads the card |
| `/char-update` and friends write the card file | `slash-commands.js` (`/char-update avatar=…` example `:993`) | **global, never use** |
| Persona description | `power_user.persona_description`, resolver `script.js:3412`; per-persona, install-wide (v2.8 03 §SillyTavern host) | no; only a per-chat persona **lock** (`chat_metadata.persona`, `personas.js:1088`, re-applied on `CHAT_CHANGED` `:1543-1672`) |
| Message avatar: a non-user message uses `mes.force_avatar` if set, else the card avatar | `script.js:2621-2638` | **yes, per message** (stored in the chat file) |
| Group replies always store `force_avatar` = card thumbnail at save time | `script.js:6767-6773`, `group-chats.js:604-607`; `/sendas` `slash-commands.js:5795-5810` | per message |
| User messages lock the persona avatar via `force_avatar` | `script.js:5893-5895` | per message |
| Character list / group avatars | `characters[].avatar`, global | no |
| Sprites: `characters/<name>/` or one subfolder level `characters/<name>/<sub>` | `src/endpoints/sprites.js:19-37` | folders are global files |
| Sprite upload replaces any file with the same label | `src/endpoints/sprites.js:239-275` | |
| Label = file name cut at the first `-` or `.` | `sprites.js:136-138` (v2.8 07 §5 item 2) | |
| ST expressions' folder override (`expressionOverrides`, `/costume`) | `public/scripts/extensions/expressions/index.js:625-630` | install-wide setting |
| SD character prompt `extension_settings.sd.character_prompts[<card file>]` | `stable-diffusion/index.js:934-945`; empty in groups (`:935`) | install-wide |

So: ST has **no** per-chat description, personality or avatar for a card. It has per-chat scenario and example
messages, and a per-message avatar.

### Ours (`C:\dev\story-orchestrator`, refs re-checked on master `c7967323`)

| What | Where | Notes |
|---|---|---|
| Per-chat state: `chat_metadata.story_orchestrator` blob v6, extras | architecture.md §Invariants | a new chat has none: "card as default" for free |
| Blackboard qualities, typed, versioned, rollback ≡ replay | `engine/schema.ts:1`, `engine/blackboard.ts` | |
| Quality sources: only `code` and `extractor` (`schema.ts:2`); `applyDelta` refuses a delta whose `source` differs from the quality's (`blackboard.ts:58`, "source mismatch") | | the reason an authored write cannot simply target an extractor quality (F19) |
| `ledger_binding {entity, field}`: a bound field is written only through the blackboard and mirrored read-only into the ledger | `schema.ts:35-38,73`; `memory/ledger.ts` (`buildBoundKeySet`, extracted lines for a bound key dropped) | the model to copy for card fields |
| Boundary commit order | `engine/engine.ts:236-270` (`commitBoundary`): queue drain `:243` → `refreshMechanicalQualities` (incl. `EngineHost.derive`, `:447-460`) `:244` → `selectFiring` `:248` → `applyTransitionProgress` + checkpoint change `:251-261` → `after` serialize + snapshot `:265-268` | `derive` runs **before** the transition fires, so it cannot write on entry (F18) |
| Manual activation | `engine.ts:294` (`activateCheckpoint`) | the second entry path |
| `/cp set` | `runtime/runtimeManager.ts:320-330` (`setQuality`: an apply-queue entry, source `mechanical`, delta source = the quality's own) | manual writer |
| Checkpoint effects | `schema.ts:116-124` (`author_note, preset, world_info, cast_changes, npc_replies, background, reasoning`) | |
| Path-replayed effect over a ledgered host write | `runtime/spikes/sp5Scenario.ts` (`scenarioForPath`), `effectExtensions.ts` | moves to prod in v2.7 02 C1 |
| Roster member | `schema.ts:274-281` (`id, name, role, drive, view, aliases`) | no appearance field |
| Extraction scope | `extraction/scope.ts:22-84` (`deriveScopeExplained`; pull kinds `gate \| snapshot \| builtin`, `extraction/types.ts:13`), `deriveScope` `:86` | an extractor quality used by no gate or snapshot is **never read** (F20) |
| Present members | `runtime/roster.ts:13` (`enabledCharacterIds`) | |
| Injection registry, private per-member staging | `constants/injectionRegistry.ts`; `runtime/memoryInjector.ts` | |
| Image appearance: chapter > story `illustrations.appearances[member.id]` | `image/cast.ts:18-35` (`lookFor`, `castForImage`) | v2.7 02 C7: `Public appearance:` lore lines |
| Sprite sets: `{id, when: {places, checkpoints, keywords}}`, loaded from `<folder>/<set id>` | `sprites/profile.ts:79-110`, `stage.ts:196-215` | set id `^[a-z0-9_]+$` (`direction.ts`) |
| Set choice: `directed.set` (checkpoint `effects.stage`) > keyword > place/checkpoint > default | `stage.ts:276-282` | keyword resets on move (`:278`) |
| Label fallback chain | `sprites/profile.ts:51-63` (`resolveSprite`) | |
| Message-DOM touchers pinned | `runtime/architecture.test.ts:98-104` (image.ts, imageSurface.ts, inlineMount.ts, sprites/stage.ts; only inlineMount writes into `.mes_block`) | the avatar `<img>` sits outside `.mes_block` (`public/index.html:7394,7403`) |
| Message rewrite seam | `stHost/chatMessages.ts:18` (`rewriteReplyText`) | precedent for a per-message write |
| Inline chip categories | `runtime/settingsModel.ts:22` (`cast` exists) | |
| Chat-delete reaper with a popup | `runtime/mirrorReaper.ts`, `mirrorReaperHost.ts` | precedent for cleanup on delete |

### Related plans

- **v2.8 03 player persona**: owns `player` and therefore `player.card`. The persona is chosen at start and locked to
  the chat; the base ST persona is never edited. Every in-story change to the player goes through this overlay.
- **v2.8 16 / v2.7 02 C1** (SP5 scenario): the one card field ST already lets us override per chat.
- **v2.8 20 character life**: L2 mood is scene-scoped and decays. A look is lasting. Mood can choose an expression, a
  look chooses the set. Its relationship fields need the same scope rule as §Scope (review F20 is shared).
- **v2.8 05 self-contained images**: ComfyUI route B, model discovery, the broker (§F interfaces).
- **v2.8 06 sprite generation**: the in-plugin builder and its reference-edit recipe. On-demand look sprites need it.
- **v2.8 07 talking sprites**: the file-name label trap and the `anim-*` subfolder rule; a look set without frames
  animates with idle motion only.
- **v2.7 04 health center**: checks go in its registry (`src/runtime/checks.ts`).

## Proposal

### Data model: the overlay is a view, not a store

- **Authored:** `roster[].card` and `player.card` (v2.8 03's `player` block) declare the fields the story may change:

  ```json
  "roster": [{ "id": "arin", "name": "Arin",
    "card": { "fields": {
      "hair":      { "quality": "arin_hair", "visual": true },
      "outfit":    { "quality": "arin_outfit", "visual": true },
      "condition": { "quality": "arin_condition" }
    } } }]
  ```

- Each field is backed by an ordinary blackboard quality (`string` or `enum`, `source: extractor`). This copies
  `ledger_binding`: one store, the blackboard. Storage, versions, rollback ≡ replay and reopen ≡ replay come for free.
  Gates can read them ("hair == red").
- No copy of the card is stored. The card stays the base, and the overlay is the bound qualities that have a
  value. A field with no value means "as the card says".
- A new chat has no blackboard values, so it shows the card as default. Restart clears the values. Another story's chat
  never sees them.
- The normalized story gets an index `cardFieldByQuality[q] = {owner: memberId | "player", field, visual}`. Only the
  validator builds it; the blackboard reads it.

### Writers and provenance (reviews F18, F19)

Three writers, one store, an explicit permitted-writer list. The quality-source check is **not** weakened globally.

| Writer | When | Delta | Permitted because |
|---|---|---|---|
| **Entry** (authored `effects.card: { "arin": { "hair": "dyed red" } }`) | inside the boundary that **enters** the checkpoint | `{q, v, source: "extractor", writer: "card-entry"}` | `cardFieldByQuality[q]` exists and `effects.card` names it (validator) |
| **Extracted** (rubric "Arin's current hair color, only when the text says it changed", `evidence_from: world`, latching off) | the ordinary shared read, applied at a boundary | `{q, v, source: "extractor", writer: "extractor"}` | normal path |
| **Manual** (`/cp set arin_hair red`, the Blackboard tab) | through the apply queue (`setQuality`) | `{q, v, source: quality.source, writer: "manual"}` | normal path |

- **The entry write is transactional with the transition, not a `derive`.** `commitBoundary` gains one step after
  `applyTransitionProgress` and the checkpoint change (`engine.ts:251-261`), before `after` is serialized and the
  snapshot recorded (`:265-268`): `applyEntryWrites(checkpoint)` writes the destination checkpoint's `effects.card`
  values. They are therefore part of the committed boundary: the boundary log's `after`, the snapshot rollback restores,
  and the persisted blob. `activateCheckpoint` (`:294`) runs the same step, and so does loading a story into its start
  checkpoint (boundary 0). It is pure engine code; no host effect runs.
- **Source check.** `BlackboardDelta` gains `writer?: "card-entry" | "extractor" | "manual"`. `applyDelta` keeps the
  `source` comparison for every delta. The entry writer carries the quality's own source (`extractor`), so it passes
  that check, and is accepted only when `writer === "card-entry"` and `cardFieldByQuality[delta.q]` exists. A
  `card-entry` delta on any other quality is refused ("writer not permitted"). Code-sourced qualities and the existing
  writers are untouched.
- **Provenance.** The blackboard records `writerOf[q] = {writer, boundary}` beside `versions`, serialized with the
  snapshot, so rollback restores it. The author chip (L3) and the precedence tests read it.
- **Precedence: the newest write wins.** Inside one boundary, the queue drain (`:243`, extracted and manual writes)
  runs before the entry step, so on the entering boundary the authored entry value wins over an extraction read from
  that same reply. Any later boundary's extraction or manual write wins over it. One store, so there is no other merge
  rule.
- **Never:** `/char-*`, `/persona-update`, `writeExtensionField`, card-file saves or SD `character_prompts`.

### Scope: card fields are read even when no gate uses them (review F20)

`deriveScopeExplained` only pulls keys from gates, snapshots and built-ins, so a card field that no transition or
snapshot names would never be read. It gains an explicit, bounded source:

- New pull kind `card`. Input `cardSources: Array<{key, owner}>`, passed by the runtime (the scope function stays pure):
  the card-field qualities of **members enabled in the current group** (`enabledCharacterIds`) plus `player.card`.
  Members not present are not read.
- **Bound:** at most `CARD_SCOPE_CAP` = 12 card keys per read (predeclared). **Starvation-free split (Sol r3 R3-04):**
  the first `CARD_SCOPE_PRIORITY` = 8 slots go by priority (the speaker of the newest reply, members named in the read
  window, then roster order); the last 4 slots rotate round-robin over the keys the priority slots left out, from a
  per-chat cursor (`extras.extraction.cardScopeCursor`, advanced by 4 on every read that overflowed; not
  message-scoped, since it chooses what is read, never what is stored). So with O overflow keys, every present key is
  read at least once every ⌈O / 4⌉ overflowing reads, whatever the priority order does. The Studio warns
  `card-scope-over-cap` when one checkpoint can have more than 12 card fields present.
- **Test (jest, pure):** one member with 13 non-latching card fields, the same speaker and the same read window on every
  read (priority unchanged): field 13 is in scope within ⌈5 / 4⌉ = 2 reads, and over 10 reads every field is read at
  least once per 2 reads; a control with the rotation slots removed never reads field 13 (the guard proves it can fail).
  Also: 30 fields over 3 members → every field within ⌈18 / 4⌉ = 5 reads.
- Latched keys stay out as today (card fields are not latching).

### Readers

| Reader | What it does |
|---|---|
| **Prompt** | A new `INJECTION_REGISTRY.cardOverlay` block, "Current state (overrides the character card where they differ):", one line per member with a set field. **Behind the install-wide `cardOverlay` switch, default off until S32-1 passes** (review D16); depth from S32-1. Shared, since a look is public. A private field goes through epistemic, not this. The player's fields go in the same block under `{{user}}`. |
| **Scenario / examples** (optional) | Only where ST has a per-chat override (SP5). Not for description: ST has none. |
| **Ledger mirror** | Bound fields appear read-only in `getLedger()` like other bound rows. |
| **Image prompts** | `castForImage` composes `appearance = authored look + overlay visual fields`. The overlay wins over the card, the lore `Appearance:` and the authored story look. Not behind the switch. |
| **Sprites** | A new set rule `when: { card: { hair: ["red", "dyed red"] } }`. It is persistent: checked before place and keyword, after `directed.set`. It never resets on a move. Not behind the switch. |
| **Player copy** | An inline chip in the existing `cast` category: "Arin: hair now red" (L1, player copy). Only applied values. An authored future change is never listed. Author view (L3+) shows the writer (entry / extraction / manual) from `writerOf`. |
| **Health (v2.7 04)** | Registry checks: an overlay field bound to a missing quality; a visual field with no sprite set and no on-demand backend (info); `cardOverlay` off while a story declares card fields (author info). |

### Avatars (evaluated; not in this plan)

- **Per-message `force_avatar`:** possible. ST honours it in group chats (`script.js:2621-2638`) and stores it per
  chat. But we would have to rewrite every new reply of that member (`MESSAGE_RECEIVED`, like `rewriteReplyText`), and
  ST overwrites it on group saves (`script.js:6767-6773`). Swipes and regenerates rebuild it: not determined how. It
  also needs an image file per look, and a hosted image URL.
- **DOM swap of `.avatar img`:** outside `.mes_block`. It would be a new message-DOM toucher, so the
  `architecture.test.ts:98-104` pin changes. It is lost on every re-render.
- **List/group avatars:** global, so never.
- **Player:** ST's per-chat persona lock (v2.8 03) gives a per-chat avatar.
- **Decision 11:** none here. The sprite stage and illustrations carry the look. Per-chat avatars are deferred to v2.9
  (`v2.9/05-deferred-items.md` §05.5, user 2026-10-03), revisited after on-demand sets exist, since they produce the
  image an avatar would need.

### Expressions and sprites for a changed look

The problem: every look multiplies the sprite sets. Each expression times each look. Denominators: ST's standard
expression set is about 28 labels; the Adolion sets carry about 14.4 expression PNGs each (2,889 over 201 sets, dated
inventory in v2.8 05 §F). Pre-rendering every possible extracted look is impossible, and pre-rendering every authored
one is expensive.

**Two routes:**

1. **Pre-rendered, for authored looks.** The story declares a set per authored look (`when: {card: …}`). The campaign
   renders it at build time (`render_sprites.py` now; v2.8 06's builder later). No runtime GPU. Works as soon as the
   set rule ships.
2. **On demand, for unplanned or extracted looks.** Needs **v2.8 06** (sprite generation) over v2.8 05's route B. When a
   visual field changes and no set matches:
   - **Key:** `look_<hash8>` = hash(story id, member id, normalized visual field values, **base sprite version** (the
     content hash of the reference sprite set's manifest, or of the reference PNG when there is no manifest), **edit
     model name and content hash** and **recipe id and version**, exactly v2.8 06 §3's cache-key contract (Sol r3
     R3-07: this plan consumes 06's key, it does not define its own). A new base sprite, model weights or recipe therefore
     makes a new key instead of reusing a stale render, including weights replaced under the same file name. Test
     (jest): same model file name, changed model content hash → a new `look_<hash8>`, the old set not reused.
     The set id stays valid (`^[a-z0-9_]+$`, no `-`), so a set rule
     never picks up v2.8 07's `anim-*` folders. Another chat of the same story with the same look and inputs reuses it
     (decision 6).
   - **Order:** render the current expression first (or `neutral` when unknown), then each other expression **the first
     time it is actually needed**. Never the full set up front.
   - **How:** v2.8 06's reference-edit recipe of the member's existing default sprite for that expression: "same
     character, same pose, now red hair". Route A (ST Image Generation) cannot do reference edits for most sources, so
     with route A only, on demand is off.
   - **Never blocks the reply.** The stage keeps the old set (or the author's `fallback` set for that look) until a
     frame lands, then swaps that expression. A missing expression falls back through the profile's fallback chain
     (`profile.ts:51-63`) inside the new set before it falls back to the old set.
   - **GPU contention, qualified.** One queue, one job at a time, behind v2.8 05's broker when installed (fail-open).
     - **Main reply on RunPod** (the default play setup): the reply never waits on an edit; they are different GPUs.
     - **Local text model on the same GPU** (LT and LI share it through the broker): the broker queues text while an
       edit holds the lease, so a reply can wait for **at most the one edit in progress**. The queue starts a new edit
       only when the broker reports no text request waiting or running, and a waiting text request is never queued
       behind more than one edit. The wait is measured in S32-2.
     - Each job is cancelled if the look changes again first.
   - **Storage:** `characters/<sprite folder>/look_<hash8>/<label>.png` through `/api/sprites/upload`
     (`sprites.js:19-37` allows one subfolder level). The card's default and authored sets are untouched. Names are
     plain `<label>.png`, because ST cuts the label at the first `-`/`.` (`sprites.js:136-138`). ST's own expressions
     never see the subfolder unless the user sets a costume.
   - **Ownership ledger:** v2.8 06's `spriteLedger` (§1), written only by 06's `stHost/spriteFiles.ts`; this plan adds
     no ledger of its own (Sol r3 R3-07). A look row carries `story`, `chats[]`, the set and the full key inputs. Like
     the wizard ledger, nothing unlisted is ever deleted.
   - **Cleanup:** on chat delete, drop the chat from the `spriteLedger` rows' `chats[]`. A set no chat references is
     deleted through 06's `spriteFiles.ts` (per label via `/api/sprites/delete`). It asks first, like the mirror reaper. Also a manual "Remove generated sprites for this
     story" in the author view. Not determined: whether ST removes an empty subfolder (no endpoint seen); an empty
     folder is harmless.
   - **Rollback:** a rolled-back look switches the stage back, because the set choice reads the blackboard. The files
     stay cached. The same look later reuses them.
   - **Spoilers:** the queue only renders looks the chat has reached. Pre-rendered authored sets exist on disk, but the
     player only sees them when the overlay selects them.
   - **Settings:** off by default (`sprites.onDemand`). Needs sprites on, route B and an edit-capable model (probed).
     Otherwise a v2.7 04 registry info row: "Arin's new look has no sprites; showing the default set."

## What it must never do

- Write the card file, persona settings, `expressionOverrides` or SD `character_prompts` (all install-wide).
- Leak across chats: overlay values live only in this chat's blackboard. Generated sprite files are shared per
  story+look by design (decision 6), but which set is shown is decided per chat.
- Break rollback ≡ replay: one store (the blackboard), entry writes inside the committed boundary.
- Let any writer other than the three above touch a card field, or let `card-entry` touch any other quality.
- Show a future authored change to the player (chips list applied values only).
- Block a reply on image work beyond the one in-progress edit on a shared local GPU (above).
- Delete a sprite file it did not record.
- Add a message-DOM toucher without updating the architecture pin (avatars deferred).

## Options

| | Option | Cost | Problem |
|---|---|---|---|
| A | Overlay = bound blackboard qualities + one injected block + visual readers | S-M; reuses blackboard, ledger mirror; adds an entry step and a writer list | the card text still says "black hair"; the block must win (S32-1) |
| B | A per-chat card copy in extras, edited by effects | M | a second store with its own rollback; duplicates the blackboard |
| C | Rewrite the card file per chat on `CHAT_CHANGED` and restore on leave | M | global file; a crash leaves the edit in every chat; races ST saves. **Rejected.** |
| D | A + replace whole fields through ST overrides where they exist (scenario, examples) | A + small | only two fields are overridable; description is not |
| E | Sprites: pre-rendered only | build-time cost | extracted looks get no visuals |
| F | Sprites: on demand (+ pre-rendered for authored) | M-L, after v2.8 06 | GPU, storage, cleanup |

**Recommendation (decided): A (with D only for stories already using SP5), avatars deferred; sprites E now, F after
v2.8 06.** The overlay ships as D-tier code (pure engine + injection) with the prompt block behind `cardOverlay`
(default off). The block turns on by default only after S32-1 passes its floor twice (v2.8 rule 9's pattern).

## Measurement

- **S32-1 (RP), does the model honour the overlay over the card?** Predeclared before the run:
  - Fixture: a synthetic group story, 3 members, each with one visual change mid-scene (card says X, overlay says Y).
    10 replies after each change, mentions prompted. N = 30 replies per arm. On the RunPod main model (`Artemis RunPod
    RP`), **inside this plan, ×2, before the default/depth decision and before the v2.8 freeze** (Sol r3 R3-10: it
    selects the depth and the default, so running it on the frozen candidate could change that candidate). The final
    suite only regresses the selected depth and default.
  - Arms: overlay block at depth 1 / depth 4 / no block (memory fact only, today's baseline).
  - Score: a reply that describes the changed attribute contradicts Y (says X) = fail. A second model labels each
    reply (rule 11), and replies that never mention it are excluded and counted.
  - **Floor: ≥ 90 % of mentioning replies agree with Y, and at least 15 mentioning replies per arm.** The baseline arm
    must be worse, or the block is not needed.
  - Pass twice: `cardOverlay` defaults on at the winning depth. Below the floor at every depth: the switch stays off,
    the overlay serves visuals only, and the result is recorded.
- **S32-2 (LI), on-demand sprite identity** (after v2.8 06): 5 looks × neutral + 3 expressions on the local ComfyUI
  (tray entry, models off `C:`). Rater: "same character?" ≥ 90 % and the changed attribute visible ≥ 90 %. Time to the
  first frame recorded (no floor; never blocking), and the longest text wait behind an edit with a local text model on
  the same GPU.

## Decisions for the user

1. Overlay as bound blackboard qualities (A), not a card copy (B)? **Recommended: A.** 
2. Writers: authored effect + extraction + author hand edit? **Recommended: all three, newest wins.** 
3. Which fields: visual + condition/status lines only, or also free-text description/personality deltas?
   **Recommended: typed short fields only in this plan.** Free-text deltas fight the card prose and are hard to roll
   back cleanly in the prompt.
4. Player persona included (overlay under `{{user}}`, via v2.8 03's `player.card`)? **Recommended: yes**, same block.
5. Player copy: an inline `cast` chip on each applied change? **Recommended: yes, L1; source at L3.**
6. On-demand sprite cache scope: per story+look (shared across that story's chats) or per chat?
   **Recommended: per story+look**: a second playthrough reuses it, and cleanup counts referencing chats.
7. On-demand rendering at all now, or only after the sprite builder ships? **Recommended: after v2.8 06, off by
   default.** Pre-rendered authored looks (route 1) work as soon as the set rule ships.
8. Order on demand: current expression first, the rest when first needed? **Recommended: yes.** Option: also
   pre-warm the 3 most frequent labels of that member in this chat.
9. While rendering or with no backend: old set, author-chosen fallback set, or default? **Recommended: author's
   `fallback` if set, else keep the old set** (closer to the new look than the card default).
10. Cleanup on chat delete: ask (like the mirror reaper) or silent? **Recommended: ask, and keep sets another chat
    still references.**
11. Per-chat avatars via `force_avatar`? **Recommended: not in this plan**; revisit with on-demand images. **Decided
    2026-10-03: deferred to v2.9**, `v2.9/05-deferred-items.md` §05.5.
 Lets do as you recommend on those options

## Gates

- **D (deterministic):** `npm run gates`.
  - Validator: `card.fields` must name a declared quality of type `string`/`enum` with `source: extractor`;
    `effects.card` member and field ids must exist; `cardFieldByQuality` built.
  - Blackboard: a `card-entry` delta on a card field is accepted; on any other quality it is refused; a `code` delta on
    an extractor quality is still refused ("source mismatch" unchanged).
  - Engine, entry step: the entering boundary's `after` and snapshot hold the entry value; `activateCheckpoint` and the
    start checkpoint write it too; `derive` is untouched.
  - **Precedence and rollback:** authored entry → later extracted → later manual, each wins in turn and `writerOf`
    names it; a same-boundary extraction loses to the entry write; rolling back past each step restores the previous
    value and writer; `rollback ≡ replay` and reopen ≡ replay over card fields (`runtime/chance.test.ts`-style cases).
  - **Scope:** a card field used by no transition and no snapshot is in scope (pull kind `card`) when its member is
    enabled, absent when not; `player.card` always; the cap of 12 and its ordering.
  - New chat = empty overlay. Another story's chat = empty.
  - `cardOverlay` off: no block in the payload; on: the block at the configured depth. The injection registry problems
    check covers the key; `cardOverlay` is never scannable.
  - Sprites: card set rule precedence, no reset on a move. Image: `castForImage` overlay wins.
  - On-demand key: changing the base sprite version, the edit model or the recipe version changes the key; same
    inputs reuse it. Pure queue/cleanup with a fake host; the ownership ledger never deletes an unlisted file; the
    queue never starts a second edit while a text request waits (fake broker).
  - Spoiler property: chips never list unapplied authored values.
  - Guard: a grep test that nothing under `src/` calls `/char-` or `/persona-update`.
  - Registered in the v2.7 01 feature registry + Help (registry test), including the `cardOverlay` switch.
- **D, live without a model** (a lane, group chat, scripted messages): a story whose transition fires on a scripted
  reply into a checkpoint with `effects.card`, `cardOverlay` on.
  - **First destination reply:** the dry-run payload of the next generation (the first reply in the destination
    checkpoint) carries the block with the new value; the next-turn preview agrees.
  - **Later extraction:** a seeded extraction response (`storyOrchestratorDebugExtractionResponse`) for the card field
    at a later boundary replaces the value; `writerOf` = extractor; the field is read although no gate names it.
  - **Swipe / delete (deterministic rollback):** delete the scripted reply that fired the transition (or swipe to a
    seeded alternate swipe); the overlay value and writer return to the previous ones, the stage set switches back.
  - **Reopen:** close and reopen the chat; the value, writer and stage set hold.
  - A new chat shows the card default. Card file bytes unchanged (sha256 before/after).
  - Solo control: a solo chat of the member shows nothing and writes nothing (v2.7 03).
- **RP (decision measurement):** S32-1 on the RunPod main model, ×2 inside this plan, before the default/depth
  decision and the freeze. Not green until it runs.
- **RP (regression, final suite):** the overlay block at the depth and default S32-1 selected, in real replies (the
  card-vs-overlay agreement re-checked at that one setting, not the arm comparison).
- **LI (acceptance, after v2.8 06):** S32-2 on the local ComfyUI, lane started with `--media on --allow-comfy`. Never
  `/sd` on a shared lane.
- **Player-visible surface** (v2.8 rule 4): the `cast` chip is the user's 2026-10-03 decision (decision 5); the prompt
  block stays off until S32-1.

## Links

- v2.8 03 (`player`, `player.card`, persona lock), v2.8 05 (route B, broker, inventory), v2.8 06 (sprite builder),
  v2.8 07 (frames, `anim-*`), v2.8 16 and v2.7 02 C1 (SP5), v2.8 20 (character life, shared scope rule), v2.7 04
  (registry), v2.7 02 C7/C8 (image lore lines), v2.7 03 (group-only), v2.7 01 (registry, Help).
- `src/engine/schema.ts`, `src/engine/engine.ts`, `src/engine/blackboard.ts`, `src/extraction/scope.ts`,
  `src/memory/ledger.ts`, `src/constants/injectionRegistry.ts`, `src/image/cast.ts`, `src/sprites/profile.ts`,
  `src/sprites/stage.ts`, `src/runtime/architecture.test.ts`
- ST: `public/script.js:2621-2638,3402-3466,6767-6773,9002-9053`, `public/scripts/group-chats.js:497-568`,
  `src/endpoints/sprites.js:19-37,136-138,239-275`

## Unresolved

- How swipes and regenerates rebuild `force_avatar` in a group: not determined (only matters if v2.9 05 §05.5 reopens
  avatars).
- Whether ST deletes an empty sprite subfolder: not determined.
- Which edit model the user's ComfyUI has for on-demand edits: probed at runtime (v2.8 05), not assumed.
- `CARD_SCOPE_CAP` = 12 is a predeclared guess with no measurement behind it; v2.8 20's relationship fields may share
  the same cap or need their own.

## Review of the answers (2026-10-03)

All recommendations accepted. v2.8 03 now routes the player's in-story changes through this overlay (`player.card`):
the user's ST persona stays the base and is never edited, and it is locked per chat. No solo branches (v2.7 03).

## Review 2026-10-03

Applied from `v2.7/review-2026-10-03.md`:
- **F01**: title, status line and gate tiers.
- **F18**: entry writes moved out of `derive` into a transactional entry step inside `commitBoundary` (after the
  transition, before the snapshot); gates for the first destination reply, later extraction, swipe/delete and reopen.
- **F19**: explicit permitted-writer list (`writer` on the delta, `card-entry` accepted only for card-field qualities)
  with `writerOf` provenance; the source check stays global; gates for entry → extracted → manual precedence and
  rollback.
- **F20**: new bounded scope source (pull kind `card`, present members + player, cap 12); gate for a field used by no
  transition or snapshot.
- **D16**: default-off `cardOverlay` switch until S32-1 passes twice; deterministic rollback via delete or a seeded swipe.
- **Sol open questions**: the look cache key includes base sprite version, edit model and recipe version; "the reply's
  LLM never waits" qualified (RunPod: never; shared local GPU: at most one in-progress edit).
- **"32 refs"**: re-checked and fixed (`stage.ts:278-279/276-282`, `profile.ts:79-110/51-63`, `engine.ts:236-270,
  447-460, 294`, `blackboard.ts:58`, `scope.ts:22-86`, `runtimeManager.ts:320-330`); the old line refs into other plan
  files replaced by section names.
- **F31**: on-demand look sprites depend on v2.8 06.
- **D12**: `player.card` is owned by v2.8 03; persona locked per chat; base persona never edited.
- **B10**: registry + Help gate row.

Not re-checked: ST host line refs (from the original draft), `memory/ledger.ts` and `memoryInjector.ts` line refs (now
cited without lines).

Round 3 (Sol): R3-04, R3-07, R3-10 applied.
