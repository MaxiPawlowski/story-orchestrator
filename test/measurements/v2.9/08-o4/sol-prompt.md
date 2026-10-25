# Task: write the O4 task set for "player observations"

You are writing frozen test material for a SillyTavern extension ("Story Orchestrator"). The repo is public. Everything you
write must be synthetic and original: invent a small setting; no existing franchise, book, game or campaign names.

## The feature under test

Authored lines the player can notice, e.g. "The lock has fresh scratches." Each has a gate (`when`). The first turn the gate
holds, the line latches and shows on the player's own surfaces: a "You notice: ..." line on the story card for the turn it
lands, and a "Noticed" section of the Journal. Perception only: it says what is there to see, hear or smell. It never says
what the player feels, believes, concludes, suspects or does, and never tells them what to do. Page only: no model is told.

Author's guide for the field (verbatim):


Fields: `observations[]` (`id`, `text`, `when`, `source`, `rev`, `passive` with `roll` and `modifiers`), `display.observations` (`engine/observationSchema.ts`, `engine/observations.ts`, `validate/observations.ts`, `runtime/observationRecords.ts`, `runtime/observationView.ts`).

- **What it does.** An observation is a small authored detail the player can notice: "The lock has fresh scratches." It shows once its `when` holds (a gate or `{"reached": "<checkpoint id>"}`; never `"start"`: a line known from the opening is a codex fact). The first turn it holds it latches as `obs_<id>` and stays; only a swipe, edit or delete of the reply that earned it takes it back. That turn the story card says "You notice: …" (at most 3 lines, then "and N more in the Journal"), and the Journal keeps it under **Noticed**, newest first, with "From <name>" once its `source` (a codex entry or roster id) is known, "At <place>" for a `reached` line, and a link back to the reply. With `passive` the player may not notice it at all: the first turn `when` holds the story rolls once, seeded by the chat, the story, that turn and the line (`roll {sides, target, dice}` plus `modifiers` that add when a quality has a value, as for checks), and nobody sees the roll. A success notices it; a miss is final (`obs_<id>_missed`), so repeating the move never fishes for it. An observation gated on another latch (a codex line, a label reveal, a quest close) lands one turn later on a turn without a transition, and the same turn when a transition fires. Page only: nothing about it is sent to any model, no character learns it, and the narrator is not told. The page shows a line only while it names no one the player has not met and restates no secret the story keeps from the player. While a line is unnoticed, the keys its gate reads are read for you in turn with the codex. `display.observations: false` hides the card line and the section. At most 60 a story; text up to 200 characters, plain (no macros); ids are lowercase letters, digits and `-`.
- **Good.** `"observations": [{ "id": "scratches", "text": "Fresh scratches circle the lock of the dock shed.", "when": { "q": "searched_dock", "op": "==", "v": true } }, { "id": "pitch", "text": "A faint smell of pitch hangs in the air.", "when": { "reached": "boathouse" }, "passive": { "roll": { "sides": 20, "target": 12 } } }]`. Write what is there to see, hear or smell.
- **Bad.** A line that tells the player what they feel, think, realise or suspect ("You sense he is lying": `observation-imposes-mind`), or what to do ("You should check the boat": `observation-instructs`); a line naming someone the player may not know yet (`disclosure-names-unknown-entity`); a gate on a checkpoint no path reaches or a value nothing writes (`observation-never-read`); a gate that holds before anything happens (`observation-gate-holds-at-start`). The wording checks are warnings: read the line again rather than fight the checker. A gate on the line's own `obs_` key, an unknown checkpoint or quality, an unknown `source`, two lines with one id, or an authored quality starting `obs_` is refused.
- **Story updates.** Rewording `text` (same `when`, `passive` and `rev`) is a correction: a chat that noticed it sees the new words. Changing `when` or `passive`, or raising `rev`, makes it a new discovery: the chat loses the old one (and a miss) and notices the new one when its moment comes. Removing it drops it from the chat.
- **If wrong.** A line gated on something read in a reply shows at the next reply, like every reading. Author view shows each passive roll as a chip under the reply.


## The floor these tasks serve (frozen, do not change)

O4 — Understood as information. 10 synthetic-story tasks: the player finds the observation and says it offers information,
not an instruction. Floor: >= 8/10. The player is the owner, playing the story in their own real playthrough (real model
replies, real extraction of what happened in the chat). Each task passes only if both hold: (1) the observation appears on the
story card or in the Journal after the player's move, and (2) the player's one-line answer treats it as information (a detail
about the world), not as an instruction or as a statement of what they feel or should do.

## What to write

