# Plan 03 — Who the player is: a story player profile and a start-setup step

**Status (2026-10-03): v2.8 plan 03 (was v2.7 plan 30). Decided (see Decisions and Review of the answers); not built;
spike S30-1 not run.** Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D (S30-1 on a lane with the scripted opener); acceptance RP
(the injected block rides the v2.8 final real-LLM suite).

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

### Our code (line refs checked 2026-10-03 on master `c7967323`)

| What | Where | Notes |
|---|---|---|
| `requirements.personas` (names) | `engine/schema.ts:322`, `engine/validate/storyOptions.ts:10,29` | normalizes like members/lorebooks |
| Readiness: persona = `context.name1`, compared by name | `runtime/requirements.ts:16,21`, `runtime/requirementsRead.ts:50,63,67` | a mismatch makes `ready` false, so effects wait. `absentPersonas` = not on the install |
| The opener waits for readiness | `runtime/effectsApplier.ts:255` (`if (ready)` before the `new_chat_only` replies), `:509` (only into an empty chat) | a fixed-name story therefore holds its opener until the name is selected |
| Re-check on persona switch | `runtime/requirementsWatch.ts:75` (`PERSONA_CHANGED`) | |
| Check registry (v2.7 04) | `runtime/checks.ts` (`CHECKS`, `:85`; areas include `persona`, `:4`) | today: `transcript-copiers`, `model-not-thinking` |
| Repair rows | `runtime/repair.ts:196-221` (`personaRepairSteps`) | absent → one-click "Remove the requirement" (`withoutPersonas`, `:223`; `castRepair.ts:17`); unselected → "Select it in Persona Management" |
| Wizard refusal | `wizard/provisioning.ts:13-20` (`personaRequirementProblem`), `copilot/authoring.ts:67-72`, `copilot/agent/requirements.ts:52-54` | a required name must already exist |
| No persona tool | `copilot/agent/tools.ts:80` (only `setRequirements`), `copilot/agent/prompt.ts:39` ("never touch personas"), `copilot/prompts.ts:69,119` | by design (architecture.md, wizard invariant, T5-1-4) |
| "Fix with wizard" seed | `wizard/interview.ts:42` | tells the author to create personas themselves |
| Studio | `studio/components/StoryEditor.tsx:136-141` (Persona field), `studio/castDiagnostics.ts:13,105` (`requirement-persona-missing`) | |
| The player is never a cast member | `studio/playerRole.ts:3,17-44`, `castDiagnostics.ts:11,120` (`roster-member-is-player`), `copilot/agent/playerCast.ts:20-25`, `agent/prompt.ts:33` | the player's role is read by regex ("you are a …") from `description`, `player_intro`, openers |
| Player name | `stHost/context.ts:78-81` (`getPlayerName` = `name1`), `runtime/macros.ts:63` (`{{story_player_name}}`) | |
| Prompts say `{{user}}`, never "the player" | `engine/agency.ts:20` `PLAYER_REF`; `docs/plans/v2.6/14-findings.md:137` | ST substitutes it in extension prompts (`script.js:3326`) |
| `player_intro` | `engine/schema.ts:385`, `snapshotBuilder.ts:50` (`publishedIntro`, falls back to `description`) | premise; drawer Overview only |
| Player copy label | `runtime/narrative.ts:241` ("Your character") | |
| Persona-bound lorebook read | `stHost/selectors.ts:77` | counts for lore requirements |
| Author guide | `docs/authoring/story-guide.md:49,52,61-62,72` | "leave `requirements.personas` out unless the story truly needs a named persona" (not re-checked) |

### Related plans

- **v2.7 05 story briefing** (`v2.7/05-story-briefing.md`): owns the one modal (`#so-briefing`) shown on a story's first
  activation in a chat, its free-text "Who you are" section, `extras.ui.briefingSeen` and `display.briefing` (the
  harness sets it off). This plan adds a pane to that modal; it does not own the modal.
- **v2.7 04 story health center** (`v2.7/04-story-health-center.md`): owns the check registry (`src/runtime/checks.ts`)
  and the "Before you start" findings list. This plan delivers two registry entries: persona fit and persona switch.
