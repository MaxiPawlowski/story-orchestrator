# Plan 30 — Who the player is: a story player profile and a start-setup step

**Status: DRAFT 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

The user's words: "some sort of persona definition on the story/wizard, to make sure the player's persona matches
what's expected. Or maybe some sort of setup on story start?"

## Problem

- A story assumes a player character: a role, sometimes a name, what they know and can do. SillyTavern's persona
  (`{{user}}` name plus a description in the prompt) is the user's own, install-wide, and nothing checks that it fits.
- What goes wrong today:
  - **Hard name match or nothing.** `requirements.personas` is a list of exact names. A missing one blocks the story
    (no start effects), and the wizard can only refuse it. T5-1-4: the staged wizard required "The Apprentice", the
    saved story never started, Repair said only "written for a different player character" (`test/sessions/T5/SUMMARY.md:121`).
  - **No soft expectation.** A story that says "you are a hired adventurer" cannot say so to the player or check the
    persona, except through free text in `player_intro`.
  - **One persona for every story.** Every v2.6 session played as the same persona, including stories written for a
    different player character; T2-2 noted "the tooling makes no second persona" (`test/sessions/T2/SUMMARY.md:34`).
    The campaign plan says its two storyline families "need incompatible personas" (`C:\dev\adolion-campaign\PLAN.md:23`).
  - **The persona description is an unreviewed prompt channel.** T4-1 found a story secret reaching every draft through
    the persona description (`test/sessions/T4/SUMMARY.md:52`). Nothing the story controls checks it.

## What exists

### Our code

| What | Where | Notes |
|---|---|---|
| `requirements.personas` (names) | `engine/schema.ts:320`, `engine/validate/storyOptions.ts:9,26` | normalizes like members/lorebooks |
| Readiness: persona = `context.name1`, compared by name | `runtime/requirements.ts:16,21`, `runtime/requirementsRead.ts:50,63,67` | a mismatch makes `ready` false, so effects wait. `absentPersonas` = not on the install |
| Re-check on persona switch | `runtime/requirementsWatch.ts:75` (`PERSONA_CHANGED`) | |
| Repair rows | `runtime/repair.ts:193-218` | absent → one-click "Remove the requirement" (`withoutPersonas`, `:220`; `castRepair.ts:17`); unselected → "Select it in Persona Management" |
| Wizard refusal | `wizard/provisioning.ts:12-20` (`personaRequirementProblem`), `copilot/authoring.ts:67-72`, `copilot/agent/requirements.ts:52-54` | a required name must already exist |
| No persona tool | `copilot/agent/tools.ts:80` (only `setRequirements`), `copilot/agent/prompt.ts:39` ("never touch personas"), `copilot/prompts.ts:69,119` | by design (architecture.md, wizard invariant, T5-1-4) |
| "Fix with wizard" seed | `wizard/interview.ts:42` | tells the author to create personas themselves |
| Studio | `studio/components/StoryEditor.tsx:136-141` (Persona field), `studio/castDiagnostics.ts:13,99-110` (`requirement-persona-missing`) | |
| The player is never a cast member | `studio/playerRole.ts:3,21-44`, `castDiagnostics.ts:115-119` (`roster-member-is-player`), `copilot/agent/playerCast.ts:23-25`, `agent/prompt.ts:33` | the player's role is read by regex ("you are a …") from `description`, `player_intro`, openers |
| Player name | `stHost/context.ts:78-81` (`getPlayerName` = `name1`), `runtime/macros.ts:63` (`{{story_player_name}}`) | |
| Prompts say `{{user}}`, never "the player" | `engine/agency.ts` `PLAYER_REF`; `docs/plans/v2.6/14-findings.md:137` | ST substitutes it in extension prompts (`script.js:3326`) |
| `player_intro` | `engine/schema.ts:367`, `snapshotBuilder.ts:49` | premise; drawer Overview only |
| Player copy label | `runtime/narrative.ts:241` ("Your character") | |
| Persona-bound lorebook read | `stHost/selectors.ts:77` | counts for lore requirements |
| Author guide | `docs/authoring/story-guide.md:49,52,61-62,72` | "leave `requirements.personas` out unless the story truly needs a named persona" |

### Related v2.7 plans

