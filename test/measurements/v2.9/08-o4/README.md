# v2.9 08 O4: understood as information

Frozen 2026-10-25 before any run. Floor (plan 08, verbatim): 10 synthetic-story tasks; the player finds the observation and
says it offers information, not an instruction; >= 8/10. Owner decision 2026-10-25 item 11: Sol wrote the tasks, the owner's
own playthrough is the player.

| File | What | Who reads it |
|---|---|---|
| `story.json` | synthetic story `so-v29-08-o4` (5 checkpoints, 10 plain observations, no `passive`), cast Arin + DM Narrator | imported, not read |
| `tasks.json` | T01-T10: where to be, what to do, the fixed question; no observation text | the player |
| `key.json` | expected observation per task, what it tells, the misreading to watch for | rater only, after all 10 answers |
| `answers.template.json` | one row per task: `shown` (true/false), `line` (the player's one line) | the player fills a copy |
| `rate.mjs` | Sol scores each line against the key | run after |
| `sol-prompt.md` | the prompt Sol wrote all of this from | record |
| `frozen.json` | sha256 of every file above, the one edit made after Sol | record |

The repo is public; everything here is synthetic. Do not open `story.json` or `key.json` before playing: the observation text
is in both.

## How the owner's playthrough serves as the player

1. Import `story.json` (Library → Start → import) into the owner's own ST and open it in the existing group
   `Group: Arin, DM Narrator`, with the real play model, thinking and inner voice on (the normal setup). Player mode, not Author
   view. This is the owner's ST, not a lane: the owner starts it, nobody else stages or runs scripts against it.
2. Copy `answers.template.json` to `answers.json` (outside the repo, or in so-sessions) and fill `playedOn`, `build` (served
   bundle), `chat`.
3. Work `tasks.json` in order. For each task write the task's `do` in your own words as your next message and let the
   reply come. Then open the story card (scene button above the chat input) or the Journal's **Noticed** section:
   - `shown`: true if a new "You notice: ..." line or a new Noticed entry appeared. A reading lands at the next reply, so if
     nothing is new after the first reply, send one neutral line ("I look around.") and check once more; still nothing = false.
   - `line`: one line in your own words: what you noticed and what it tells you. Write it before moving on; do not edit
     earlier lines.
   If the story drifts so a task cannot be done where it says, do the closest move and say so in `line`.
4. When all 10 are written, run the rater (Sol, opencode subscription; no GPU):

```bash
node test/measurements/v2.9/08-o4/rate.mjs <path>/answers.json <path>/o4-rate
```

   It writes `prompt.txt`, `answer.txt` and `report.json` (`pass` of 10, `met` = pass >= 8). A task passes only with
   `shown: true` and `I=yes`.
5. Record in plan 08 (`### O4 run <date>`): pass/10, shown/10, rater, build, chat id; counts only. Archive `answers.json` and the
   rate folder to so-sessions (`npm run sessions:archive`).

The owner plays the story knowing it is a test of the observation surface; the tasks never name what will be found, so finding
and reading the line is still the player's own. One playthrough is the measurement; it is not repeated to change a result.
