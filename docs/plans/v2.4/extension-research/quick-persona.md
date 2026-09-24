# Quick Persona — v2.4 review

Author Cohee (ST maintainer) · repo https://github.com/SillyTavern/Extension-QuickPersona · commit `5509fb6` (2025-10-12) · 59 upvotes / 43 msgs · source available: **y** (`source/index.js` 103 lines, `style.css` 83 lines, manifest, README)

## What it is
Chat-bar utility: a persona avatar button in `#leftSendForm`; click opens a Popper grid of every persona avatar (current = white outline, default = gold outline); click one to switch. No LLM calls, no prompts, no persistence, no settings. Relevance to a narrative engine is low. Its value to us is indirect: reading it made us check how SO reacts to a **persona switch**, and SO does not react until the next reply (idea 1).

## How it works
- Static relative imports of private host modules (`index.js:1-4`): `script.js` (`animation_duration, eventSource, event_types, getThumbnailUrl`), `power-user.js` (`power_user`), `personas.js` (`getUserAvatar, getUserAvatars, setUserAvatar, user_avatar`), `lib.js` (`Popper`). No `getContext()` use at all.
- Mount: appends `#quickPersona` (img + caret) to `#leftSendForm` (`index.js:12-22`), CSS `order: 10` and `--bottomFormBlockSize` sizing (`style.css:39-44`).
- Open (`index.js:44-72`): `await getUserAvatars(false)` (list, no render) → per avatar: name `power_user.personas[avatar]`, title `power_user.persona_descriptions[avatar]?.title`, `selected` = `avatar === user_avatar`, `default` = `avatar === power_user.default_persona`. The menu is appended to `body`, positioned by `Popper.createPopper(..., {placement:'top-start'})`, and faded in with `animation_duration`.
- Switch: `await setUserAvatar(avatar)` then `changeQuickPersona()` (`index.js:57-61`). It uses ST's own switch path, so name, lock UI, empty-chat greeting re-trigger and `PERSONA_CHANGED` all happen in ST (personas.js:154-167).
- Refresh: `CHAT_CHANGED` + `SETTINGS_UPDATED` → `changeQuickPersona` inside a `setTimeout(100)` (`index.js:83-96`). This polls around ST's persona restore instead of subscribing to `PERSONA_CHANGED`, which is newer than the extension (events.js:100).
- Capability probe by behaviour: `supportsPersonaThumbnails = getThumbnailUrl('persona','test.png',true).includes('&t=')` (`index.js:10`). It falls back to `getUserAvatar(...)?t=now` (`:29-34`).
- Close on outside click via a body-level delegated handler (`index.js:97-101`).
- Persistence: none. Mutation handling: n/a.

## Overlap with Story Orchestrator
- SO reads the persona only by **name**: `evaluateRequirements` compares `context.name1` to `requirements.personas` (`src/runtime/requirements.ts:14-18`). `{{story_player_name}}` uses `getPlayerName()` (`src/services/stHost/context.ts:55`, `src/runtime/macros.ts:49`). `listPersonas()` exists (`src/services/stHost/selectors.ts:53`) but is used only for the wizard environment, not for the requirement check.
- Missing persona surfaces in two places: Repair step `area:"persona"`, which has `targetId: null` and no action (`src/runtime/repair.ts:56-62`), and the player Overview "Persona" row (`src/components/drawer/PlayerOverview.tsx:19`). By design the wizard never provisions a persona (inv 8).
- Requirements re-evaluate only on load/swap/boundary/activate/rollback (`src/runtime/runtimeManager.ts:249,282,537,602`, `src/runtime/rollback.ts:89`). There is **no `PERSONA_CHANGED` subscription** (grep `PERSONA` in `src/`: 0 hits; `HostEventPayloads` has no key, `src/services/stHost/events.ts:6-36`). `WORLDINFO_SETTINGS_UPDATED` and `GROUP_UPDATED` only `notify()` (`src/runtime/turnBridge.ts:60-61`), and the snapshot serves the cached `extras.requirements` (`src/runtime/snapshotBuilder.ts:120`).
- UI in the chat bar: our HUD strip sits above the input (`HudStrip.tsx`). It is sturdier (scoped CSS, one snapshot), and we have no need for a persona picker of our own. ST's persona panel plus `/persona-set` already cover it.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Re-evaluate requirements on `PERSONA_CHANGED` (and WI-selection / group updates); on a not-ready→ready flip apply hydrate effects before the next generation | host-integration | engine-runtime / host | partial | 4 | S |
| 2 | Actionable persona Repair: "Use <persona>" via `/persona-set mode=lookup`, optional "keep for this chat" via `/persona-lock on` | ux | player-ui (repair) | absent | 3 | S |
| 3 | Persona requirement should match a real persona, not the `name1` string (a temp name passes today) | enhancement | host / requirements | partial | 2 | S |

**1. Requirements follow host state, not boundaries.**
- **What:** subscribe to `PERSONA_CHANGED` (payload = avatar key, personas.js:166). Debounce it, then call `refreshRequirements()` + `notify()`. Do the same for `WORLDINFO_SETTINGS_UPDATED` / `GROUP_UPDATED`, which today only notify. If `ready` flips false→true while `lastAppliedCheckpointId !== active`, run the same `"hydrate"` `applyCheckpoint` branch that `commitBoundary` runs (`runtimeManager.ts:256-257`).
- **Why:** today a player who fixes the persona sees Repair and Overview stay red until the next reply. Worse, `EffectsApplier` skips the checkpoint effects while not ready (`src/runtime/effectsApplier.ts:205`) and only catches up at the next boundary's hydrate branch. So the first generation after the fix runs **without** the checkpoint's AN, WI and cast. There is also an ordering race on chat open: ST restores the chat's locked/connected/default persona in its **own** `CHAT_CHANGED` listener (personas.js:3004 → `loadPersonaForCurrentChat` :1543). That listener is async and may await a selection popup (:1602-1606), so our hydrate can evaluate `name1` before the persona settles, and nothing re-evaluates afterward.
- **Their evidence:** they needed the same refresh, on `CHAT_CHANGED` + `SETTINGS_UPDATED` + `setTimeout(100)` (`index.js:83-96`). That is the fragile version of the same observation.
- **Our evidence:** above (no `PERSONA` hit; refresh sites listed).
- **Fit:** effects already apply outside boundaries on select/hydrate, and no blackboard write is involved (inv 3 unaffected). The flip must `beginRun` and re-check before each write (inv 10), and it goes through `withLedger` (inv 16). Add `PERSONA_CHANGED` to `HostEventPayloads` with a verified payload type (inv 2).