- **03 briefing** (`03-story-briefing.md`): one modal on the story's first start in a chat, with a free-text
  "Who you are" section; `extras.ui.briefingSeen`; harness sets `display.briefing` off.
- **24 living story**: `living.player_role` (free text) feeds the director (`24-living-story-director.md:53`).
- **27 wizard assistant**: character-building tutorial; "greeting speaks for the player" is a listed card mistake.
- **31 health center**: already lists "persona fit (30)" as an incoming check (`31-story-health-center.md`).

### SillyTavern host (`C:\dev\SillyTavern-MainBranch`, verified)

- **What a persona is.** `power_user.personas[avatarId] = name` and `power_user.persona_descriptions[avatarId] =
  {description, position, depth, role, lorebook, title, connections}` (`personas.js:515-549`, `initPersona`).
  Install-wide settings. The selected one is `user_avatar` (`personas.js:108`), also saved install-wide
  (`setUserAvatar`, `:154-167`, `saveSettingsDebounced`).
- **Name.** `name1` = `{{user}}`; `setUserName` writes it and saves settings (`script.js:7873-7883`). Selecting a persona
  copies its name and description into `name1` / `power_user.persona_description*` (`selectCurrentPersona`,
  `personas.js:897-945`).
- **Description in the prompt.** Positions `IN_PROMPT 0 / TOP_AN 2 / BOTTOM_AN 3 / AT_DEPTH 4 / NONE 9`
  (`personas.js:88-98`); applied at `script.js:3207-3223` and `:4706`; `{{persona}}` macro `script.js:3412`.
- **Locks.** Three kinds (`isPersonaLocked`, `personas.js:975-991`):
  - **chat**: `chat_metadata.persona = user_avatar` (`lockPersona`, `:1088`); on every `CHAT_CHANGED`
    `loadPersonaForCurrentChat` re-selects the chat's locked persona (`:1543-1672`, `:3004`).
  - character/group: a `connection` on the persona (`:1094-1126`).
  - default: `power_user.default_persona` (`:978`).
  - `persona_auto_lock` (user setting) locks the chosen persona to the chat on selection (`:900`, `:936`).
- **There is no per-chat description override.** The description belongs to the persona. "Adapt for this chat" means
  a separate persona (duplicate or new) locked to the chat, or a story-side prompt block.
- **Slash API** (this checkout; the comment calls them "New CRUD commands", so older ST may lack them):
  `/persona-create name= description= descriptionPosition= ... select=` (`personas.js:2096-2150`, `:2558`; default
  avatar uploaded via `/api/avatars/upload`, `:359-384`), `/persona-update`, `/persona-get`, `/persona-duplicate`,
  `/persona-delete`, `/persona-lock [type=chat|character|default] on|off` (aliases `lock`, `bind`, `:2782`),
  `/persona-set` (aliases `persona`, `name`; `mode=lookup|temp|all`, `:2372-2439`, `:2823`). `mode=temp` sets only
  `name1`, but still saves settings.
- **Events.** `PERSONA_CHANGED/CREATED/UPDATED/RENAMED/DELETED` (`events.js:100-104`).
- **Reading it from an extension.** `getContext().name1` (`st-context.js:121`), `powerUserSettings.personas` /
  `persona_descriptions` (`:229`), `chatMetadata.persona` (`:135`). `user_avatar` itself is not on the context; it is an
  export of `personas.js` (a new `stHost/personas.ts` module would import it).
- **Risks.**
  - Switching persona on a new chat re-triggers the greeting: `setUserAvatar` → `retriggerFirstMessageOnEmptyChat`,
    which **reloads the whole chat in a group** unless `chat_metadata.tainted` (`personas.js:163`, `:1875-1885`). How
    that interacts with our scripted opener (v2.5 plan 17) is **not determined**.
  - A persona switch changes the install-wide current persona. Chats without a lock open with it afterwards.
  - Past user messages keep the old name; `/persona-sync` rewrites them (`:1842`), which is a history edit.
  - Deleting a persona unlocks chats that used it (`:1188-1190`).
  - A persona is the user's identity across every chat. Editing or deleting one is invasive; creating one is additive.

## Options

