# Plan 32 — Living cards: a per-chat overlay on cast cards and the player persona

**Status: DRAFT 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

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
  checkpoint, place or keyword, and a keyword set resets on the next move (`stage.ts:279`). Nothing makes a look change
  stick.
- The same applies to the player: a persona's description is install-wide, and nothing the story says changes it.
- The obvious fix, editing the card, is wrong. The card file is global (every chat, every story), and rollback and a new
  chat would both have to undo it.

## What exists (verified)

### SillyTavern host (`C:\dev\SillyTavern-MainBranch`)

| What | Where | Per chat? |
|---|---|---|
| Card fields into the prompt: `getCharacterCardFieldsLazy` (description, personality, scenario, mesExamples, charDepthPrompt, creatorNotes, system, jailbreak) | `public/script.js:3402-3466` | read live from `characters[chid]` |
| **Scenario override** `chat_metadata.scenario \|\| character.scenario` | `script.js:3445`; group: replaces every member's scenario `group-chats.js:560-566` | **yes** (our SP5 uses it, plan 16a) |
| **Example messages override** `chat_metadata.mes_example` | `script.js:3451`; group `group-chats.js:561,567` | **yes** |
| System prompt override `chat_metadata.system_prompt` | `script.js:3415` (only with `prefer_character_prompt`) | yes |
| UI for the three overrides | `script.js:9002-9053` | |
| Description, personality, depth prompt (`data.extensions.depth_prompt`), creator notes | `script.js:3425,3432-3441` | **no per-chat override** |
| Group "join" mode concatenates each member's card description/personality | `group-chats.js:497-568` (`collectField`) | no override; reads the card |
| `/char-update` and friends write the card file | `slash-commands.js` (`/char-update avatar=…` example `:993`) | **global, never use** |
| Persona description | `power_user.persona_description`, resolver `script.js:3412`; per-persona, install-wide (plan 30 §SillyTavern host) | no; only a per-chat persona **lock** (`chat_metadata.persona`, `personas.js:1088`, re-applied on `CHAT_CHANGED` `:1543-1672`) |
| Message avatar: a non-user message uses `mes.force_avatar` if set, else the card avatar | `script.js:2621-2638` | **yes, per message** (stored in the chat file) |
| Group replies always store `force_avatar` = card thumbnail at save time | `script.js:6767-6773`, `group-chats.js:604-607`; `/sendas` `slash-commands.js:5795-5810` | per message |
| User messages lock the persona avatar via `force_avatar` | `script.js:5893-5895` | per message |
| Character list / group avatars | `characters[].avatar`, global | no |
| Sprites: `characters/<name>/` or one subfolder level `characters/<name>/<sub>` | `src/endpoints/sprites.js:19-37` | folders are global files |
| Sprite upload replaces any file with the same label | `src/endpoints/sprites.js:239-275` | |
| Label = file name cut at the first `-` or `.` | `sprites.js:136-138` (plan 28 §5 item 2) | |
| ST expressions' folder override (`expressionOverrides`, `/costume`) | `public/scripts/extensions/expressions/index.js:625-630` | install-wide setting |
| SD character prompt `extension_settings.sd.character_prompts[<card file>]` | `stable-diffusion/index.js:934-945`; empty in groups (`:935`) | install-wide |

So: ST has **no** per-chat description, personality or avatar for a card. It has per-chat scenario and example
messages, and a per-message avatar.

### Ours (`C:\dev\story-orchestrator`)