**2. One-click persona fix.**
- **What:** the persona Repair step gains an action. It runs `/persona-set mode=lookup "<name>"` through the existing slash seam. `mode=lookup` never falls back to a temporary name; the default `all` does (personas.js:2422-2436). An optional "keep this persona for this chat" runs `/persona-lock on`, which writes ST's own `chat_metadata.persona`, not our blob. That lock makes ST's own restore (personas.js:1543ff) select the right persona on every reopen, so the requirement stops flapping when a default persona is set.
- **Their evidence:** switching via ST's `setUserAvatar` (`index.js:59`) rather than poking `name1` gets name, lock UI and events for free.
- **Our evidence:** `targetId: null`, `provisionable: false`, no control (`src/runtime/repair.ts:56-62`).
- **Fit:** this is selection of an existing persona, not provisioning, so inv 8 is not strained. One condition: **only lock after a successful lookup**. `lockPersona` silently **creates** a persona from `name1` when the current avatar is not one (personas.js:1061-1079), which would be the provisioning we forbid. Both personas may use it, since fixing a requirement is not steering (inv 9). Results come back as a `WriteResult` from a `stHost` wrapper (inv 16).

**3. Persona requirement matches identity, not a label.**
- **What:** `name1` is set by a temp `/persona-set mode=temp|all` (`setUserName`, personas.js:2433-2435) with no persona behind it. So a story "requiring Arin" goes green with no persona description and no persona lorebook. Instead, require that `name1` resolves to an entry of `powerUserSettings.personas` (`listPersonas()`, `selectors.ts:53`). Better still, record the avatar key once the author picks it.
- **Their evidence:** they key everything by avatar and treat the name as display only (`index.js:49,53-54,85`).
- **Our evidence:** `requirements.ts:14-18`.
- **Fit:** pure-ish check change. Keeping authored names (not avatar files) in story records keeps stories portable. Low value until persona-bearing stories exist beyond Adolion.

## Patterns to copy / anti-patterns to avoid
- **Copy:** route host state changes through the host's own API (`setUserAvatar` / `/persona-set`) rather than writing fields. The event and side-effects then come free.
- **Copy (already have):** detect a capability by probing behaviour (`index.js:10`), which matches our `stHost/capabilities.ts` approach.
- **Avoid:** static relative imports of private host modules (`index.js:1-4`). They break out-of-tree builds and pin a path layout; this is inv 2's reason for `importSTModule`. `st-context.js` exposes no persona API (grep `avatar|persona`: 0 hits), so a persona seam for us means slash commands or an `importSTModule('personas.js')` wrapper. Prefer slash.
- **Avoid:** `SETTINGS_UPDATED` + `setTimeout(100)` as a proxy for a specific state change (`index.js:83-96`). Subscribe to the specific event (`PERSONA_CHANGED`) and treat a timer as a smell.
- **Avoid:** module-level `isOpen`/`popper` without guards. `closeQuickPersonaSelector` calls `popper.destroy()` unguarded (`index.js:80`).

## ST host facts learned
- `setUserAvatar(avatar)` returns early with **no event** if the avatar is unchanged. Otherwise it reloads avatars, `retriggerFirstMessageOnEmptyChat()`, `saveSettingsDebounced()`, then emits `PERSONA_CHANGED(user_avatar)` (personas.js:154-167).
- ST restores the chat persona in its own `CHAT_CHANGED` listener (personas.js:3004 → `loadPersonaForCurrentChat` :1543). Order: chat lock → connected character persona (possibly a selection **popup**) → default persona (:1602-1650). So `name1` can change after other `CHAT_CHANGED` handlers ran. New for us; not in gotchas.
- `lockPersona` auto-**creates** a persona (`power_user.personas[user_avatar] = name1`, `PERSONA_CREATED`) when the current avatar is not a persona (personas.js:1061-1079).
- `/persona-set` (aliases `/persona`, `/name`): `mode=lookup|temp|all`, default `all` falls back to a temp name via `setUserName` (personas.js:2408-2436, registration :2823). `/persona-lock [type=chat|character|default] on|off` (:2782).
- `getThumbnailUrl(type, file, t)` → `/thumbnail?type=…&file=…[&t=now]` (script.js:7548-7550). Persona title lives at `power_user.persona_descriptions[avatar].title` (`index.js:50`).
- `#leftSendForm` is the chat-bar left slot (index.html:8103). ST bundles Popper in `lib.js` (`index.js:4`).
- No contradiction with our gotchas.

## Verdict
Relevance **low**: a 100-line persona picker with no story, memory or LLM mechanics. The one thing worth taking is not a feature of it but the question it raises. SO ignores `PERSONA_CHANGED` and only re-evaluates requirements at boundaries, so a fixed requirement stays red and the first turn after the fix runs without checkpoint effects. Idea 1 (S effort) fixes that for persona, lorebook and cast at once. Idea 2 is its natural UX companion.