| | What | Cost | Risk |
|---|---|---|---|
| **A** | Story declares a **player profile**; a "Who are you in this story" step in the start modal lets the player keep the current persona, pick another (switched and **chat-locked** via ST's own lock), or **create a story persona** (player-confirmed, create-only, then chat-locked) | medium: schema + validator + modal step + `stHost/personas.ts` + harness | host: greeting retrigger/reload on switch, older ST without `/persona-create`; invariant change |
| **B** | Inject a story-side "who `{{user}}` is in this story" block; never touch ST personas | small: one injection key | contradicts a persona description that says otherwise; the model gets two identities |
| **C** | Validation only: Repair/health row when the persona doesn't fit (name rule deterministic; description fit via judge) | small (name), medium (judge: needs a calibrated use and floor) | warns but never fixes; judge use uncalibrated |
| **D** | Wizard authoring: the Characters step drafts the profile (edit op, author reviews) | small | none beyond the usual review |

- B alone is weakest: the description wins or fights. B is useful as the "keep my persona" path.
- C alone tells the player something is wrong and leaves them to go fix it in Persona Management.
- D only produces data; it needs A or B to mean anything.

## Recommendation

**A + B + D, with C's deterministic part; the judge fit check deferred.**

1. **Format: optional story-level `player`.**

   ```json
   "player": {
     "role": "a hired adventurer",
     "summary": "You are new to the city, with a sword, a little coin and no name anyone knows.",
     "name": { "mode": "any" },
     "assumes": ["can fight", "does not know the city's politics"],
     "suggested_description": "…",
     "inject": true
   }
   ```

   - `role`: one line. Replaces the regex guess in `playerRole.ts` as the first source (the regex stays as a fallback).
   - `summary`: player copy (spoiler rules as for briefings). Fills the briefing's "Who you are" section when the
     author wrote none, and the start step's text.
   - `name.mode`: `any` (default) | `suggested` (`name.value` is offered when creating) | `fixed` (the story only works
     with that name; replaces most uses of `requirements.personas`).
   - `assumes`: what the story takes for granted. Shown to the player; fed to the model only through `summary`/the block.
   - `suggested_description`: prefilled text for "Create a persona for this story". Never written anywhere without the
     player's click.
   - `inject`: when on and the player kept a persona that is not a story persona, a short block
     (`INJECTION_REGISTRY.playerRole`, in-prompt, low priority) says "In this story, `{{user}}` is <role>: <summary>".
     Off when the player chose or created a persona for this story (the description already carries it).
   - `living.player_role` (plan 24) becomes `player.role`.
2. **`player` never blocks readiness.** Only `requirements.personas` (kept, for the rare story that truly needs a named
   persona) and `name.mode: fixed` gate effects. Everything else is a choice the player makes.
3. **Start-setup step in plan 03's modal** (below). The player confirms every persona change.
4. **Wizard (D).** The Characters step drafts `player` from the premise (new mutation + agent tool `setPlayer`, an
   ordinary edit op). Still no persona tool: the wizard never creates, selects or edits a persona.
5. **Deterministic fit check (C).** A plan 31 registry entry, audience player: `fixed` name not selected (blocks), the
   persona is a cast member's card name (degrades; same rule as `roster-member-is-player`), persona description empty
   while `inject` is off (info). No judge in v2.7.

## Start-setup flow ("Before you start")

One modal (plan 03's `#so-briefing`), two panes when the story has a `player` block, one otherwise.

1. **Briefing** (plan 03, unchanged).
2. **Who are you in this story** (`#so-player-setup`):
   - Shows `role`, `summary`, `assumes`, and the current persona's name (not its description; it may be long or private).
   - Choices:
     - **Play as <current persona>** (default). Optionally "lock to this chat" (ST's chat lock). `inject` applies.
     - **Choose another persona**: a list of existing personas; on pick, select + chat-lock through ST
       (`setUserAvatar` then `lockPersona('chat')`, or the slash equivalents).
     - **Create a persona for this story**: name (prefilled from `name.value` or blank), description (prefilled from
       `suggested_description`), shown in full, editable. One "Create and use" button: `/persona-create select=false`
       with a marked title (e.g. `title="Story: <story title>"`), then select + chat-lock. Never edits or deletes an
       existing persona; never sets the default persona; never touches the persona lorebook.
   - "Skip" = play as current, no lock.
3. **When it runs.**
   - **New chat** (bound story, plan 17 path): ideally **before** the opener posts, so the opener and `{{user}}` see the
     chosen name, and the greeting retrigger has nothing to clobber. Whether the opener can wait for the modal (and for
     how long) is a spike item (S30-1); plan 17's opener deferral is the starting point.
   - **`selectStory` into a chat with messages:** offered, but switching shows a warning that earlier messages keep the
     old name. No `/persona-sync` (it rewrites history).
   - **`restartStory`:** offered again.
   - **No chat open:** never (no-chat invariant).
4. **State.** The choice is chat state: ST holds the lock (`chat_metadata.persona`); we record
   `extras.ui.playerSetup = {storyId, version, choice, avatarId?}` beside `briefingSeen`. Rollback does not touch it
   (it is not message-scoped); reopen does not re-show it; Restart re-offers it.
5. **Groups.** ST's chat lock works in group chats (it is chat metadata). The group-reload on switch (`personas.js:1879`)
   is the main host risk and is part of S30-1.
6. **Re-open any time:** drawer Overview footer "Your character in this story" and `/story who`.

## Invariant changes needed

- architecture.md, wizard invariant: "Personas are never provisioned" becomes:
  > **The wizard never touches personas.** A persona is created only from the player's own click in the start-setup
  > step, with its exact name and description shown, and is only ever added: no edit, delete, default or lorebook
  > change. Selecting one for a story chat uses ST's own chat lock.
- `personaRequirementProblem`, `requirement-persona-missing` and the Repair "remove" action stay as they are for
  `requirements.personas`. Repair's "unselected" row gains "Open the setup step".
- New: `player` text is player copy (spoiler diagnostics as for briefings; `so-ui assert-player-clean` sweeps the step).

## Decisions for the user

1. A story `player` profile (role, summary, name mode, assumptions)? **Recommended: yes.**
2. Let the player create a persona from the setup step (create-only, their click, chat-locked)? **Recommended: yes**,
   with the invariant amendment above.
3. Default choice in the step: keep the current persona with the story block injected? **Recommended: yes**; the player
   opts into switching or creating.
4. `requirements.personas`: keep for named-persona stories, steer authors to `player` instead? **Recommended: keep,
   guide says prefer `player`.**
5. Judge "does this persona fit the story" check? **Recommended: not in v2.7** (no calibrated use; deterministic checks
   only).
6. Adolion: give each of the nine stories a `player` block (campaign A-step, content review by another model, not the
   user)? **Recommended: yes**, after this plan's format lands.
7. Show the step before the opener on a new chat (needs S30-1)? **Recommended: yes if S30-1 shows it is safe; otherwise
   after the opener, offering only "lock" and "create for future chats".**

## Gates

- **Tier 1 (no LLM, no RunPod).**
  - Pure: validator, diagnostics, the `playerRole` source order, setup state under rollback/reopen/restart, the
    deterministic fit rules.
  - UI: Storybook for the step (390/768/1440, a11y).
  - Live on a **lane** (it writes personas): S30-1 spike (switch + lock on a new solo and group chat, before and after
    the opener; the greeting retrigger/reload), then the flow via new `so-ui` verbs. Harness: setup off by default like
    `display.briefing`; `so-assets` learns to list/remove marker-titled personas; `so-run-header` records
    `inventory.personas` and the chat lock.
  - `npm run gates`.
- **Real-LLM.** The injected block changes the reply prompt, so it rides the v2.7 final real-LLM suite (any working
  backend; nothing here needs RunPod specifically). Not green until that runs.

## Unresolved

- S30-1: does a persona switch on a fresh bound chat clobber or duplicate our opener (solo `createOrEditCharacter`,
  group `reloadCurrentChat`)? When is `chat_metadata.tainted` set? Not determined.
- Older ST without `/persona-create`: capability probe and fall back to `initPersona`-style direct writes, or refuse
  creation? Not determined.
- Multi-user ST installs: personas are per user directory; assumed fine, not verified.

## Links

03 story briefing (the modal), 24 living story (`player_role`), 27 wizard assistant (tutorial: "the player is the
persona"), 31 health center (the fit check row), 01 docs (guide pages: author topic `player`, player page "Your
character"), 05 Adolion campaign.
