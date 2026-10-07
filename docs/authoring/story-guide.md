# Writing a story for Story Orchestrator

This guide is for the person who writes the story: the premise, the turning points, the cast and what has to be true to move on. It covers every field a format-2 story can carry, what each one does while someone plays, what a good one looks like, what a bad one looks like, and what goes wrong when it is missing or mistaken.

You do not need to read it top to bottom. The Studio shows the matching section under "How to write this" on each editor, and the wizard's agent reads the same sections through its `readGuide` tool. Each section below is one guide topic; the marker under its heading is the topic's name.

Where the guide says "the reading model" it means the memory model that reads the chat after each turn and fills in the story's qualities. Where it says "the judge" it means the small judgment model, which picks from lists. Where it says "the narrator" it means the model that writes the replies the player reads.

Sources of truth: the schema is `src/engine/schema.ts`, the parser is `src/engine/validate.ts` and `src/engine/validate/*.ts`, the agency defaults are `src/engine/agency.ts`, and the Studio checks are `src/studio/diagnostics.ts` (`DIAGNOSTIC_CONSEQUENCES`), `src/studio/authoringDiagnostics.ts` and `src/studio/chapterDiagnostics.ts`. If this guide and the code disagree, the code is right and this guide is a bug.

## How a story plays

A story is a graph of beats (checkpoints) joined by exits (transitions). Each exit has a condition (a gate) over the story's tracked facts (qualities). Exactly one beat is active at a time.

After each reply the reading model reads the recent chat and proposes changes to the qualities, each backed by a quoted line. The changes are applied at the next turn boundary, after a reply has finished. Then the exits of the active beat are checked; when one opens, the story moves to the next beat and that beat's effects run (lore switches on, the cast changes, a background appears, a character speaks). One exit fires per turn.

Two things follow, and most of the advice below comes from them:

- **The story only knows what the chat shows.** A gate on a thought, a mood or something that happened off screen never opens, because nobody can quote it.
- **The chat can be rewound.** Swipes, edits and deletions roll the story back. Effects are rebuilt from the path the chat took, so they must depend on the path, never on the clock.

## Part 1: the fields

### Title, description, id and version
<!-- topic: story-basics -->

Fields: `title`, `description` (both required), `id`, `version`, `player_intro`, `kind` (`schema.ts` `StoryV2`, `validate.ts` `readHeader`, `validate/storyOptions.ts` `readStoryOptions`, `engine/briefing.ts` `storyKind`).

- **What it does.** `title` and `description` tell the narrator, the wizard and the author what the story is. `player_intro` is the text a player reads before the first beat. `id` is the story's identity: a lowercase slug (letters, digits, `-`, `_`, at most 64 characters) that the library and every chat key the story by. `version` is a whole number from 1 that rises with each save. `kind` is `"saga"` or `"story"` (the default when absent): a saga gets its own icon and label on the group list, recent chats and the Continue list. Only those player badges read it; the model never does. Chapters do not make a story a saga: a single act split into chapters is still a `story`.
- **Good.** `"title": "The Pawnbroker's Debt"`, a two-sentence description of the premise and the stakes, and a `player_intro` that sets the scene without the twist. `"kind": "saga"` only on the story that plays a whole campaign.
- **Bad.** A description that is the plot outline with the ending in it; a `player_intro` that names the culprit; `"kind": "saga"` on every act of a campaign, so the badge no longer tells the campaign from its acts.
- **If wrong.** Each chat pins a full copy of the story it plays. Changing the `id` after chats play the story makes a different story: the old chats keep the old copy and never see your edits. A story without an `id` gets one derived from its title on first save. A `kind` other than `"saga"` or `"story"` is refused and the story does not load (`story-kind-invalid`).

### Briefing
<!-- topic: briefing -->

Fields: `briefing` (`title`, `image`, `sections[]` of `{heading, text}`, `tone`, `start_label`) and `chapters[].briefing` (`schema.ts` `StoryBriefing`, `validate/briefing.ts`, `engine/briefing.ts`).

- **What it does.** The "Before you start" modal shows it once, the first time the story starts in a group chat (a new chat in a bound group, choosing the story, or Restart). Sections stack under the title, `tone` sits under the title as a content line, `image` is a SillyTavern background file shown above them, and `start_label` names the button ("Begin" by default). It is plain text: paragraphs split on blank lines, no macros (`{{user}}` is refused), no HTML. The model never reads it, and the opening scene posts whether or not the player has closed it. Each chat remembers that it was shown; Restart shows it again, a story update does not. A player re-opens it from "Story briefing" in the drawer or with `/story intro`, and can switch it off under Display. At most 6 sections of 1,200 characters each. A chapter's `briefing` has the same shape and belongs to that chapter's opening. With no `briefing`, the modal shows `player_intro` as one section; the author's `description` is never shown. Whether a story is a saga is its authored `kind` (see Title, description, id and version), never its chapter count.
- **Good.** The world, who the player is, who travels with them, and how to play, in what the player may know at the start: `{"heading": "Who you are", "text": "A courier with a debt and a sealed letter."}`.
- **Bad.** A section that names a later checkpoint, an outcome, or a character who is not in the scene yet; "Who is with you" listing a member the start mutes.
- **If wrong.** The player reads the spoiler before the first line (diagnostic `briefing-spoiler-risk`: "The player reads this before it happens, so it may give away a scene, an outcome or a character still ahead."; raised when the text names a later checkpoint or its id, a story value the start has not set, or a character the start switches off). A picture the install lacks shows nothing (`background-missing`).

### Who the player is
<!-- topic: player -->

Fields: `player.role`, `player.summary`, `player.name` (`{mode, value}`), `player.assumes`, `player.suggested_description`, `player.inject`, and `player.card` (living cards) (`schema.ts` `StoryPlayer`, `validate/player.ts`, `engine/player.ts`, `runtime/playerSetup.ts`).

- **What it does.** Says who the player plays in this story. `role` is one line ("a hired adventurer"); `summary` is player copy in the second person; `assumes` lists what the story takes for granted ("can fight", "does not know the city's politics"); `name.mode` is `any` (the default), `suggested` (`name.value` is offered when the player creates a persona) or `fixed` (the story only works with that name: it waits to start until a persona of that name is selected, the one case where `player` blocks anything); `suggested_description` prefills "Create a persona for this story". The first time the story starts in a group chat, the start page shows "Who you are in this story" with the role, summary and assumptions, and the player keeps their persona, chooses another, or creates one (only on their click, the name and description shown in full first; a persona is only ever added, never edited or deleted). Every choice, closing the page included, locks that persona to the chat with SillyTavern's own chat lock, and the opening scene waits for it. With `display.playerSetup` off, or a story without `player`, the current persona is locked without asking. Switching persona mid-story raises "This story was started as X; switching mid-story breaks what characters know about you" with a "Switch back" button. Unless `inject` is `false`, the reply prompt carries one line, "In this story, {{user}} is <role>: <summary>", and it stays on for every kept or chosen persona; it turns off only while the persona's own description already holds that exact line (a persona created from the start page starts with it). `/story who` and "Your character in this story" in the drawer show it again. Prefer `player` to `requirements.personas`, which only names a persona that must already exist.
- **Good.** `{"role": "a hired adventurer", "summary": "You are new to the city, with a sword, a little coin and no name anyone knows.", "assumes": ["can fight"], "name": {"mode": "any"}}`.
- **Bad.** A summary that names the villain or a later checkpoint; `name.mode: "fixed"` on a story that only needs a role (every player must then make that persona first); a role that is also a cast member's card ("The Pawnbroker" in both).
- **If wrong.** The player reads a spoiler before the first line (diagnostic `player-spoiler-risk`: "The player reads this at the start, so it may give away a scene, an outcome or a character still ahead."). A scripted opening line that says `{{user}}` shows the persona chosen at the start (diagnostic `opener-uses-player-name`, info). A persona with a cast member's name makes that character speak as the player (Repair `persona-fit-cast`); the role also feeds `roster-member-is-player`.