One synthetic story, playable in an existing SillyTavern group with exactly two members: `Arin` (a capable companion, the
player's partner) and `DM Narrator` (the narrator). The player plays their own persona. Keep it to one evening's play: a small
self-contained mystery or errand in an invented place, 4 to 6 checkpoints.

Engine schema (JSON). Use only these fields. This is a complete, valid minimal example to copy the shape from:

```json
{
 "id": "so-v29-08-observations",
 "title": "SO-V29-08 Observations",
 "description": "Plan v2.9 08 no-model fixture: a plain and a passive observation noticed on reaching the tower, one passive miss.",
 "qualities": [
  {
   "key": "at_tower",
   "type": "bool",
   "source": "extractor",
   "rubric": "Has the party reached the old tower?"
  }
 ],
 "checkpoints": [
  {
   "id": "camp",
   "name": "Camp",
   "player_name": "The Camp",
   "type": "anchor",
   "start": true,
   "objective": "Set out."
  },
  {
   "id": "tower",
   "name": "Tower",
   "player_name": "The Old Tower",
   "type": "anchor",
   "objective": "Climb the tower."
  }
 ],
 "transitions": [
  {
   "from": "camp",
   "to": "tower",
   "priority": 1,
   "gate": {
    "q": "at_tower",
    "op": "==",
    "v": true
   }
  }
 ],
 "observations": [
  {
   "id": "bell",
   "text": "The tower bell hangs without a clapper.",
   "when": {
    "reached": "tower"
   }
  },
  {
   "id": "soot",
   "text": "Soot streaks the stones above the doorway.",
   "when": {
    "q": "at_tower",
    "op": "==",
    "v": true
   },
   "passive": {
    "roll": {
     "sides": 6,
     "target": 1
    }
   }
  },
  {
   "id": "thread",
   "text": "A red thread is caught on the iron gate.",
   "when": {
    "q": "at_tower",
    "op": "==",
    "v": true
   },
   "passive": {
    "roll": {
     "sides": 6,
     "target": 7
    }
   }
  }
 ],
 "roster": [
  {
   "id": "arin",
   "name": "Arin",
   "role": "the player's partner"
  },
  {
   "id": "narrator",
   "name": "DM Narrator",
   "role": "narrator",
   "view": "omniscient"
  }
 ],
 "requirements": {
  "members": [
   "Arin",
   "DM Narrator"
  ]
 }
}
```

Schema rules:
- `qualities[]`: `{key, type: "bool", source: "extractor", rubric}`. The rubric is a yes/no question a reader model answers from
  the chat ("Has the player opened the cellar door?"). Keys are lowercase snake_case. Use bool extractor qualities only.
- `checkpoints[]`: `{id, name, player_name, type: "anchor", objective}`; exactly one has `"start": true`. Ids lowercase.
- `transitions[]`: `{from, to, priority: 1, gate: {q, op: "==", v: true}}`. Every non-start checkpoint is reachable.
- `observations[]`: `{id, text, when}` where `when` is `{q, op: "==", v: true}` on one of your qualities or
  `{"reached": "<checkpoint id>"}`. Ids lowercase letters, digits and `-`. `text` <= 200 characters, plain, no macros.
  **No `passive` field** (every task line must be noticeable for sure). Optional `source` = `"arin"` only.
- `roster` and `requirements` exactly as in the example (Arin + DM Narrator).
- `id` "so-v29-08-o4", `title` "SO-V29-08 O4 Observations", one-sentence `description`.

Observation text rules (the feature's own lint warns on these; write none of them):
- no verbs of mind or feeling about the player: feel, sense, realise, know, think, suspect, conclude, believe, notice that...;
- no second person imperative, no "you should / must / need to / could try";
- no names of people the player has not met in the story; plain physical detail only (sight, sound, smell, touch);
- each line must be useful information (it bears on the mystery or errand) yet must not say what to do with it.

Exactly 10 task observations (one per task), each gated so that one deliberate player move earns it: either a quality the move
makes true (e.g. "Has the player examined the boat's hull?") or reaching a checkpoint. Each task's move must be something a
player can do in one or two turns from the place the previous task leaves them, in order T01..T10. Two or three extra
observations that no task targets are allowed (they make the Journal realistic) but not required.

The 10 tasks are player-facing and must NOT reveal the observation text or its content. For each task give:
- `id` "T01".."T10";
- `where`: the checkpoint the player should be at (its `player_name`);
- `do`: one sentence telling the player what to do in their next message, in plain words (e.g. "Ask Arin to hold the lantern
  while you look under the cart."), without hinting at what will be found;
- `question`: always exactly "After the reply, open the story card (or the Journal). Write one line: what did you notice, and
  what does it tell you?"

The key (rater-only, sealed from the player before the run) gives for each task: `task`, `observation` (id), `text` (copied
verbatim), `gate` (copied), `information` (one sentence: what the line tells the player about the world), and
`instruction_trap` (one sentence: how a careless reader might misread it as an order, so the rater knows what a fail looks like).

## Output

Exactly one JSON object and nothing else (no markdown fence, no commentary), with keys:
`{"story": {...}, "tasks": [10 objects], "key": [10 objects], "harder_than_obvious": "<one sentence on what keeps the tasks honest: why reading the line as an instruction is a real possible failure>"}`