| What | Where | Notes |
|---|---|---|
| Per-chat state: `chat_metadata.story_orchestrator` blob v6, extras | architecture.md §Invariants | a new chat has none: "card as default" for free |
| Blackboard qualities, typed (`string`, `enum`, …), versioned, rollback ≡ replay | `engine/schema.ts:1`, `engine/blackboard.ts:11-16` | |
| `ledger_binding {entity, field}`: a bound field is written only through the blackboard and mirrored read-only into the ledger | `schema.ts:35-38,73`; `memory/ledger.ts:27-42` (extracted lines for a bound key dropped) | the model to copy for card fields |
| Code-derived qualities each boundary (`EngineHost.derive`) | `engine/engine.ts:445-459` | the chance seam uses it; no checkpoint "set quality" effect exists (`state_snapshot` is a generation target, not a write: `docs/authoring/story-guide.md:131`) |
| Checkpoint effects | `schema.ts:116-124` (`author_note, preset, world_info, cast_changes, npc_replies, background, reasoning`) | |
| Path-replayed effect over a ledgered host write | `runtime/spikes/sp5Scenario.ts:17-25` (`scenarioForPath`), `effectExtensions.ts:26-44` | 16a moves it to prod |
| Roster member | `schema.ts:274-281` (`id, name, role, drive, view, aliases`) | no appearance field |
| Injection registry, private per-member staging | `constants/injectionRegistry.ts`; `runtime/memoryInjector.ts:49-55` | |
| Image appearance: chapter > story `illustrations.appearances[member.id]` | `image/cast.ts:18-35` (`lookFor`, `castForImage`) | plan 02 C7: `Public appearance:` lore lines |
| Sprite sets: `{id, when: {places, checkpoints, keywords}}`, loaded from `<folder>/<set id>` | `sprites/profile.ts:72-110`, `stage.ts:196-215` | set id `^[a-z0-9_]+$` (`direction.ts`) |
| Set choice: `directed.set` (checkpoint `effects.stage`) > keyword > place/checkpoint > default | `stage.ts:270-284` | keyword resets on move |
| Message-DOM touchers pinned | `runtime/architecture.test.ts:98-104` (image.ts, imageSurface.ts, inlineMount.ts, sprites/stage.ts; only inlineMount writes into `.mes_block`) | the avatar `<img>` sits outside `.mes_block` (`public/index.html:7394,7403`) |
| Message rewrite seam | `stHost/chatMessages.ts:18` (`rewriteReplyText`) | precedent for a per-message write |
| Inline chip categories | `runtime/settingsModel.ts:22` (`cast` exists) | |
| Chat-delete reaper with a popup | `runtime/mirrorReaper.ts`, `mirrorReaperHost.ts` | precedent for cleanup on delete |

### Related plans

- **16a** (SP5 scenario): the one card field ST already lets us override per chat.
- **18** character life: L2 mood is scene-scoped and decays (`18-character-life.md:50-55`). A look is lasting. Mood
  can choose an expression, a look chooses the set.
- **26 / 26b** images and sprite builder: ComfyUI route B, `/api/sprites/upload`, an image-edit recipe
  (`26-self-contained-images.md:165-198`).
- **28** sprite frames: the file-name label trap and the subfolder rule (`28-talkinghead-review.md:136-145`).
- **30** player persona: no per-chat persona description in ST; a story-side block (`INJECTION_REGISTRY.playerRole`).
- **31** health center: checks go in its registry.

## Proposal

### Data model: the overlay is a view, not a store

