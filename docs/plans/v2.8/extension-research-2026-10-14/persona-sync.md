# Persona Sync — 2026-10-14 harvest
meta: https://github.com/thexyzzyone/STPersonaSync · head `d990927` · MIT · read all of `modules/*.js`, `index.js`; skimmed `ui.js` · new repo, no prior review

## What it is / what changed
Copies a persona's name, description and avatar onto a matching character card (or creates one), and back. Matching:
saved pairing > ST persona->character connection > unique exact name; ambiguous names stay unmatched. Swaps `{{user}}`/`{{char}}`
when text changes sides. Tags synced cards `Synced Persona`. ~500 lines.

## How it works
- Matching with a `claimed` set so one card is matched once (matching.js:75-124); connection read from
  `power_user.persona_descriptions[id].connections[{type,id}]` (:63-66).
- Macro swap via NUL placeholders, case-insensitive (macros.js:40-53). Ignores `{{persona}}` and legacy `<USER>`/`<BOT>`.
- Writes through `/api/characters/merge-attributes` (only name/description), `/api/characters/edit-avatar`, then refetches the
  thumbnail and reloads `img` srcs (sync-api.js:135-199). No read-back.

## Patterns for SO
Little applies. SO's rule is the opposite direction: the wizard never touches personas; a persona is created only by the
player's click and only added (architecture.md §Wizard; `src/services/stHost/personaWrites.ts:32-40`); every start locks it to
the chat (`personaWrites.ts:23-30`, `src/runtime/playerSetupControl.ts:96-116`).

### P1. Persona/card name clash is a real host workflow — test-idea · persona checks · present · value 2 · effort S
What: this extension deliberately makes a card with the persona's exact name. If that card ends up in a story's cast, our
`persona-fit-cast` check fires (`src/runtime/checksPersona.ts:27-33`, `playerSetup.ts:115`). Correct behaviour; add a fixture
row naming this case only if the check's copy ever confuses. Nothing to build.

### P2. Unambiguous-or-nothing matching — pattern · cast/persona resolution · present · value 1 · effort -
Their claimed-set + unique-name rule (matching.js:100-105) equals our stance: `castMemberName` prefers card name, then id,
else returns the identifier unchanged (`src/engine/castNames.ts:9-14`); fixed-name stories list all same-name personas and
let the player pick (`playerSetup.ts:108`). Nothing to take.

## Host facts (verified in `C:/dev/SillyTavern-MainBranch/public/scripts/personas.js`)
- Persona selection order on chat load: chat lock (`chat_metadata.persona`) > character/group connection > default persona
  (personas.js:1563-1631). Our chat lock therefore wins over any connection; good.
- A chat lock naming a deleted persona is dropped on open, but ST then calls `saveSettingsDebounced`, not a metadata save
  (personas.js:1569-1573), so the unlock persists only with the next chat save. Our `persona-lock` check
  (`checksPersona.ts:18-25`) reads the live state, so it reports correctly; "Switch back" then fails with
  "no persona with the avatar" (`personaWrites.ts:17`). Acceptable; no SO bug.
- `lockPersona('chat')` uses `saveMetadataDebounced` (personas.js:1086-1088). SO persists right after (`playerSetupControl.ts:29`),
  so the debounce is covered.
- With `persona_auto_lock` on, ST auto-locks whatever it auto-selects (personas.js:1648-1660) — can lock a persona before
  our start step on a fresh chat; our start step re-locks the chosen one, so harmless.

## Not worth taking
- Card<->persona field sync, avatar copy, tagging: violates nothing but has no SO use (wizard never touches personas).
- `{{user}}`/`{{char}}` swap: SO never moves text between persona and card.