- **v2.7 03 group-chats-only**: stories run in group chats only. A solo chat appears here only as a control.
- **v2.7 20 living cards**: in-story changes to the player (looks, status, titles) live in its per-chat overlay under
  `player.card`. The ST persona is the base and is never edited.
- **v2.8 22 living story**: its `living.player_role` becomes this plan's `player.role` (review C10).
- **v2.8 09 wizard assistant**: character-building tutorial; "greeting speaks for the player" is a listed card mistake.
- **v2.8 02 Adolion campaign**: one `player` block per story, after this format lands (review D13).
- **v2.5 plan 17**: the scripted `new_chat_only` opener and the bound-story path (`runtime/groupStoryBinding.ts`,
  `boundStoryForEmptyChat`).

### SillyTavern host (`C:\dev\SillyTavern-MainBranch`, verified when the plan was written; not re-checked 2026-10-03)

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
- **There is no per-chat description override.** The description belongs to the persona. Per-chat changes go through
  v2.7 20's overlay or this plan's story-side block.
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
  - Switching persona on an empty chat re-triggers the greeting: `setUserAvatar` → `retriggerFirstMessageOnEmptyChat`,
    which **reloads the whole chat in a group** unless `chat_metadata.tainted` (`personas.js:163`, `:1875-1885`). How
    that interacts with the v2.5 plan 17 scripted opener is **not determined** (S30-1).
  - A persona switch changes the install-wide current persona. Chats without a lock open with it afterwards.
  - Past user messages keep the old name; `/persona-sync` rewrites them (`:1842`), which is a history edit.
  - Deleting a persona unlocks chats that used it (`:1188-1190`).
  - A persona is the user's identity across every chat. Editing or deleting one is invasive; creating one is additive.

## Options

| | What | Cost | Risk |
|---|---|---|---|
| **A** | Story declares a **player profile**; a "Who are you in this story" step in the start modal lets the player keep the current persona, pick another, or **create a story persona** (player-confirmed, create-only); every choice is **chat-locked** via ST's own lock | medium: schema + validator + modal pane + `stHost/personas.ts` + harness | host: greeting retrigger/reload on switch, older ST without `/persona-create`; invariant change |
| **B** | Inject a story-side "who `{{user}}` is in this story" block; never touch ST personas | small: one injection key | contradicts a persona description that says otherwise; the model gets two identities |
| **C** | Validation only: health-center row when the persona does not fit (name rule deterministic; description fit via judge) | small (name), medium (judge: needs a calibrated use and floor) | warns but never fixes; judge use uncalibrated |
| **D** | Wizard authoring: the Characters step drafts the profile (edit op, author reviews) | small | none beyond the usual review |

## Recommendation (decided 2026-10-03: A + B + D, with C's deterministic part; no judge)

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
     v2.8 22 reads it instead of `living.player_role`.
   - `summary`: player copy (spoiler rules as for briefings). Fills the briefing's "Who you are" section when the
     author wrote none, and the setup pane's text.
   - `name.mode`: `any` (default) | `suggested` (`name.value` is offered when creating) | `fixed` (the story only works
     with that name; replaces most uses of `requirements.personas`).
   - `assumes`: what the story takes for granted. Shown to the player; fed to the model only through `summary`/the block.
   - `suggested_description`: prefilled text for "Create a persona for this story". Never written anywhere without the
     player's click.
   - `inject` (default on): a short block (`INJECTION_REGISTRY.playerRole`, in-prompt, low priority) says "In this
     story, `{{user}}` is <role>: <summary>". **It stays on for every existing persona, kept or picked**: choosing a
     persona does not show that its description carries this story's role (review F11). It turns off only for a
     **verified canonical equivalent** (Sol r3 R3-03): the persona's live description contains, verbatim, the exact
     canonical line the block would inject (`renderPlayerRoleLine(role, summary)`, the same function the injection
     uses), re-checked at every loud generation. Provenance is not equivalence: `suggested_description` is authored
     independently and editable before creation, so "Create a persona for this story" prepends the canonical line to
     it, and the injection stays on whenever that line is missing or altered (the player edited it before or after
     creation, the author changed `role`/`summary` later, or the persona was created some other way).
     `extras.ui.playerSetup.createdHash` stays as provenance for the journal only; it never turns the block off.
     Tests (jest): (a) created from a `suggested_description` unrelated to `role`/`summary`, with the canonical line
     removed before the click → injection on (the counterexample); (b) created with the line intact → off; (c) the line
     edited in Persona Management later → on; (d) the story's `role` changed by an update → on until the line matches
     again; (e) a kept persona whose description happens to contain the line → off (equivalence by content).
   - `card` (optional): the fields of the player that the story may change, owned by v2.7 20's overlay.