- **Authored:** `roster[].card` and `player.card` (plan 30's `player` block) declare the fields the story may change:

  ```json
  "roster": [{ "id": "arin", "name": "Arin",
    "card": { "fields": {
      "hair":      { "quality": "arin_hair", "visual": true },
      "outfit":    { "quality": "arin_outfit", "visual": true },
      "condition": { "quality": "arin_condition" }
    } } }]
  ```

- Each field is backed by an ordinary blackboard quality (`string` or `enum`). This copies `ledger_binding`: one
  writer, the blackboard. Storage, versions, rollback ≡ replay and reopen ≡ replay come for free. Gates can read
  them ("hair == red").
- No copy of the card is stored. The card stays the base, and the overlay is the bound qualities that have a
  value. A field with no value means "as the card says".
- A new chat has no blackboard values, so it shows the card as default. Restart clears the values. Another story's chat
  never sees them.

### Writers

1. **Authored, at checkpoint entry:** `effects.card: { "arin": { "hair": "dyed red" } }`. It is a code write on entry,
   applied through `EngineHost.derive` at the boundary that enters the checkpoint, so swiping that reply un-writes it.
   It is not path-replayed like `world_info`, because an extracted write after it must be able to win.
2. **Extracted:** the quality is `source: extractor`, with a rubric ("Arin's current hair color, only when the text
   says it changed"), `evidence_from: world`. It is read by the shared read like any quality. Latching off.
3. **Author by hand:** `/cp set arin_hair red` and the Blackboard tab (exist). A Studio "Card" panel is optional later.
- **Precedence:** the newest blackboard write wins. One store, so there is no merge rule to get wrong.
- **Never:** `/char-*`, `/persona-update`, `writeExtensionField`, card-file saves or SD `character_prompts`.

### Readers

| Reader | What it does |
|---|---|
| **Prompt** | A new `INJECTION_REGISTRY.cardOverlay` block, "Current state (overrides the character card where they differ):", one line per member with a set field. Depth: decided in the spike (S32-1). Shared, since a look is public. A private field goes through epistemic, not this. The player's fields go in the same block under `{{user}}`. |
| **Scenario / examples** (optional) | Only where ST has a per-chat override (16a). Not for description: ST has none. |
| **Ledger mirror** | Bound fields appear read-only in `getLedger()` like other bound rows. |
| **Image prompts** | `castForImage` composes `appearance = authored look + overlay visual fields`. The overlay wins over the card, the lore `Appearance:` and the authored story look. |
| **Sprites** | A new set rule `when: { card: { hair: ["red", "dyed red"] } }`. It is persistent: checked before place and keyword, after `directed.set`. It never resets on a move. |
| **Player copy** | An inline chip in the existing `cast` category: "Arin: hair now red" (L1, player copy). Only applied values. An authored future change is never listed. Author view (L3+) shows the source (effect / extraction / hand). |
| **Health (31)** | Checks: an overlay field bound to a missing quality; a visual field with no sprite set and no on-demand backend (info). |

### Avatars (evaluated; not recommended for v2.7)

- **Per-message `force_avatar`:** possible. ST honours it in solo and group (`script.js:2621-2638`) and stores it per
  chat. But we would have to rewrite every new reply of that member (`MESSAGE_RECEIVED`, like `rewriteReplyText`), and
  ST overwrites it on group saves (`script.js:6767-6773`). Swipes and regenerates rebuild it: not determined how. It
  also needs an image file per look, and a hosted image URL.
- **DOM swap of `.avatar img`:** outside `.mes_block`. It would be a new message-DOM toucher, so the
  `architecture.test.ts:98-104` pin changes. It is lost on every re-render.
- **List/group avatars:** global, so never.
- **Player:** ST's own per-chat persona lock already gives a per-chat avatar (plan 30).
- **Recommendation:** none in v2.7. The sprite stage and illustrations carry the look. Revisit after on-demand sets
  exist, since they produce the image an avatar would need.

### Expressions and sprites for a changed look (on demand)

The problem: every look multiplies the sprite sets. Each expression (ST's standard set is about 28 labels) times each
look. Pre-rendering every possible extracted look is impossible, and pre-rendering every authored one is expensive.

**Two routes:**

1. **Pre-rendered, for authored looks.** The story declares a set per authored look (`when: {card: …}`). The campaign
   renders it at build time (`adolion-campaign/scripts/render_sprites.py`, plan 26b later). No runtime GPU.
2. **On demand, for unplanned or extracted looks.** When a visual field changes and no set matches:
   - **Key:** `look_<hash8>` = hash(story id, member id, normalized visual field values). The set id is valid
     (`^[a-z0-9_]+$`, no `-`), so a set rule can never pick up plan 28's `anim-*` folders. Another chat of the same
     story with the same look reuses it. Per story, not per chat, so a second chat costs nothing. Decision D6.
   - **Order:** render the current expression first (or `neutral` when unknown), then each other expression **the first
     time it is actually needed**. Never the full set up front.
   - **How:** plan 26b's sprite builder over plan 26's ComfyUI route B, as an **image edit** of the member's existing
     default sprite for that expression: "same character, same pose, now red hair". The edit keeps identity and framing,
     and the existing set is the reference. Route A (ST Image Generation) cannot do reference edits for most sources
     (`26-self-contained-images.md:191-192`), so with route A only, on demand is off.
   - **Latency:** never blocks the reply. The stage keeps the old set (or the author's `fallback` set for that look,
     else `default`) until a frame lands, then swaps that expression. A missing expression falls back through the
     profile's existing fallback chain (`profile.ts:55-63`) inside the new set before it falls back to the old set.
   - **GPU contention:** one queue, one job at a time, behind plan 26's broker when installed (fail-open). The
     reply's LLM never waits on it. Each job is cancelled if the look changes again first.
   - **Storage:** `characters/<sprite folder>/look_<hash8>/<label>.png` through `/api/sprites/upload`
     (`sprites.js:19-37` allows one subfolder level). The card's default and authored sets are untouched. Names are
     plain `<label>.png`, because ST cuts the label at the first `-`/`.` (`sprites.js:136-138`). ST's own expressions
     never see the subfolder unless the user sets a costume, so the card's default sets stay clean.
   - **Ownership ledger:** install-wide `sprites.generated[{story, member, set, chats[], createdAt, labels[]}]`, so
     cleanup knows what is ours. Like the wizard ledger, nothing unlisted is ever deleted.
   - **Cleanup:** on chat delete, drop the chat from `chats[]`. A set no chat references is deleted (per label via
     `/api/sprites/delete`). It asks first, like the mirror reaper. Also a manual "Remove generated sprites for this
     story" in the author view. Not determined: whether ST removes an empty subfolder (no endpoint seen); an empty
     folder is harmless.
   - **Rollback:** a rolled-back look switches the stage back, because the set choice reads the blackboard. The files
     stay cached. The same look later reuses them.
   - **Spoilers:** the queue only renders looks the chat has reached. Pre-rendered authored sets exist on disk, but the
     player only sees them when the overlay selects them.
   - **Settings:** off by default (`sprites.onDemand`). Needs sprites on, route B and an edit-capable model (probed).
     Otherwise a plan 31 info row: "Arin's new look has no sprites; showing the default set."

## What it must never do

- Write the card file, persona settings, `expressionOverrides` or SD `character_prompts` (all install-wide).
- Leak across chats: overlay values live only in this chat's blackboard. Generated sprite files are shared per
  story+look by design (D6), but which set is shown is decided per chat.
- Break rollback ≡ replay: one writer (blackboard), with authored writes keyed to the entry boundary.
- Show a future authored change to the player (chips list applied values only).
- Block a reply on image work.
- Delete a sprite file it did not record.
- Add a message-DOM toucher without updating the architecture pin (avatars deferred).

## Options

| | Option | Cost | Problem |
|---|---|---|---|
| A | Overlay = bound blackboard qualities + one injected block + visual readers | S-M; reuses blackboard, derive, ledger mirror | the card text still says "black hair"; the block must win (S32-1) |
| B | A per-chat card copy in extras, edited by effects | M | a second store with its own rollback; duplicates the blackboard |
| C | Rewrite the card file per chat on `CHAT_CHANGED` and restore on leave | M | global file; a crash leaves the edit in every chat; races ST saves. **Rejected.** |
| D | A + replace whole fields through ST overrides where they exist (scenario, examples) | A + small | only two fields are overridable; description is not |
| E | Sprites: pre-rendered only | build-time cost | extracted looks get no visuals |
| F | Sprites: on demand (+ pre-rendered for authored) | M-L, after 26/26b | GPU, storage, cleanup |

**Recommendation: A (with D only for stories already using 16a), avatars deferred; sprites E now, F after 26b.**
The overlay ships as tier 1 (pure plus injection). The prompt effect is measured in tier 3 before it is on by default.

## Measurement (tier 3: needs the model)

- **S32-1, does the model honour the overlay over the card?** Predeclared before the run:
  - Fixture: 3 members, each with one visual change mid-scene (card says X, overlay says Y). 10 replies after each
    change, mentions prompted. N = 30 replies per arm.
  - Arms: overlay block at depth 1 / depth 4 / no block (memory fact only, today's baseline).
  - Score: a reply that describes the changed attribute contradicts Y (says X) = fail. A rater (judge or human) labels
    each reply, and replies that never mention it are excluded and counted.
  - **Floor: ≥ 90 % of mentioning replies agree with Y, and at least 15 mentioning replies per arm.** The baseline arm
    must be worse, or the block is not needed.
  - Below the floor at every depth: ship the overlay for visuals only, and record the result.
- **S32-2, on-demand sprite identity** (after 26b): 5 looks × neutral + 3 expressions. Rater: "same character?" ≥ 90 %
  and the changed attribute visible ≥ 90 %. Time to the first frame recorded (no floor; never blocking).

## Decisions for the user

1. Overlay as bound blackboard qualities (A), not a card copy (B)? **Recommended: A.** 
2. Writers: authored effect + extraction + author hand edit? **Recommended: all three, newest wins.** 
3. Which fields: visual + condition/status lines only, or also free-text description/personality deltas?
   **Recommended: typed short fields only in v2.7.** Free-text deltas fight the card prose and are hard to roll back
   cleanly in the prompt.
4. Player persona included (overlay under `{{user}}`, via plan 30's `player.card`)? **Recommended: yes**, same block.
5. Player copy: an inline `cast` chip on each applied change? **Recommended: yes, L1; source at L3.**
6. On-demand sprite cache scope: per story+look (shared across that story's chats) or per chat?
   **Recommended: per story+look**: a second playthrough reuses it, and cleanup counts referencing chats.
7. On-demand rendering at all in v2.7, or only after 26b ships? **Recommended: after 26b, off by default.**
   Pre-rendered authored looks (route 1) work as soon as the set rule ships.
8. Order on demand: current expression first, the rest when first needed? **Recommended: yes.** Option: also
   pre-warm the 3 most frequent labels of that member in this chat.
9. While rendering or with no backend: old set, author-chosen fallback set, or default? **Recommended: author's
   `fallback` if set, else keep the old set** (closer to the new look than the card default).
10. Cleanup on chat delete: ask (like the mirror reaper) or silent? **Recommended: ask, and keep sets another chat
    still references.**
11. Per-chat avatars via `force_avatar`? **Recommended: not in v2.7**; revisit with on-demand images.
 Lets do as you recommend on those options
## Gates

- **Tier 1 (no LLM):** `npm run gates`.
  - Validator: `card.fields` must name a declared quality of type `string`/`enum`; `effects.card` member and field ids
    must exist.
  - Engine: entry write via derive; `rollback ≡ replay` and reopen ≡ replay over overlay fields (extend
    `runtime/chance.test.ts`-style cases).
  - New chat = empty overlay. Another story's chat = empty.
  - The injection registry problems check covers the new key and its depth. The `cardOverlay` key is never scannable.
  - Sprites: card set rule precedence, no reset on a move.
  - Image: `castForImage` overlay wins.
  - Spoiler property: chips never list unapplied authored values.
  - Guard: a grep test that nothing under `src/` calls `/char-` or `/persona-update`.
  - On demand (when built): pure queue/key/cleanup with a fake host; the ownership ledger never deletes an unlisted
    file.
- **Live, no LLM:** a scenario with `effects.card`. Check the block in the next-turn preview, the stage set, then
  swipe back and check the overlay is gone; a new chat shows the card default. Card file bytes unchanged
  (sha256 before/after).
- **Tier 3:** S32-1 on Artemis (rides the v2.7 final real-LLM suite). S32-2 on the local ComfyUI after 26b. Never
  `/sd` on a shared lane.

## Links

- `docs/plans/v2.7/16a-sp5-story-scenario.md`, `18-character-life.md`, `26-self-contained-images.md`,
  `28-talkinghead-review.md`, `30-player-persona-and-start-setup.md`, `31-story-health-center.md`, `02-v26-carry-in.md` (C7, C8)
- `src/engine/schema.ts`, `src/engine/engine.ts`, `src/memory/ledger.ts`, `src/constants/injectionRegistry.ts`,
  `src/image/cast.ts`, `src/sprites/profile.ts`, `src/sprites/stage.ts`, `src/runtime/architecture.test.ts`
- ST: `public/script.js:2621-2638,3402-3466,6767-6773,9002-9053`, `public/scripts/group-chats.js:497-568`,
  `src/endpoints/sprites.js:19-37,136-138,239-275`

## Unresolved

- How swipes and regenerates rebuild `force_avatar` in a group: not determined (only matters if D11 changes).
- Whether ST deletes an empty sprite subfolder: not determined.
- Which edit model the user's ComfyUI has for on-demand edits: probed at runtime (plan 26), not assumed.

## Review of the answers (2026-10-03)

All recommendations accepted. Plan 30 now routes the player's in-story changes through this overlay (`player.card`):
the user's ST persona stays the base and is never edited. No solo branches (plan 33).