### Dramatic shape
<!-- topic: arc-template -->

Field: `arc_template` (`schema.ts` `ArcTemplate`, `validate/storyOptions.ts` `readArcTemplate`).

- **What it does.** The expected tension over the story's progress. Each turn the measured tension is compared with the curve and the narrator is told one line: escalate, hold or ease off. It takes `rising`, `fall_recovery`, `three_act`, or a custom `{ "points": [{ "at": 0, "tension": 0.1 }, …] }` with both numbers from 0 to 1.
- **Good.** `rising` for a heist that builds to the vault. A custom curve that dips after the battle and climbs to the finale (the Adolion adventurer story uses one).
- **Bad.** A custom curve with one point, or a curve that sits at 1 for the whole story.
- **If wrong.** A point outside 0 to 1 is a load error. Without a shape, pacing steers only by each beat's tension target.

### Requirements
<!-- topic: requirements -->

Fields: `requirements.personas`, `requirements.members`, `requirements.lorebooks` (`schema.ts` `StoryRequirements`, `validate/storyOptions.ts` `readRequirements`; any other key is an error).

- **What it does.** What the SillyTavern install must provide before the story's effects run: the player personas it expects, the group members it directs, and the lorebooks that must be active. Until they are met, checkpoint effects wait and the settings panel's Repair step names the first thing missing. "Fix with wizard" can create missing cards and the story's own lorebook (never a persona).
- **Good.** `{ "members": ["Adolion Narrator", "Tobias", "Belle"], "lorebooks": ["Adolion World", "Adolion Adventurer Checkpoints"] }`: card names exactly as SillyTavern lists them, and every book the story's lore effects or lore select rely on.
- **Bad.** `{ "members": ["dm", "guild_rep"] }`: roster ids instead of card names.
- **If wrong.** The story never reads as ready and its effects stay deferred (diagnostic `requirement-member-roster-id`: "The story never reads as ready: it waits for a character named by a cast id, while the card has another name."). Seen live: the wizard wrote roster ids and the story never read as ready in the group the wizard had just built (seen in a test session). A required lorebook counts as present when SillyTavern scans it for this chat (global selection, the chat's slot, the persona, or a card bound on every enabled member), not merely when it exists on disk. A required persona must already exist on the install: personas are the author's own and nothing creates one, so leave `requirements.personas` out unless the story truly needs a named persona, and say who the player is with `player` instead (see Who the player is) (diagnostic `requirement-persona-missing`: "The story never reads as ready, so its start effects never run: it requires a persona this install does not have, and nothing creates one."). Seen live: the staged wizard required "The Apprentice", the saved story never started and Repair named only "a different player character" (seen in a test session).

### Cast
<!-- topic: roster -->

Fields: `roster[].id` (required), `name`, `role`, `aliases`, `view` (`schema.ts` `RosterMember`, `validate/checkpoints.ts` `readRoster`). `drive` has its own section.

- **What it does.** The characters this story directs. `id` is the story's handle for the character (used by motives, member guidance and macros such as `{{story_role_<id>}}`); `name` is the card name. `role` is one line of what they do in this story; speaker direction and the judge director pick by it, and the judge director runs only when every candidate has a role. `aliases` are other names the player uses ("the captain", a surname); an alias that two members share, or that is another member's name, is ignored. `view: "omniscient"` makes a narrator see every character's private rows so it can foreshadow; the default `own` sees only its own.
- **Good.** `{ "id": "guild_rep", "name": "Tobias", "role": "guild receptionist at the quest counter: hands out postings and pays rewards", "aliases": ["Tobias Eldergreen"] }`, and one narrator with `"view": "omniscient"`.
- **Bad.** A roster without roles; the player's own persona in the roster; a card for the role the story gives the player (a greeting that says "You are the pawnbroker" and a roster member "The Pawnbroker"); two members sharing the alias "the guard".
- **If wrong.** Without roles the judge director falls back and the rules pick the speaker (`ADAPT-v2.5.md` finding in the campaign repo). A role that describes the plot rather than the character steers the wrong person into the scene. A cast member who is the player speaks the player's part and then other characters' lines: the Pawnbroker card narrated the player's role and posted the Queen's Agent's line (seen in a test session). Diagnostic `roster-member-is-player` ("Another character speaks as the player: the story casts the player's own role as someone else.") flags a member whose name is the persona, or the role the description, player introduction or a scripted opener gives the player ("you are the …", "the player is a …"); the wizard's agent refuses such a card or member, reading its cards' first messages too.

### Drives and motives
<!-- topic: drives-motives -->

Fields: `roster[].drive`, `checkpoints[].motives` (an object of roster id to text) (`schema.ts`, `validate/checkpoints.ts` `readMemberText`, `readMotives`).

- **What it does.** A drive is what a character privately wants across the whole story. A motive is what they want at one beat. Both are injected only into that character's private block when they are drafted to speak ("What you want: …", "Right now: …"), and never shown to the player.
- **Good.** Drive: `"match adventurers into parties that hold together"`. Motive at the guild hall: `"size up these strangers and find out whether they would stand their ground"`. One line each, in the character's own interest.
- **Bad.** `"Lead the player to the ruins"` (a plan for the player), `"Be mysterious"` (a stage direction), or a motive keyed `player` or `{{user}}`.
- **If wrong.** A motive for the player's persona is dropped (`motive-for-player`: "The player's choices are theirs, so nobody is told this motive."); a key no cast member has reaches nobody (`motive-member-unknown`). Without motives characters drift: in T3 three characters "had no motive of their own and repeated themselves" (seen in a test session).

### Qualities
<!-- topic: qualities -->

Fields: `qualities[].key`, `type`, `values`, `source` (all but `values` required, plus `rubric`) (`schema.ts` `Quality`, `validate/qualities.ts` `readQuality`).

- **What it does.** The typed facts the story tracks and gates on. `type` is `int`, `float`, `bool`, `enum` (with `values`) or `string`. `source: "extractor"` means the reading model scores it from the chat; `source: "code"` means only the engine sets it (rolls, counters, convergence progress). The engine adds two of its own: `tension_current` and one `progress_toward_<anchor>` per anchor.
- **Good.** `{ "key": "mission_accepted", "type": "bool", "source": "extractor", "latching": true, "rubric": "Did the party accept the Sun Ruins mission from the board?" }` (`examples/sun-ruins/quest-for-the-sun-ruins.json`).
- **Bad.** A `string` quality for something with three possible answers; a quality that no gate or snapshot reads.
- **If wrong.** The reading model is only asked about qualities some gate or snapshot ahead of the player uses, so an unused quality is never read (`quality-never-in-scope`: "Nothing can react to this, because the story is never asked about it."). Free text reads unreliably; a closed list turns a misread into "wrong value from a known list", which is detectable.

### Rubrics
<!-- topic: quality-rubric -->

Field: `qualities[].rubric` (required).

- **What it does.** The question the reading model answers from the prose, with its scale. It is the only instruction the model gets for this quality, and every gate on the quality inherits it.
- **Good.** `"Has the party made camp for its first night on the road north to Wendhope?"` A latching choice that says when to stay silent: `"Which posting has the party committed to? Answer wendhope once … Until they actually commit, say nothing about this quality at all."` (Adolion adventurer `path`).
- **Bad.** `"Mara's attitude"`; a question about a name the player has never heard in the fiction; a rubric that disagrees with the transition's `extraction_hint`.
- **If wrong.** The gate stalls. Seen live: `reached_walls` required being "challenged by its archers"; the narrator wrote empty parapets and the story stalled 14 boundaries (seen in a test session). `acad_path` asked the player to "commit to the Witch King thread" before the fiction had named him; four turns of digging left it unset (found in a test session). Test each rubric against the card's own sample lines: "No. I won't duel Leevon for your politics." did not set `duel_refused` until a second refusal (same source).

### Latching and monotonic
<!-- topic: latching -->

Fields: `qualities[].latching`, `qualities[].monotonic`, and their interaction with `checkpoints[].state_snapshot`.

- **What it does.** `latching: true` makes the first confident read final: an oath, a decision, a door opened. A latching bool latches only on `true`; a `false` can still be overturned. `monotonic: true` lets a number only rise: progress, trust earned, clues found. A missed reading then corrects itself next turn instead of reverting.
- **Good.** `{ "key": "path", "type": "enum", "values": ["wendhope"], "latching": true }`: the unset state is the absence of a value.
- **Bad.** `{ "type": "enum", "values": ["undecided", "accepted", "declined"], "latching": true }`.
- **If wrong.** A latching enum that lists a placeholder (`undecided`, `none`, `pending`, `unset`, `tbd`; `schema.ts` `PLACEHOLDER_ENUM_VALUES`) latches on the first read, which is the placeholder, and never changes (`latching-enum-placeholder`). In the campaign the arc never started; five qualities in two stories had it (memory note `story-authoring-traps.md`, campaign `INTEGRATION.md`). The same list is fine without `latching`: sun-ruins `luke_decision` keeps `undecided` and does not latch. A snapshot that sets a latching value conflicts with any later gate on a different value (`snapshot-latching-conflict`).

### How a quality is read
<!-- topic: quality-reads -->

Fields: `read_as`, `criteria`, `player_labels`, `evidence_from`, `commit_evidence`, `scope_hint`, `ledger_binding` (`schema.ts` `Quality`; `validate/qualities.ts` `readQualityRead`, `readEvidenceFrom`, `readCommitEvidence`, `readPlayerLabels`).

- **`read_as` and `criteria`.** Opt a plainly visible extractor quality into the judge's every-turn read: `choice` (bool or enum), `stated` (a number or a name the text states; takes no criteria), `rating` (a scale; needs `criteria.levels` or a rubric reading "from N (low) to M (high)"). `criteria` say what each option means, as text or `{ what, not_for, examples }`; `not_for` is where misreads are stopped. A latching quality read this way is written only at confidence 0.9 or more (`quality-hint-latching-note`), and a choice with bare one-word options and no criteria may be read loosely (`quality-hint-no-criteria`). Good: Adolion `spirit_outcome` with `destroyed: { what: "The heartwood was cut, burned or shattered", not_for: "Wounding the heartwood mid-fight, or only threatening to cut it." }`. Bad: an option whose `not_for` is the option itself (`quality-criteria-self-exclusion`), or `rating` with no scale (`quality-rating-no-scale`: never read).
- **`player_labels`.** The words a player reads for each enum value. Without them a player sees raw ids like "At aegis_guild_hall." (`14-findings.md`, T0 player surfaces).
- **`evidence_from`.** Who may prove the value: `any` (default), `world` (only what the world does; the player's own line cannot prove it), `party` (the party's own moves, which the player's line may state). An outcome that opens an anchor should usually be `world` (`quality-outcome-player-evidence`: "A player's line alone can move the story here: writing that they did it counts as done."). A party move under `world` stalls: "We go down" was rejected 16 times in T2-1 and `deep_set_out` stalled six turns at the North Gate (`14-findings.md`, T2-1/3/5 and T3-1 fix waves).
- **`commit_evidence`.** A regular expression the quoted evidence must match before an extractor quality may be set, for values that mean a commitment. It exists because a companion's aside ("perhaps our friend Dalan") latched `path` too early (campaign `docs/STORY-TUTORIAL.md`). Cover the natural ways to accept: recall rose from 0.68 to 0.98 once `we ride`, `deal`, `agreed` were added, while a bare `we'?ll go` let "We'll go to the bar first" commit (`14-findings.md`, T0 and T1). It is matched case-insensitively and `\b` is ASCII only.
- **`scope_hint`.** `{ from, until }` narrows where the quality is asked about. It is an optimisation only; never narrow past a gate that needs the reading (`quality-out-of-scope`). The campaign scopes each arc's qualities from the arc's first beat so the lobby does not read every arc at once (`PLAN.md`).
- **`ledger_binding`.** `{ entity, field }` mirrors the value into the state ledger (for example the party's rank). Only extractor qualities may bind.

### Chance rolls
<!-- topic: chance-roll -->

Field: `qualities[].roll` (`schema.ts` `QualityRoll`, `validate/qualities.ts` `readRoll`, `engine/chance.ts`).

- **What it does.** `{ sides, target }` rolls a seeded die each time a beat is entered: a bool is true when the face is at or under `target`, an int takes the face. The draw depends on the chat, the story, the beat's entry and the key, so a swipe, a rollback and a reopened chat all read the same result.
- **Good.** `{ "key": "wall_breached", "type": "bool", "source": "code", "roll": { "sides": 6, "target": 2 }, "rubric": "Seeded chance: does a stretch of Wendhope's wall give way tonight?" }`, gated together with something the player drives, with each branch rejoining the story.
- **Bad.** A roll on an extractor quality or a string (a load error: "only code qualities are rolled"); a roll that overturns an outcome the player earned.
- **If wrong.** A roll that decides the player's act instead of the world takes the story away from the player. The campaign rule is that a roll decides the world, never the player, and can be blocked with a `not` leaf (`docs/ACT-GUIDE.md`; review items in `14-findings.md`, SP7.b).

### Checkpoints
<!-- topic: checkpoints -->

Fields: `checkpoints[].id`, `name`, `objective`, `type` (all required), `start`, `state_snapshot`, `player_name`, `player_text`, `target_turn_length` (`schema.ts` `Checkpoint`, `validate/checkpoints.ts` `readCheckpoint`).

- **What it does.** A beat. `type: "anchor"` beats are authored and guaranteed; `type: "intermediate"` beats are bridges and must lead on to an anchor. Exactly one beat has `start: true`. The `objective` is one sentence of what the beat is for; unless the beat has its own author's note, it is injected as an objective line. `state_snapshot` is what the story expects to be true while the beat is active (a generation target, not a write). `player_name` and `player_text` are what the player sees for the beat. `target_turn_length` is how many turns the beat should breathe; a stall re-read starts only after the larger of one and a half times that and six turns.
- **Good.** `{ "id": "guild-hall", "name": "The Guild Hall", "objective": "Take a posting and form a party.", "type": "anchor", "player_name": "The Wendhope Job", "tension_target": "calm", "target_turn_length": 5 }`.
- **Bad.** An objective that narrates the outcome; a `player_name` that tells the player what will happen there.
- **If wrong.** `player_name` shows to the player, so "Sophie's Deliveries" foreshadowed the errand (`14-findings.md`, T3-4/T3-6). Keep player copy short (the campaign holds it to 48 and 200 characters), true on every path in, and free of macros and spoilers. An intermediate with no anchor beyond it is a load error; a generated stub with no anchor beyond it is `stub-no-anchor`.

### Objectives and player agency
<!-- topic: objective-agency -->

Fields: `checkpoints[].agency` (`protect_player_choice`, `never_narrate_player_action`, `objective_kind`, `alternate`, `player_attempts_only`) and the story's `objective_block` (`schema.ts` `AgencyPolicy`, `engine/agency.ts`, `validate/checkpoints.ts` `readAgency`).

- **What it does.** The defaults are the policy, even when `agency` is absent (`DEFAULT_AGENCY`): narration never writes the player accepting what they refused or going where they declined, never writes the player's own words and decisions, and the objective is world pressure. `objective_kind: "world_pressure"` lets the world press, answer and escalate without the player's compliance. `objective_kind: "player_action"` makes the world present the situation and the choice, then stop. `alternate` names a beat to recover to when the player refuses the prepared route. `player_attempts_only` makes the world decide whether the player's stated attempt works. `objective_block: "off"` stops the objective line being injected story-wide.
- **Good.** `"agency": { "objective_kind": "player_action", "player_attempts_only": true, "alternate": "the-sheridan-steward" }` at a beat where the player must choose a side. The `alternate` is an intermediate that rejoins the story.
- **Bad.** `alternate` naming the beat itself; `player_action` on a beat that should advance whether or not the player engages.
- **If wrong.** An unknown `alternate` leaves a refusal nowhere to go (`agency-alternate-unknown`); one naming the beat sends the player back into it (`agency-alternate-is-self`). A story with no `alternate` anywhere is a rail (campaign `ADAPT-v2.5.md`). Guidance that scripts a schedule ("servants lead the party…") produced a time skip the player never chose (`14-findings.md`).

### Open stretches
<!-- topic: open-stretches -->

Fields: `checkpoints[].stretch` (`mode`, `pace`, `pull_after`, `max_turns`, `arrive_when`) and the code quality `player_turns_in_checkpoint` (`schema.ts` `CheckpointStretch`, `engine/stretch.ts`, `validate/stretch.ts`).

- **What it does.** `stretch: { "mode": "open" }` on an intermediate makes it free play between two fixed points: no objective line is injected there (the story's `objective_block` still governs every other beat), it is never expanded into a beat chain, and a long quiet run is neither a stall re-read nor a refusal. The narrator is told to follow what the player starts. `pace` (`brief`, `unhurried`, `long`) sets `pull_after` to 3, 6 or 10 **player turns** (a group round of several replies to one player line is one turn); an explicit `pull_after` wins. Past it the world pulls gently toward the next place with hooks (gentle, then steady three turns later); `max_turns` only makes the pull plain, and never moves the party or narrates the move. The player leaves by their own move: `arrive_when` is the arrival gate, and it must be the gate of one of the stretch's exits. Declare `player_turns_in_checkpoint` as an `int` with `source: "code"` to read the count in gates or macros.
- **Good.** `{ "id": "on-the-road", "name": "On the road", "objective": "", "type": "intermediate", "stretch": { "mode": "open", "pace": "unhurried", "arrive_when": { "q": "reached_walls", "op": "==", "v": true } } }` with the exit `on-the-road → walls` gated on the same `reached_walls == true`.
- **Bad.** An open stretch whose exit waits on `progress_toward_<anchor>` or carries a progress effect (refused: a filled counter ending a scene is the corridor this mode removes); `player_text` on an open stretch (refused: the player sees the scene name, never a task).
- **If wrong.** `pressure`, `offer` and `trigger` are refused as not built yet: complications and encounter pools wait for their measurements (v2.7 35). An `arrive_when` that matches no exit is a load error, so the stretch cannot trap the player.

### Tension targets
<!-- topic: tension -->

Field: `checkpoints[].tension_target` (`calm`, `stirring`, `tense`, `critical`, `peak`).

- **What it does.** The tension the beat aims for. Tension is read as one of the five levels each turn, smoothed, and compared with the target and the dramatic shape; the narrator gets a one-line steer.
- **Good.** `calm` at the guild hall, `stirring` when the posting is taken, `critical` in the ambush, `peak` at the finale.
- **Bad.** Every beat at `peak`; a target at odds with the beat's objective (a quiet negotiation at `critical`).
- **If wrong.** Pacing pushes the narrator the wrong way. The measured scale also overshoots on calm play (T1-6 recorded a calm scene climbing toward "critical"), so do not rely on a gate over `tension_current` for a quiet beat.

### Narrator guidance
<!-- topic: guidance -->

Field: `checkpoints[].guidance`: text, or `{ "all": text, "members": { <roster id or name>: text } }` (`schema.ts` `MemberGuidance`, `engine/checkpointGuidance.ts`).

- **What it does.** Private direction for how the beat plays. Plain text and `all` reach every generation in the beat. A member's entry is staged only while that member is drafted to speak, never at rest and never for quiet or impersonate runs.
- **Good.** `"Two days of road. Let {{story_role_companion_a}} and {{story_role_companion_b}} take initiative beside {{story_player_name}}."` Three to six sentences of pressure and intent. Secrets in the member's own entry: `"members": { "bartender": "Rydel has noticed Tatiana's crush…" }`.
- **Bad.** `"At dawn the fog withdraws and reveals the spirit."` (an ending, which a reply paraphrased as a spoiler; `14-findings.md`, T0); a secret in shared guidance; calling the player "the player" (characters then called them "the player" in 10 of 16 replies; `14-findings.md`, T1).
- **If wrong.** A member key no cast member has reaches nobody (`guidance-member-unknown`). Openings and guidance that end on "What do you do?" teach the narrator to end every reply on a question.

### Author's note
<!-- topic: author-note -->

Field: `effects.author_note`: text, `null`, or `{ text, role, position, depth, interval }`, with `inject_blackboard: true` to append the story's state memo (`runtime/effectsApplier.ts` `authorNoteText`, `applyAuthorNote`).

- **What it does.** Written into SillyTavern's Author's Note when the beat starts, so it steers every reply in the beat. `role` is `system`, `user` or `assistant`; `position` is `before`, `after` or `chat`; `depth` and `interval` are SillyTavern's own. `null` clears the note.
- **Good.** Sun-ruins: `{ "text": "[Keep the pacing relaxed. Describe the guild tavern's noise …]", "position": "chat", "depth": 4, "interval": 3, "role": "system" }`. The current campaign sets `"author_note": null` on the start beat only, to clear a stale note, and steers through objectives and guidance instead.
- **Bad.** A note on one beat and none on the next, when the old note no longer fits.
- **If wrong.** A beat without its own note keeps the previous beat's (`checkpoint-inherits-author-note`: "The model keeps being told an earlier checkpoint's note here."). While a beat has its own note the objective line is not injected (`engine/agency.ts` `objectiveLineApplies`), which is why the campaign's act guide says not to add checkpoint notes.

### Beat lore
<!-- topic: world-info -->

Field: `effects.world_info`: `{ "enable": [{ "lorebook": "<book>", "comments": ["<entry title>", …] }], "disable": [ … ] }` (`engine/worldInfoEffects.ts` `readWorldInfoEffect`).

- **What it does.** Switches lorebook entries on and off along the story's path. Every entry any beat names belongs to the story (its gated set). The set rests off, and on every apply (a new beat, a reopened chat, a rollback, a story swap) it is rebuilt by replaying the chat's path from the start, so a reopened chat ends in the same state as a continuous one. Entries outside the set are never touched.
- **Good.** `{ "disable": [{ "lorebook": "Adolion Adventurer Checkpoints", "comments": ["CP guild-hall - Scene"] }], "enable": [{ "lorebook": "Adolion Adventurer Checkpoints", "comments": ["CP the-sheridan-steward - Scene"] }] }`, with the book generated from the same source as the story so a title can never name a missing entry (`INTEGRATION.md`).
- **Bad.** A secret in a constant entry with no character filter, which every drafted member reads: Erevan named the plant in T3-1 (`14-findings.md`, T3-1 fix wave). The effect only toggles entries; it has no per-member target, so make a secret narrator-only or keyed.
- **If wrong.** With per-chat gating these entries stay off in their files, show as off in SillyTavern's lorebook editor and stay off with the extension disabled (`world-info-rests-off`). An entry named by a misspelt title is simply not found. Require the book under `requirements.lorebooks`.

### Preset
<!-- topic: preset -->

Field: `effects.preset`: a preset name, or `{ name, settings }` (`runtime/effectsApplier.ts` `resolvePreset`; `runtime/samplerOverlay.ts`).

- **What it does.** A per-request sampler overlay for this beat's replies. A name is matched exactly against the connection's own presets (never fuzzy); `settings` carries the samplers inline. Only samplers the request already sends are overlaid, only on the player's visible replies, only while the beat is active. The selected preset is never changed.
- **Good.** A slightly hotter sampler for a dream sequence: `{ "name": "Dream", "settings": { "temperature": 1.1 } }`.
- **Bad.** A preset name that exists only on another API, or one that carries no sampler the connection sends.
- **If wrong.** The effect is refused with a reason in the journal, and the beat plays with the normal samplers. Text Completion and Chat Completion connections only.

### Background
<!-- topic: background -->

Field: `effects.background`: a file name, or `{ name }` (`schema.ts` `BackgroundEffect`, `validate/checkpoints.ts` `readBackground`).

- **What it does.** Switches SillyTavern's background when the beat starts, and again when the chat is reopened.
- **Good.** `"background": "tavern day.jpg"`, a file the install has (the wizard's `lookupBackgrounds` lists them).
- **Bad.** A background whose picture shows the twist; a name invented for the scene (`pawnshop_interior`) that no file carries.
- **If wrong.** A name the install lacks does not switch anything (diagnostic `background-missing`: "The scene does not change: the install has no background by that name."; checked against the install's list, with or without the file extension, when the Studio knows it).

### Scenario
<!-- topic: scenario -->

Field: `effects.scenario`: text, or `""` / `null` to clear (`schema.ts` `CheckpointEffects`, `validate/checkpoints.ts`, `runtime/storyScenario.ts`).

- **What it does.** Sets the chat's own scenario text (`chat_metadata.scenario`) along the played path: text sets it, `""` or `null` clears it, and a beat without the key keeps what the path before it set. In a group SillyTavern then sends this one text instead of every member card's scenario. It waits with World Info until the story's requirements are met. A `/cp activate` jump plays the target's own value, so a jump target that authors none plays with the chat's scenario from before the story. A scenario the user typed into the chat is never overwritten; restarting or removing the story puts back what the chat held before.
- **Good.** Framing only: genre, places, the arc's name (the campaign sets one per beat): `"scenario": "Aegis City in autumn. The guild hall is the party's base."`
- **Bad.** A `scenario` with the final foe or a secret in it: every member's prompt carries it.
- **If wrong.** A story that sets none leaves every member card's scenario in the prompt at once; the author view names those cards ("N character card scenario(s) frame this chat and the story sets none").

### Cast changes
<!-- topic: cast-changes -->

Field: `effects.cast_changes`: `{ "enable": [card names], "disable": [card names] }` (`runtime/effectsApplier.ts` `applyCastChanges`).

- **What it does.** Mutes and unmutes group members when the beat starts. Only enabled members respond. It changes the group itself, which outlives the chat, and it is restored when the chat leaves the story.
- **Good.** The start beat disables everyone who enters later; each later beat enables the characters who enter there: sun-ruins `cp1` disables `Ponticius` and `Luke`, `cp2` enables `Ponticius`.
- **Bad.** Disabling a companion the player has just recruited, because the beat's list was written before play.
- **If wrong.** The authored list always wins over what happened at the table: Talis was taken along and then dropped by the next beat's disable (`14-findings.md`, T1). If play can recruit someone, gate the cast change on a quality play sets. Put every enabled character the player may address into the beat's speakers. A name with no card on the install switches nothing (diagnostic `cast-member-no-card`: "This character never joins the scene: there is no card by that name, so it cannot be switched on and the story never reads as ready."; it also covers `requirements.members`). A cast change may name a cast member by card name or by roster id (the id resolves to the member's name); an entry that is neither changes nobody (diagnostic `cast-change-unknown-member`: "This cast change switches nobody on or off: the name matches no cast member, so whoever it meant stays as they are."). Everyone a checkpoint switches off needs a checkpoint that switches them on again, or they stay muted through their own scenes (diagnostic `cast-member-never-enabled`: "This character stays muted for the rest of the story: a checkpoint switches them off and no checkpoint switches them back on."; seen live in a test session). The wizard's agent cannot finish while a cast member has no card or the cast it created has no group (`T5-2-2`: "done" with 2 of 5 cards and Diagnostics reading "No issues").

### The opening scene
<!-- topic: opening-scene -->

Fields: each card's `first_mes` (on the SillyTavern card), the start checkpoint's `cast_changes`, and a scripted `onEnter` npc reply with `new_chat_only` (`validate/checkpoints.ts` `readCheckpointEffects`; rule text `FIRST_MESSAGE_RULE`, `OPENING_CAST_RULE` in `src/copilot/prompts.ts`).

- **What it does.** In a group every card with a first message greets at once when the chat opens. A scripted `onEnter` reply with `new_chat_only: true` posts only into an empty chat, so it is the story's own opener.
- **Good.** One narrator card with an empty first message; the start beat disables the later cast; one `new_chat_only` opener: `{ "trigger": "onEnter", "member": "Adolion Narrator", "kind": "scripted", "new_chat_only": true, "text": "You came to Aegis City to make a name with a blade…" }`.
- **Bad.** First messages written for each character's later beat. A greeting that addresses the player as a role ("You are the pawnbroker") while a card plays that role.
- **If wrong.** Every member greeted at once in a fresh group and the thief was spoiled at message 0 (seen in a test session). `new_chat_only` is accepted only on a scripted `onEnter` reply.

### NPC replies
<!-- topic: npc-replies -->

Field: `effects.npc_replies[]`: `{ trigger, member, kind, text, instruction, maxTriggers, probability, after_member, new_chat_only, enabled }` (`schema.ts` `NpcReplyEffect`, `validate/checkpoints.ts`, `runtime/effectsApplier.ts` `fireNpcReplies`).

- **What it does.** Lines a character speaks on their own. `trigger` is `onEnter` (the beat starts), `afterSpeak` (after a character reply; `after_member` narrows it to one speaker) or `sceneBreak`. `kind: "scripted"` posts `text` verbatim; `kind: "llm"` has the member generate, following `instruction`. `maxTriggers` caps repeats per beat, `probability` is a seeded chance, `enabled: false` parks a reply without deleting it. Fired counts persist, so reopening never repeats a reply.
- **Good.** `{ "trigger": "afterSpeak", "member": "Dalan", "after_member": "Felthorn", "kind": "llm", "probability": 0.6, "maxTriggers": 2, "instruction": "Dalan answers what the blade just said. He does not decide for the party." }`.
- **Bad.** A scripted line with a time or place in it ("As dusk falls…") on a trigger that can fire anywhere.
- **If wrong.** A dusk line fired at dawn, "Welden turns up in the library" fired in the study, and a tavern line fired after the party had left (seen in test sessions). Word scripted lines to fit wherever they fire, or use `llm`. A scripted greeting on top of an entering reply introduced Sophie twice; prefer an `llm` opener there (`14-findings.md`, T3-4/T3-6). Give `afterSpeak` a probability and `sceneBreak` a `maxTriggers` (`ACT-GUIDE.md`).

### Experimental effects
<!-- topic: experimental-effects -->

Fields: `effects.reasoning` (`off`, `low`, `medium`, `high`; `schema.ts` `CHECKPOINT_REASONING`), checkpoint `complications` and `complication_after` (`runtime/spikes/sp6Complications.ts`).

- **What it does.** `reasoning` asks for a reasoning effort on the beat's replies; `complications` are lines released into a beat that has stalled. Both are research spikes behind a switch that is off by default. The parser accepts `reasoning`; the spike reads `complications` from the authored record.
- **Good.** A story that plays the same with both switches off; a spike only adds to it.
- **Bad.** A story that only works when a spike is on.
- **If wrong.** Where the switch is off nothing happens, so a story that depends on these does not play as written.

### Gates
<!-- topic: gates -->

Field: `transitions[].gate`: `{ "q": <quality>, "op": "==" | "!=" | ">=" | "<=" | ">" | "<" | "in", "v": <value or list> }`, combined with `{ "all": [ … ] }`, `{ "any": [ … ] }`, `{ "not": gate }` (`schema.ts` `GateNode`, `validate/gates.ts`).

- **What it does.** The condition that opens an exit. It is evaluated over the qualities after each boundary; no model is involved. An unset quality makes a leaf false, so `not` is true while unset.
- **Good.** `{ "all": [{ "q": "path", "op": "==", "v": "wendhope" }, { "q": "party_name", "op": "!=", "v": "" }] }`; a mystery gated on understanding plus arrival (`evidence >= 3` and `knows_spirit`).
- **Bad.** A gate on something the chat cannot show (a character's private thought); a loose counter (`evidence >= 1` with "count things like…"), which moved a chapter on a character's own speculation (`14-findings.md`, T2-2).
- **If wrong.** An undeclared quality, an operator the type does not allow (`>=` needs a number, `in` a list), or a value an enum does not list is a gate that never opens (`undeclared-quality`, `op-type-mismatch`, `enum-value-invalid`). Gates must survive a bad read: name each clue as its own value or require two. A way out that asks only for what the way in already required, what the checkpoint's own state_snapshot already sets, or what an earlier way out on the route already required (an enum, bool, latching or monotonic value that no later step resets or asks about again; a free number counts only from the way in) is open the moment the story arrives, so the checkpoint is passed straight through on the next turn (diagnostic `gate-open-on-arrival`: "This checkpoint is skipped after one turn: its way out is already open when the story arrives, so its scene never gets played."). Seen live: `map_truth == awake` on two consecutive edges ran the story to its final checkpoint by turn 7 (seen in a test session). Seen again with the gate two edges back: a value required to leave the start also opened a later checkpoint's way out, and four checkpoints lasted one reply each (seen in a test session). Gate each exit on something that happens in that checkpoint.

### Transitions
<!-- topic: transitions -->

Fields: `transitions[].from`, `to`, `gate`, `priority` (required), `extraction_hint`, `extractor_trigger`, `effects.progress` (`schema.ts` `Transition`, `validate/gates.ts` `readTransition`).

- **What it does.** An exit between two beats. When several exits of a beat hold at once, the highest `priority` fires, and one exit fires per turn. `extraction_hint` tells the reading model what to watch for at this exit (it augments the rubric, never the values). `extractor_trigger` is a text pattern that forces an immediate read when a message matches; it never sets anything itself.
- **Good.** `{ "from": "cp1", "to": "cp2", "priority": 1, "gate": { "q": "approached_board", "op": "==", "v": true }, "extraction_hint": "Watch for the player moving toward or reading the job board." }`. When two gates can both be true, give the more specific one the higher priority; the campaign uses 2 for the main line and 1 for fallbacks.
- **Bad.** An `extractor_trigger` on a bare common word (`go`, `yes`), which fires on everything; a beat with no exit that is not an ending.
- **If wrong.** A beat nothing leads to can never be reached (`anchor-unreachable`). A beat with no way on stops the story there (`story-dead-end` once chapters are declared). Every scene needs an exit the world's pressure guarantees (`STORY-TUTORIAL.md`).

### Convergence
<!-- topic: convergence -->

Fields: `checkpoints[].convergence_threshold`, `transitions[].effects.progress` `{ anchor, amount }` (`engine/convergence.ts`; spec §Convergence).

- **What it does.** Each anchor has a code counter, `progress_toward_<anchor>`. A transition's `progress` effect adds to it when it fires. Generated bridge beats toward an anchor must sum to its threshold, and the exit into the anchor waits for it. `convergence_threshold` sets the threshold by hand; otherwise it is the sum the chain declares. Nothing fuzzy can write the counter.
- **Good.** A branch that pays `progress: { "anchor": "after-the-fog", "amount": 1 }` on each route, with the anchor's `convergence_threshold: 1`.
- **Bad.** A threshold larger than any route can pay.
- **If wrong.** "Progress can never reach this threshold, so the story cannot converge here." (`threshold-unsatisfiable`). Jumping straight into an aftermath with `/cp activate` skips the progress it needed (`STORY-TUTORIAL.md`).

### Thread bridges
<!-- topic: arc-bridges -->

Field: `arc_bridges[]`: `{ arcMatch, anchor, amount }` (`schema.ts` `ArcBridge`, `validate/storyOptions.ts` `readArcBridge`).

- **What it does.** When the memory confirms a story thread has resolved and its words match `arcMatch`, progress toward `anchor` rises by `amount` at the next boundary. A side plot can then move the main one.
- **Good.** `{ "arcMatch": "wendhope", "anchor": "after-the-fog", "amount": 1 }`.
- **Bad.** An `arcMatch` so generic ("the") that any thread matches it.
- **If wrong.** An `anchor` that is not an anchor beat is a load error.

### Speaker direction
<!-- topic: talk-control -->

Field: `checkpoints[].talk_control`: `speakers` `[{ member, weight }]`, `lead`, `no_repeat`, `allow_silence`, `director` (`true` or `{ instruction }`), `chain` (`{ mode, max, sequence, stop_on_transition, stop_on_player, hold_extraction }` or `false`) (`schema.ts` `TalkControl`, `validate/checkpoints.ts` `readTalkControl`).

- **What it does.** Decides who answers in a group while the beat is active (and the chat's "Speaker direction" setting is on). An explicit trigger always wins; then a single name mention; then the director (an AI pick from the candidates, the objective and your `instruction`); then weighted rules (`lead` first, `weight`s, `no_repeat` skips the last speaker). `allow_silence` lets the director hand the turn back to the player. `chain` lets several voices answer one message: `director` mode asks who is next until it hands back, `scripted` mode walks `sequence`; `max` is 1 to 8 (default 3); `stop_on_transition` ends the chain when the story moves.
- **Good.** `{ "lead": "Adolion Narrator", "speakers": [{ "member": "Adolion Narrator", "weight": 3 }, { "member": "Tobias", "weight": 2 }], "director": { "instruction": "Pick Adolion Narrator whenever the player acts … Pick Tobias when …" } }`. The director reads the instruction and the roles, not the weights, so end the instruction with the scene's real speakers. Chains: 2 at a decision, 4 with `hold_extraction` for an ensemble, `false` for a confession (`STORY-TUTORIAL.md`).
- **Bad.** A `lead` left out of `speakers`; an enabled character missing from `speakers`, whom the narrator then voiced (Tobias in T1; `14-findings.md`).
- **If wrong.** A lead outside the list still joins at weight 1 (`talk-lead-outside-speakers`); a name nobody has falls back to SillyTavern (`talk-member-unknown`); `allow_silence` without the director never happens (`talk-silence-without-director`); a scripted chain without a sequence speaks one voice (`talk-chain-empty`), and an unknown voice in it is skipped (`talk-chain-member-unknown`).

### Curator scope
<!-- topic: stagecraft -->

Fields: `stagecraft.lorebooks`, `stagecraft.exclude` (`schema.ts` `StoryStagecraft`, `StagecraftExclusion`, `stagecraft/scope.ts`).

- **What it does.** The only lorebooks the World Info curator may edit, for this story: it keeps the story's own lore current as play goes. Its proposals are reviewed and applied at a boundary. Nothing is inferred from requirements; an empty list means no curator writes. `stagecraft.exclude` (`[{ "lorebook": "...", "comments": ["..."] }]`) names entries inside those books that the curator is never shown and may never write (`isCuratorWritable` refuses them at the write edge too); match is by entry title (comment), ignoring case. Inside an entry's content, `{{// so:protect}}` … `{{// so:end}}` marks words the curator may never change: a rewrite that drops them, a patch that crosses them or switching the entry off is refused, when proposed and again when written (an unclosed `so:protect` protects to the end). `{{// so:auto}}` anywhere in an entry lets the curator's changes to it apply on their own when its changes are set to apply on their own; every other entry still waits for you. SillyTavern drops these `{{// …}}` markers before the prompt, so they cost nothing (`stagecraft/curatorTiers.ts`).
- **Good.** `{ "lorebooks": ["Adolion Chronicle"] }`, a book seeded with the campaign-state entries play will change; `"exclude": [{ "lorebook": "Story Lore", "comments": ["House style"] }]` for a meta entry that sets the book's voice.
- **Bad.** A curator book that ships empty; a curator book that beat lore also gates; a style or rules entry left open to curator rewrites; expecting "apply on their own" to write an entry with no `{{// so:auto}}`.
- **If wrong.** The curator can enable, disable, rewrite or patch existing entries, but it cannot create one, so an empty book gets nothing forever (memory note `story-authoring-traps.md`; `INTEGRATION.md`). It is never shown and never writes an entry any beat's `world_info` names, because the path replay would undo the write; a gated curator book silently disables the feature.

### Lore select
<!-- topic: lore-select -->

Fields: `lore_select.lorebooks`, `top_k` (1 to 12), `min_p` (0 to 1), `exclusive` (`schema.ts` `StoryLoreSelect`, `validate/storyOptions.ts` `readLoreSelect`).

- **What it does.** The judge picks the entries of these books that matter for the next reply and forces them in, even without their keywords. `top_k` caps the picks; `min_p` is the confidence a pick needs. `exclusive: true` also switches off, for that one reply, the entries of these books it did not pick (only with per-chat gating, and never for constant, gated or timed entries).
- **Good.** `{ "lorebooks": ["Adolion World"], "top_k": 6, "min_p": 0.7, "exclusive": true }`; raise `min_p` for a big book.
- **Bad.** A book that is not required.
- **If wrong.** Lore select only reaches books SillyTavern scans, so a book not under requirements may never be in play (`lore-select-inactive`); `exclusive` with no book excludes nothing (`lore-select-exclusive-empty`).

### Scene places and times
<!-- topic: scene-read -->

Fields: `scene_read.locations`, `scene_read.times`, `scene_read.inject` (`schema.ts` `StorySceneRead`).

- **What it does.** The vocabulary the scene tracker picks from to say where and when the scene is. The judge only selects, so it needs a list. `inject: false` keeps the scene line out of the prompt.
- **Good.** `{ "locations": ["aegis_guild_hall", "north_road", "wendhope_gate"], "times": ["dawn", "day", "dusk", "night"] }`, with `player_labels` on a matching `location` enum.
- **Bad.** A free-text `location` quality and no list.
- **If wrong.** "The story can never say where the scene is, so nothing can key off a place." (`scene-read-location-empty`).

### House rules
<!-- topic: house-rules -->

Field: `house_rules[]`: at most 8 rules, each at most 240 characters, no duplicates (`schema.ts` `HOUSE_RULES_MAX`, `validate/storyOptions.ts` `readHouseRules`).

- **What it does.** Rules every reply is checked against by the continuity warden; a broken rule is named in the next reply's prompt. The check is off by default (`judge.uses.houseRules`, `src/judge/settings.ts` `JUDGE_USES_OFF_BY_DEFAULT`).
- **Good.** `"{{user}}'s choices belong to {{user}}: show what the world does with an attempt, then stop."`; `"Magic is never used inside the city walls."`
- **Bad.** `"No magic in the city and keep replies short."`
- **If wrong.** The check asks one question per rule, so a rule with two demands is judged on whichever one the model reads (`house-rule-compound`). One rule, one demand; no "and" or `;` compounds.

### Chapters
<!-- topic: chapters -->

Fields: `chapters[]` (`id`, `title`, `player_title`, `kind`, `final`, `seal` with `open_threads`, `keep_tail`, `fold_messages`, `record_style`), `checkpoints[].chapter`, `memory.story_so_far` (`schema.ts` `Chapter`, `validate/chapters.ts`).

- **What it does.** Optional acts. Once one chapter is declared, every beat names one. When play leaves a chapter it is sealed into a written record, so later prompts carry the record instead of the whole transcript. `kind: "interlude"` never seals on its own; it seals with the next chapter. `final: true` marks the last chapter; the story ends when it reaches a beat with no exits there. `seal.open_threads` is `carry`, `close` or `decide`; `keep_tail` is how many messages stay verbatim after a fold; `record_style` is `prose` or `chronicle`. `memory.story_so_far` (`block`, `macro`, `off`) is how the record reaches the prompt. Sealing is still behind its measurement floors, so a chapter may not seal on every install yet.
- **Good.** `[{ "id": "wendhope", "title": "Act I: Wendhope", "player_title": "The Silent Village" }, { "id": "driftmere", "title": "Act II: Driftmere", "player_title": "The Mining Town", "final": true }]`.
- **Bad.** A `player_title` that names only the act's first place ("The Adventurer's Guild" titled an act about Driftmere; `14-findings.md`); a transition back into an earlier chapter.
- **If wrong.** A beat without a chapter, or naming an unknown one, stops the story loading (`chapter-missing`, `chapter-unknown`). An unreachable chapter is never written up (`chapter-unreachable`); a non-final chapter with no way out is never closed (`chapter-no-exit`); going back reopens a closed record (`chapter-reentry`); a beat with no way on outside a final chapter means the last chapter is never written up (`story-dead-end`).

### Illustrations and display
<!-- topic: presentation -->

Fields: `illustrations` (`checkpoints`, `scenes`, `style`, `appearances`), `checkpoints[].illustrate`, `chapters[].illustrations` (`style`, `appearances`), the lore line `Public appearance:`, `display.lore_names_public`, `display.continue_list` (with `group_card`, `chapter_card`, `wand`, `roll_chips`, `suggestions`), `effects.stage` (`schema.ts` `StoryV2`, `StoryIllustrations`, `IllustrationLook`, `StoryDisplay`; `src/image/cast.ts`, `src/image/lore.ts`; `src/sprites/direction.ts` `readStageDirection`).

- **What it does.** `illustrations` asks for pictures of beats and scenes in one `style`, with each cast member's look in `appearances` (keyed by cast id). A beat's picture is cued by its `player_name`, or a neutral "establishing shot" when it has none; the internal `name` never reaches the image prompt. `checkpoints[].illustrate: false` skips the automatic beat and scene pictures while that beat is active (a picture the player asks for still runs). `chapters[].illustrations` overrides `style` and, per cast id, `appearances` while the active beat is in that chapter, so a costume can end with its act. Lore looks come from `Appearance:` lines in the story's scanned books, and only from an entry that has fired in this chat; a `Public appearance:` line is used whenever the scene mentions the entry, fired or not, and wins over `Appearance:`. A cast member whose roster `role` starts with narrator, storyteller, game master, GM, DM or system, or whose `view` is `omniscient`, is drawn only from an authored appearance or the card's own appearance field, never from the card description. `display.lore_names_public: true` lets players see lore entry names in the inline timeline. The other `display` keys switch this story's presence items off: `continue_list` (its rows in Your stories), `group_card` (the card on its group's list icon), `chapter_card` (chapter title cards), `wand` (the wand-menu entries), `roll_chips` (Author view roll chips) and `suggestions` (the "What could I do?" button). Each defaults on and is edited in the Studio's Story tab under Story presence; an item shows only when both the story and the player's install-wide switch allow it, so a story can hide an item but never force one on. `effects.stage` (`{ framing: full | thigh | close, spotlight, cast: { <name>: { set, face, hidden } } }`) places sprites for a beat when the sprite stage is on.
- **Good.** A narrator appearance of "never drawn"; a style line shared by every picture; `"illustrate": false` on short connecting beats; a disguise in `Public appearance:` with the true form kept in `Appearance:`.
- **Bad.** A secret form in `appearances`, a `Public appearance:` line, or a background prompt that shows the twist: each leaks through the image prompt (`STORY-TUTORIAL.md`).
- **If wrong.** Public lore names spoil a story whose entry titles name the twist; leave `lore_names_public` off unless the titles are safe. A secret look in `Appearance:` still reaches the image prompt once its entry fires, so keep a form the player has not seen out of any entry that can fire before the reveal.

## Part 2: good practices and traps

Each item names where it was learned: a test session, the bundled campaign, or a diagnostic.

**Qualities and gates**

1. **Latching enums never list "undecided".** The first read latches the placeholder and the arc never starts. Leave the unset state as no value and write the rubric to stay silent until it happens. (Memory note `story-authoring-traps.md`; campaign `INTEGRATION.md`; diagnostic `latching-enum-placeholder`.)
2. **Gate only on what the extraction pass can observe.** Thoughts, off-screen events and things the narrator never writes leave the gate shut and the story stalled. (T4-2-1 `reached_walls`; T2 `acad_path`, Findings.)
3. **Make the rubric and the exit's `extraction_hint` say the same thing**, in the fiction's own words, never a name the player has not heard yet. (Findings, T2-1/3/5 follow-ups.)
4. **Party moves are `evidence_from: "party"`, outcomes that open an anchor are `world`.** Under `world` a party move is never proved by the player's line; under `any` an outcome is proved by the player writing that it happened. (Findings, T2-1 and T3-1; diagnostic `quality-outcome-player-evidence`.)
5. **Calibrate `commit_evidence` with real accept and hold lines**, and avoid bare words. (Findings, T0 and T1; campaign `STORY-TUTORIAL.md`.)
6. **Chance rolls only on code-sourced bool or int qualities**, and a roll decides the world, never the player's act. (Parser `readRoll`; campaign `ACT-GUIDE.md`; Findings SP7.b.)
7. **Name each clue as its own value** rather than gating on a loose counter. (Findings, T2-2.)
8. **Give a `location` enum player labels and list the places under scene read.** (Findings, T0; diagnostic `scene-read-location-empty`.)

**Cast and speakers**

9. **Requirements name characters by card name, never roster id.** (T5-2-1; diagnostic `requirement-member-roster-id`.)
10. **First messages for the opening scene only; `cast_changes` mutes later arrivals at the start beat** and enables each where they enter. (T5 summary; rule text in `src/copilot/prompts.ts`.)
11. **A talk lead goes in `speakers`, and so does every enabled character the player may address.** (Findings, T1; diagnostic `talk-lead-outside-speakers`.)
12. **Use `{{groupNotMuted}}` on a narrator card, not `{{group}}`.** `{{group}}` includes muted members and the narrator treated them as present. (Findings, T1; campaign `INTEGRATION.md`.)
13. **Give every character the narrator must recognise a lore or scene line.** A muted character with no lore was recast as a "royal advisor". (Findings, T2-2.)
14. **Card names are first names.** "X the Y" makes every "the" a mention of that member. (Campaign `PLAN.md`.)

**Steering text**

15. **Drives and motives are the character's private aim, in one line, never a plan for the player and never for the player's persona.** (Plan `06-inner-voice.md`; T3 summary; diagnostics `motive-for-player`, `motive-member-unknown`.)
16. **Guidance is pressure and intent, never the ending, and a secret goes in the member's own entry.** (Findings, T0; spec §Data model guidance rule.)
17. **Call the player `{{user}}`, never "the player".** (Findings, T1.)
18. **One house rule, one demand.** (Diagnostic `house-rule-compound`; campaign `ACT-GUIDE.md`.)
19. **Set or clear the author's note on purpose.** A beat without one keeps the last; a beat with one loses its objective line. (Diagnostic `checkpoint-inherits-author-note`; `engine/agency.ts`.)
20. **Choose `objective_kind` per beat, and give refusals an `alternate` that rejoins.** (`engine/agency.ts`; campaign `ADAPT-v2.5.md`, `ACT-GUIDE.md`.)

**Scripted lines and openers**

21. **Scripted lines have no time or place check.** Word them to fit wherever they fire, or use an `llm` reply with an instruction. (Findings, T3 and T4.)
22. **Exactly one `new_chat_only` opener per story**, and none when an entering reply already introduces the character. (Campaign `STORY-TUTORIAL.md`; Findings, T3-4/T3-6.)

**Lore**

23. **The World Info curator has no create op.** Seed its book with every entry play should keep current. (Memory note `story-authoring-traps.md`; `src/stagecraft/types.ts` `WiCuratorOp`.)
24. **Checkpoint-gated lore and curator scope never overlap.** Gated entries are rebuilt from the path each beat, so the curator is refused there. (`stagecraft/scope.ts`; campaign `INTEGRATION.md`.)
25. **A gated secret is never a constant entry with no character filter.** (Findings, T3-1.)
26. **Every book the story relies on is under `requirements.lorebooks`**: beat lore, lore select and the curator book. (Diagnostic `lore-select-inactive`; campaign `INTEGRATION.md`.)
27. **Check lore keys against the whole cast.** "Evergreen" fired on Dalan Evergreen. (Campaign `STORY-TUTORIAL.md`.)

**Player copy**

28. **`player_name`, `player_text` and chapter `player_title` show to the player**: name the place, not the outcome, and keep them true on every path in. (Findings, T2 and T3-4/T3-6; campaign `ACT-GUIDE.md`.)

## Part 3: build a story step by step

This mirrors the wizard's four steps (`src/studio/components/StudioCopilot.tsx` `WIZARD_STEPS`). Each step can be done by hand in the Studio or by the wizard; the wizard writes through the same edits you would.

### 1. Premise

What the story is about and what it measures as it goes.

1. Write the title, the description and a `player_intro` without the twist.
2. List the handful of facts that decide where the story goes: a choice, an outcome, a relationship, a place. Make each a quality, with a rubric that asks a question the chat will visibly answer.
3. Prefer bool and enum. Mark decisions `latching`, counters `monotonic`, and never give a latching enum a placeholder value.
4. Decide who may prove each outcome (`evidence_from`), and add `read_as` and `criteria` to the ones that are plainly visible.

### 2. Turning points

The beats, and what has to be true to move between them.

1. Write the anchors: the beats that must happen. One is the start. Give each an objective in world terms, a tension target and player-facing names.
2. Choose the objective kind of each beat, and give the beats where the player may refuse an `alternate`.
3. Connect the beats with transitions. Each gate reads declared qualities only, uses values they list and asks for something the chat will show. Add an `extraction_hint` saying what to watch for.
4. Check that every beat leads on (or is the end of a `final` chapter) and that the start reaches every anchor. The Diagnostics tab and the wizard's `simulateReachability` and `simulateWalk` show it.

### 3. Characters

Who is in it, what they want, and where their threads point.

1. Add the cast: card names, a one-line role each, aliases the player will use, one omniscient narrator if the story has one.
2. Give each a drive, and a motive at the beats where it changes.
3. Mute later arrivals at the start beat and enable each where they enter. Set the speakers, the lead and the director instruction for group beats.
4. Add the lore that should open with a beat, the backgrounds, any scripted or generated lines, the dramatic shape and thread bridges.
5. Fill in requirements (card names, every book), the curator's book, lore select, scene places and house rules.

### 4. Setup

Create the cards, lore and group the story needs to run.

1. Create a card for each cast member who does not exist yet. First messages only for the opening scene's cast.
2. Create the story's own lorebook and seed its entries, including every entry the curator should keep current and every entry a beat switches.
3. Create the group from the cards, open a new chat, select the story and check that it reads as ready.
4. Play the first beats yourself before handing the story to anyone: the reading model has to move the story on its own.