2. **`player` never blocks readiness.** Only `requirements.personas` (kept, for the rare story that truly needs a named
   persona) and `name.mode: fixed` gate effects. Everything else is a choice the player makes once, at the start.
3. **Start-setup pane in v2.7 05's modal** (below). The player confirms every persona change. **Every start choice
   locks the persona to the chat**, Skip included; there is no switching inside a story.
4. **Wizard (D).** The Characters step drafts `player` from the premise (new mutation + agent tool `setPlayer`, an
   ordinary edit op). Still no persona tool: the wizard never creates, selects or edits a persona.
5. **Deterministic checks (C), delivered as v2.7 04 registry entries** (`src/runtime/checks.ts`, scope `chat`, area
   `persona`):
   - `persona-fit`, audience player: `fixed` name not selected (`blocks`); the persona is a cast member's card name
     (`degrades`; same rule as `roster-member-is-player`); persona description empty while `inject` is off (`info`,
     the severity v2.7 04 D8 adds).
   - `persona-switch`, audience player, `degrades`: the selected persona is not the one `playerSetup` locked. Copy:
     "This story was started as X; switching mid-story breaks what characters know about you." One action: "Switch
     back" (select the locked avatar). Nothing else changes silently.
   - No judge fit check (decision 5); it is deferred to v2.9 (`v2.9/05-deferred-items.md` §05.5, user 2026-10-03).

## Activation sequence (one sequence for new chat, `selectStory` and `restartStory`)

This replaces the three different "before the opener" stories in the old briefing, persona and health-center plans
(review F10). The briefing modal and "Before you start" stay owned by v2.7 05 and v2.7 04; this is the order they run
in.

| Step | What | Required? | Owner |
|---|---|---|---|
| 0 | A chat is open and is a group chat. No chat: nothing (no-chat invariant). A solo chat: the story refuses (v2.7 03) | required | v2.7 03 |
| 1 | The story is resolved: a new empty chat in a bound group (`boundStoryForEmptyChat`), `selectStory`, or `restartStory` | required | runtime |
| 2 | **Readiness**: `blocks` findings for this story are listed in "Before you start" (missing cast, lore, fixed persona) | required (shown whenever any exist) | v2.7 04 |
| 3 | **Identity**: the "Who are you in this story" pane resolves and the chat lock is written | required, every activation | this plan |
| 4 | **Briefing** sections | optional: only when `display.briefing` is on and not yet seen | v2.7 05 |
| 5 | **Opener** (`new_chat_only` scripted reply, v2.5 plan 17) and the rest of `applyCheckpoint` | fires when `ready` and identity is settled | runtime |

- **One modal, panes in that order.** With `display.briefing` off, the modal still opens for steps 2–3 when it has
  something to show (a `player` block, a fixed name, a `blocks` finding). With nothing to show (no `player` block, no
  fixed name, no blocker) the identity step resolves without UI as Skip: the current persona is locked and "Playing as
  X" appears in the drawer Overview.
- **Identity gates the opener.** On a new chat the opener waits for `playerSetup` for this story and version, the same
  way it waits for `ready` (`effectsApplier.ts:255`). The opener then sees the chosen `{{user}}` name, and the greeting
  retrigger has nothing to clobber. There is no timeout: closing the modal (Escape, the close button) is Skip.
