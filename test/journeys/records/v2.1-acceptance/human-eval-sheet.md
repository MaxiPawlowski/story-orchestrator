# v2.1 human-eval sheet (operator: the user)

Two sessions close the plan-08 gate. Everything automatable is already green — these are the parts a
machine cannot answer. Play them as a player and as an author, not as a tester: the point is what the
build feels like, not whether the selectors are still there.

Fill the scores in place and hand this file back (or say the numbers and I will file them in the
plan-08 Gate record, triage every flag, and re-run whatever the flags implicate).

Preparation, once:

```bash
node scripts/debug/st-session.mts start --headed
```

The library holds *Quest for the Sun Ruins* and the memory profile is install-wide, so a fresh chat
plays immediately. Nothing below needs a script.

---

## Session 1 — player (≥30 messages, pure player mode)

1. New chat in the sun-ruins group. Do **not** turn Author view on at any point.
2. Play ~30 messages. Follow the story, not the machine.
3. Whenever anything feels wrong, off, spoiled, stuck or unclear: hit **⚑** in the drawer and type
   the half-sentence version of what you noticed. Do not stop to diagnose it.
4. When you stop, export the timeline:

```bash
node scripts/debug/so-journal.mts export
```

| Check | Question | 1 · 3 · 5 | Score | Note |
|---|---|---|---|---|
| J3.9 | Did you always know where the story was? | lost · checked the drawer · never in doubt | | |
| J3.10 | Did anything spoil what was coming, or reveal what a character was hiding? | yes, badly · once · nothing | | |
| J3.11 | Did the wording sound like the game, or like the machine? | machine · mixed · the game | | |
| J3.12 | Could you tell stuck from thinking from waiting? | no · guessed · obvious | | |
| J3.13 | Did the pacing push and breathe when it should? | flat/rails · sometimes · yes | | |
| J1.9 | Was it clear the story was running and would advance on its own? | no signal · guessed · unmistakable | | |
| J4.5 | (if you return after a gap) Did the recap put you back in the story? | no · partly · yes | | |
| J8.4 | Did the presentation (scene, background, cast) feel handled for you, without asking? | nothing happened · noticed once · the stage kept up | | |
| — | **What would make you stop using this?** (free text) | | | |

Journal export path: `______________________`

## Session 2 — author (Studio start-to-finish, one mid-play edit)

1. **New story (wizard)** from a one-line premise of your own, or author from the empty Studio draft —
   your call; note which you chose.
2. Get it playable (qualities → checkpoints → transitions → roster/requirements; let the wizard
   provision what it offers to, reviewing each card).
3. Play it far enough to fire one real transition.
4. **Mid-play edit** from that same chat: change something compatible, save, keep playing; then change
   something invalidating and answer the popup.
5. Export the journal as above.

| Check | Question | 1 · 3 · 5 | Score | Note |
|---|---|---|---|---|
| J2.10 | Could you author a playable checkpoint without touching JSON? | no · after a fight · yes | | |
| J2.11 | After editing mid-play, did the chat behave as expected — including when it asked you to choose? | no · mostly · exactly | | |
| J1.8 | From opening SillyTavern, could you tell what to do to get a story running? | no idea · worked it out · obvious at every point | | |
| J9.6 | Starting from a one-line premise, did the wizard get you to a story you wanted to play? | fought it · usable after edits · better than mine | | |
| J9.7 | When it offered to create characters, lore and a group, did you trust what it was about to do? | no idea what it would touch · clear after reading · obvious | | |
| J10.9 | Was it clear which settings apply to every chat and which only to this one? | no · worked it out · obvious at a glance | | |
| J10.10 | Did the memory-model self-test tell you something you could act on? | meaningless · confirmed it works · told me what this model can and cannot do | | |
| J5.7 | (group play) Did the right characters speak, and did silence read as a choice? | wrong speaker constantly · mostly right · felt directed by a GM | | |
| — | **Curator rubric** (if you switched the WI curator on): necessity · precision · scope discipline · reviewability, 1–5 each — anchors in `docs/plans/v2.1/test-plan.md` | | | |

Journal export path: `______________________`

Assets created by the author session are **yours**, not test residue — nothing cleans them up
automatically. Say the word if you want them removed afterwards.

---

## What happens to the answers

- Scores + free text go into the plan-08 Gate record, with the journal export paths.
- Every ⚑ flag is triaged: fixed now, bounced to v2.2 with a reason, or by-design with the reason
  written down.
- The player-rubric average settles the one open success criterion (≥4/5). The plan-01 baseline was
  never scored, so this run also becomes the baseline it will be compared against next time.
- If the curator rubric lands well, the open question of making its accept mode `auto` by default
  (plan 07) can finally be decided.