- **Fixed name.** `name.mode: fixed` with another persona selected makes `ready` false (step 2 shows the blocker). The
  identity pane offers only the personas with that name and "Create a persona named <name>". Readiness turns true on
  the lock, and the opener fires (the chat is still empty).
- **`selectStory` into a chat with messages and `restartStory`.** Same steps. No opener (the chat is not empty). A
  choice other than the current persona warns that earlier messages keep the old name. No `/persona-sync` (it rewrites
  history). Restart re-offers the full pane and writes a new lock.
- **S30-1 failure path.** If S30-1 shows that a persona switch or create on an empty bound group chat reloads the chat
  in a way that loses or duplicates the opener, the opener posts first (today's order), and step 3 then runs before
  the player's first message. A switch on a non-empty chat does not retrigger the greeting
  (`retriggerFirstMessageOnEmptyChat`), so pick and create stay available. Cost: an opener that says `{{user}}` keeps
  the old name; the Studio shows `opener-uses-player-name` (info) for such stories. Fixed-name stories are unaffected:
  readiness still holds their opener. This replaces the old decision 7 fallback ("after the opener, offering only lock
  and create for future chats"), which allowed a story to start unlocked.

## The "Who are you in this story" pane (`#so-player-setup`)

- Shows `role`, `summary`, `assumes`, and the current persona's name (not its description; it may be long or private).
- Choices; each one ends with ST's chat lock (`chat_metadata.persona`, `lockPersona('chat')` or `/persona-lock
  type=chat on`):
  - **Play as <current persona>** (default). Lock. `inject` applies.
  - **Choose another persona**: a list of existing personas; on pick, select (`setUserAvatar`) then lock. `inject`
    applies.
  - **Create a persona for this story**: name (prefilled from `name.value` or blank), description (prefilled from
    `suggested_description`, with the canonical role line first), shown in full, editable. One "Create and use" button: `/persona-create select=false`
    with a marked title (`title="Story: <story title>"`), then select and lock. Never edits or deletes an existing
    persona; never sets the default persona; never touches the persona lorebook. `inject` is off only under the
    equivalence rule above.
  - **Skip** = keep the current persona **and lock it**. Same outcome as the default choice.
- **State.** ST holds the lock; we record `extras.ui.playerSetup = {storyId, version, choice, avatarId, createdHash?}`
  beside `briefingSeen`. Rollback does not touch it (it is not message-scoped); reopen does not re-show the pane;
  Restart re-offers it.
- **Groups.** ST's chat lock works in group chats (it is chat metadata). The group reload on switch
  (`personas.js:1879`) is the main host risk and the subject of S30-1. Solo chats are not a target (v2.7 03).
- **Later reopening is informational.** The drawer Overview footer "Your character in this story" and `/story who`
  show the locked persona, role, summary and assumptions. They have no switch or create controls.
- **Mid-story switch.** A persona change in a chat with `playerSetup` (Persona Management, a slash command, another
  extension) raises `persona-switch` with "Switch back". ST's own chat lock also re-selects the locked persona on the
  next `CHAT_CHANGED`. Switching back clears the finding.
- **Older ST without `/persona-create`.** A capability probe (`stHost/capabilities.ts`, new `personaCrud`). Absent:
  the create choice is hidden with one line ("This SillyTavern version cannot create personas from here; create one in
  Persona Management, then choose it"). No direct `power_user` writes (answer to "whatever u recommend").
- **Multi-user installs.** Personas live in each user's settings; the pane reads the current user's context only.
  Assumed fine, checked once in the lane gate with a second ST user if the lane has one.

## Invariant changes needed

- architecture.md, wizard invariant: "Personas are never provisioned" becomes:
  > **The wizard never touches personas.** A persona is created only from the player's own click in the start-setup
  > step, with its exact name and description shown, and is only ever added: no edit, delete, default or lorebook
  > change. Every story start locks the chosen persona to the chat with ST's own chat lock; the story never switches it.
- `personaRequirementProblem`, `requirement-persona-missing` and the Repair "remove" action stay as they are for
  `requirements.personas`. Repair's "unselected" row gains "Open the setup step" (before the first player message
  only; afterwards it is the `persona-switch` finding).
- New: `player` text is player copy (spoiler diagnostics as for briefings; `so-ui assert-player-clean` sweeps the pane).

## Decisions for the user

1. A story `player` profile (role, summary, name mode, assumptions)? **Recommended: yes.**
2. Let the player create a persona from the setup step (create-only, their click, chat-locked)? **Recommended: yes**,
   with the invariant amendment above.
3. Default choice in the step: keep the current persona with the story block injected? **Recommended: yes**; the player
   opts into switching or creating.
4. `requirements.personas`: keep for named-persona stories, steer authors to `player` instead? **Recommended: keep,
   guide says prefer `player`.**
5. Judge "does this persona fit the story" check? **Recommended: not in this plan** (no calibrated use; deterministic
   checks only). **Decided 2026-10-03 (user: as recommended): deferred to v2.9**, `v2.9/05-deferred-items.md` §05.5.
6. Adolion: give each of the nine stories a `player` block (campaign step, content review by another model, not the
   user)? **Recommended: yes**, after this plan's format lands (v2.8 02).
7. Show the step before the opener on a new chat (needs S30-1)? **Recommended: yes.** Superseded in part by the
   answers: the step always runs and always locks; if S30-1 fails, the failure path in §Activation sequence applies
   (opener first, step before the first player message), not the old "lock and create for future chats" fallback.

## Gates

- **D (deterministic).**
  - Pure: validator, diagnostics (`opener-uses-player-name` included), the `playerRole` source order (`player.role`
    first), the `inject` equivalence rule (cases (a)–(e) above: off only while the live description carries the canonical line;
    the unrelated-description counterexample stays on), setup
    state under rollback, reopen and Restart, the deterministic fit and switch rules.
  - Registry: `persona-fit` and `persona-switch` are in `CHECKS` and pass the v2.7 04 registry tests.
  - Activation order: a jest case per entry path (new chat, `selectStory`, `restartStory`) asserts readiness → identity
    → briefing → opener; with `display.briefing` off the identity step still runs and still locks; a story without a
    `player` block locks silently.
  - UI: Storybook for the pane (390/768/1440, a11y), incl. the fixed-name and no-create (capability absent) variants.
  - Live on a **lane** (it writes personas), group chats only, scripted opener (v2.5 plan 17), no model call:
    - S30-1 spike: switch and create on a new bound group chat before and after the opener; record the greeting
      retrigger/reload and `chat_metadata.tainted`. Decides primary vs failure path.
    - The flow via new `so-ui` verbs (`player-setup`, `player-setup-choose keep|pick <name>|create|skip`): every choice,
      Skip included, leaves `chat_metadata.persona` set.
    - **An existing persona whose description lacks the story role**: pick it; the dry-run payload carries the
      `playerRole` block (F11).
    - **Mid-story switch and switch-back**: after two turns (scripted messages), switch persona; `persona-switch`
      appears with "Switch back"; clicking it restores the locked persona and clears the finding (D12).
    - **Reopen**: close and reopen the chat; the pane does not re-show, the lock holds; "Your character in this story"
      has no switch controls.
    - **Restart**: the pane is re-offered and a new lock is written.
    - **Fixed name**: the opener does not post until the fixed-name persona is locked; then it posts once.
    - **Briefings off**: `display.briefing` off, a story with a `player` block: the identity pane still shows and locks.
    - **Solo control**: a solo chat with the story's character; the story refuses, no pane, no lock written.
    - Harness: setup off by default like `display.briefing` (auto-Skip, which still locks); `so-assets` lists/removes
      marker-titled personas; `so-run-header` records `inventory.personas` and the chat lock.
  - Registered in the v2.7 01 feature registry + Help (registry test).
  - `npm run gates`.
- **RP (acceptance).** The injected block changes the reply prompt, so it rides the v2.8 final real-LLM suite on the
  RunPod main model (v2.8 rule 8). Not green until that runs.
- **Player-visible surface** (v2.8 rule 4): the pane exists by the user's 2026-10-03 decision; its copy is checked in a
  session card of the final suite before the plan is called accepted.

## Unresolved

- S30-1: does a persona switch on a fresh bound chat clobber or duplicate our opener (solo `createOrEditCharacter`,
  group `reloadCurrentChat`)? When is `chat_metadata.tainted` set? Not determined. Persona switch should be disabled within a story
  - Only the group path is tested (v2.7 03). The answer decides between the primary order and the failure path.
- Older ST without `/persona-create`: capability probe and fall back to `initPersona`-style direct writes, or refuse
  creation? Not determined. whatever u recommend
  - Taken: probe; hide create when absent (no direct writes).
- Multi-user ST installs: personas are per user directory; assumed fine, not verified. Persona should be handled per story per chat, with a user level persona as base. Check 32-living-cards
  - Taken: v2.7 20 `player.card` overlay; the base persona is never edited.

## Links

v2.7 05 story briefing (the modal), v2.7 04 health center (check registry, "Before you start"), v2.7 03 group-chats-only,
v2.7 01 docs (feature registry; guide pages: author topic `player`, player page "Your character"), v2.7 20 living cards
(`player.card`), v2.8 22 living story (`player.role`), v2.8 09 wizard assistant (tutorial: "the player is the persona"),
v2.8 02 Adolion campaign (`player` blocks), v2.5 plan 17 (scripted opener).

## Review of the answers (2026-10-03)

The user's notes in the open questions change the design in three places:

1. **No persona switching inside a story.**
   - The persona is chosen once, in the start step (keep / pick / create / skip), then locked to the chat for the story.
   - A persona switch while a story plays raises the v2.7 04 registry finding `persona-switch`: "This story was started
     as X; switching mid-story breaks what characters know about you". It offers "Switch back", and nothing else
     changes silently.
   - A Restart reopens the start step.
2. **Persona per story per chat, with the user's persona as the base.**
   - The user's ST persona is the base identity. What the story changes about the player (looks, status, titles) lives
     in v2.7 20's overlay under `player.card`, per chat.
   - The ST persona is never edited, so a new chat starts from the base persona.
   - This replaces option (a)'s "adapt for this chat" idea.
3. **Solo chats are out** (v2.7 03), so only the group reload path matters for spike S30-1.

The remaining decisions (1–7) and the "whatever you recommend" question are taken as recommended:
- creation is create-only by the player's click;
- deterministic checks only;
- Adolion gets `player` blocks after the format lands;
- the step goes before the opener if S30-1 shows it is safe; otherwise the failure path in §Activation sequence.

## Review 2026-10-03

Applied from `v2.7/review-2026-10-03.md`:
- **F01**: status line and gate tiers rewritten.
- **F08**: solo removed from flow and S30-1; solo only as a refusal control in the live gate.
- **F09**: every choice locks, Skip = keep + lock; reopening informational; gates for mid-story switch, switch-back,
  reopen, Restart.
- **F10**: §Activation sequence (one order for all three entry paths; identity required, briefing optional; S30-1
  failure path; fixed-name case; briefings-off gate). Old decision 7 fallback replaced.
- **F11**: `inject` stays on for existing personas; off only on an explicit, hash-checked equivalence; gate case added.
- **D12**: mid-story switch + switch-back gated; opener = v2.5 plan 17; `player.card` ↔ v2.7 20.
- **D9**: `persona-fit` and `persona-switch` are v2.7 04 registry entries delivered here.
- **C10**: `living.player_role` (v2.8 22) → `player.role`.
- **B10**: registry + Help gate row.
- **Line refs** (ledger "30 line refs"): checked against master `c7967323`; fixed `schema.ts:322/385`,
  `storyOptions.ts:10,29`, `repair.ts:196-221/:223`, `provisioning.ts:13-20`, `castDiagnostics.ts:13,105/11,120`,
  `playerRole.ts:17-44`, `playerCast.ts:20-25`, `agency.ts:20`, `snapshotBuilder.ts:50`; added `effectsApplier.ts:255,509`
  and `checks.ts`. Not re-checked: `story-guide.md` lines and every ST host line (from the original draft).

Round 3 (Sol): R3-03 applied.
