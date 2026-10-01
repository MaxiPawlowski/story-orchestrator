<!-- Generated from test/sessions/charters.json and test/sessions/lane-plan.json by `node scripts/debug/so-session.mts runbook --write`. Do not edit by hand. -->

# Plan 14 autonomous runbook

The exact command sequence per charter for the lead (plan 15 Part B). Claude plays each card on its lane; the main RP model is Artemis on the RunPod pod (profile `Artemis RunPod RP`, `http://127.0.0.1:18080` through the SSH tunnel); every orchestrator role stays on DeepSeek flash. The session dir shown is the first run (`-1`); `start` prints the real one.

## Before any card

```bash
curl -s http://127.0.0.1:18080/v1/models
node scripts/debug/so-session.mts validate
node scripts/debug/so-session.mts plan --write
node scripts/debug/so-session.mts budget
```

- The served bundle must be the dev flavour (`dist/manifest.json` `flavor: "dev"`); staging it is the lead's step, not the runbook's.
- `start` fails closed (exit 2, `start-failed.json`, no session) on any blocking discrepancy: a card whose pinned story lacks the data it exercises, a lane seeded from another build, a setting the runtime does not read back as the baseline plus the card's overrides (`test/sessions/baseline-settings.json`), a failed routing pin (`page-pin.json`), a page problem, a recap that did not fire, a failed run header, or a tail that never acknowledged it is capturing.
- `stop` exports every visited or created chat, asks each tail to drain and waits for it before stopping it, and exits 1 on an invalid session (failed header diff, missing capture, lost drain, missing required artifact, a ComfyUI call). A repo rebuild or merge mid-run is not a failed diff while the served bundle is unchanged (`--served-identity`): it is a warning in `session.json`. An invalid session is re-run, never scored.
- Never touch ComfyUI at 127.0.0.1:8188: every card runs with `--media off` (the default), the recorded no-media variant; image and sprite rubric rows are unexercised, and no card here needs `--allow-comfy`.
- Lanes run in parallel, tier by tier; at most two LLM-heavy lanes at once (llama-server `LLM_PARALLEL`). A lane whose chat a later card continues is leased (`lease.json`): `start` and `adolion-fresh seed` refuse to re-seed it until the continuation ran; `so-session lane archive <n>` keeps it if the lane is needed sooner.
- `turn` sends one real line, waits until the round is over (no group round or generation open, then 4 s with no new generation, draft or reply; a group send can be several generations) and for the scheduler, and appends the record to `turns.jsonl`; a round still open at the budget is a problem in the record. A reply that loops (a line 3x, a 4-word phrase 4x) or shows word-merge damage (glued words, doubled words, spelled letters) is recorded as `modelDefect`, flagged (`model defect: loop|corrupt`) and, when it is the last reply, swiped once so it does not seed the next turn; the digest counts them. Mutations (`swipe-new`, `regen`, `edit`, `delete`, `switch-chat-mid-gen`, `reload-mid-gen`) record what they did and the rollback the product performed. `switch-chat-mid-gen` to a chat of another group waits for the reply to render and switches at once (`switchedAt: after-reply`), because ST refuses to leave a group while it generates; within one group it switches mid-generation. They close the drawer and any popup first; `swipe-new` scrolls the reply into view (the chat to the bottom) and clicks only a hit-testable arrow. `swipe-new`, `regen` and `delete last` target the last character reply: a transition note after it is skipped and named in the record (`swipe-new` and `regen` delete it first, since ST swipes and regenerates only the last message). `flag` puts the drawer back the way it found it.
- Beats are signposts: when the story moves elsewhere, play what the story offers and keep the card's look-for and must-not-happen in view.
- A score is a claim the user will check: every `score` needs a note and evidence inside the session dir (several paths after one `--evidence`, a repeated `--evidence`, or a comma list; a stray unquoted word is refused). Rows marked `--record` are recorded for the user's review, never scored.
- Lanes share one TypeSafe account: `start` sets the lane's judge limit to the account rate (90/min, `SO_JUDGE_ACCOUNT_RATE_PER_MIN`) split over the running lanes plus this one (3 lanes: 30/min), records it in `session.json` `judgeRate`, and warns when the lane server was already up at another limit. The digest reports busy fallbacks per session (`findings.md` Judge health).
- After each `stop`, `test/sessions/BUDGET.md` is rewritten from every stopped session; add pod hours to its own table by hand.

## Lane plan

| Lane | Queue |
|---|---|
| 1 | T0-1 → T0-2 → T1-5 → T2-1 → T2-3 → T2-5 → T4-3 → T5-5 → T6-3 |
| 2 | T0-3 → T1-3 → T1-6 → T2-2 → T3-4 → T3-6 → T4-4 → T6-1 → T6-4 |
| 3 | T1-1 → T2-4 → T2-6 → T3-1 → T3-2 → T4-1 → T5-1 → T5-3 → T5-4 |
| 4 | T1-2 → T1-4 → T1-7 → T3-3 → T3-5 → T4-2 → T5-2 → T6-2 → T7 |

## T0

### T0-1 First contact (lane 1, seeds the lane)

```bash
node scripts/debug/so-session.mts start T0-1 --lane 1
node scripts/debug/so-session.mts shot test/sessions/T0/T0-1-1 entry-points
# beat 1: Read the entry points -> guild-hall
#   UI: In the settings panel, open Continue: it names The Adventurer's Road and reveals the library select where a story is picked. Repair has nothing to say. Start makes a new story (wizard or import), it does not pick one. Then open the story drawer: the requirements read ready there, not in the settings panel.
# beat 2: Look around the hall -> guild-hall
node scripts/debug/so-session.mts turn test/sessions/T0/T0-1-1 "What's on the board that pays and won't get us killed?"
node scripts/debug/so-session.mts turn test/sessions/T0/T0-1-1 "Tobias, what's the catch with the Wendhope posting?"
# beat 3: Take Wendhope and name the party -> road-to-wendhope
node scripts/debug/so-session.mts turn test/sessions/T0/T0-1-1 "We'll take the Wendhope job."
node scripts/debug/so-session.mts turn test/sessions/T0/T0-1-1 "Put us down as the Ash Lanterns."
node scripts/debug/so-session.mts shot test/sessions/T0/T0-1-1 after-transition
# beat 4: Travel north -> on-the-road | at-the-walls
node scripts/debug/so-session.mts turn test/sessions/T0/T0-1-1 "We keep moving north. Anyone else notice there's no traffic on this road?"
node scripts/debug/so-session.mts turn test/sessions/T0/T0-1-1 "We make camp by the carriages and keep a watch."
# provocation: Ask the narrator what you should do.
# provocation: Reload the page once mid-session and continue.
# flag at once on any of 6 must-not-happen item(s), and when: You did not understand what a panel was telling you. / A reply felt slow or repeated itself. / Anything looked broken or unfinished.
node scripts/debug/so-session.mts flag test/sessions/T0/T0-1-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T0/T0-1-1
node scripts/debug/so-session.mts digest test/sessions/T0/T0-1-1
node scripts/debug/so-session.mts score test/sessions/T0/T0-1-1 0 <works|annoying|broken|not-noticed> "<entry points: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-1-1 1 <works|annoying|broken|not-noticed> "<requirements readout: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-1-1 2 <works|annoying|broken|not-noticed> "<HUD: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-1-1 3 <works|annoying|broken|not-noticed> "<Overview: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-1-1 4 <works|annoying|broken|not-noticed> "<transition timing: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-1-1 5 <works|annoying|broken|not-noticed> "<timeline at level 1: what was seen>" --evidence <path:line|shots/x.png>
```

### T0-2 Come back (lane 1, continues on its lane)

```bash
node scripts/debug/so-session.mts start T0-2 --lane 1 --age 24
node scripts/debug/so-session.mts shot test/sessions/T0/T0-2-1 away-recap
# beat 1: Read the welcome back -> at-the-walls | road-to-wendhope
#   UI: Before typing, read the away recap and the Overview.
# beat 2: Get inside Wendhope -> at-the-walls | first-night
node scripts/debug/so-session.mts turn test/sessions/T0/T0-2-1 "We're from the Guild, the Sheridans sent us. Let us in before the sun's gone."
node scripts/debug/so-session.mts turn test/sessions/T0/T0-2-1 "We have bandages for your wounded. Open the gate."
# beat 3: Reload once more mid-scene -> first-night | outside-at-sundown
node scripts/debug/so-session.mts reload-mid-gen test/sessions/T0/T0-2-1 "We hold the wall. Belle, left side. Dalan, find the ones in the fog."
# provocation: Answer the recap popup by closing it immediately, then ask the narrator for a summary.
# flag at once on any of 5 must-not-happen item(s), and when: The recap got something wrong or felt too long. / Anything reset, even a small thing like tension.
node scripts/debug/so-session.mts flag test/sessions/T0/T0-2-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T0/T0-2-1
node scripts/debug/so-session.mts digest test/sessions/T0/T0-2-1
node scripts/debug/so-session.mts score test/sessions/T0/T0-2-1 0 <works|annoying|broken|not-noticed> "<away recap: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-2-1 1 <works|annoying|broken|not-noticed> "<state restored after reload: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-2-1 2 <works|annoying|broken|not-noticed> "<Repair (should stay silent): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-2-1 3 <works|annoying|broken|not-noticed> "<transition timing: what was seen>" --evidence <path:line|shots/x.png>
```

### T0-3 First slips (lane 2, seeds the lane)

```bash
node scripts/debug/so-session.mts start T0-3 --lane 2
# beat 1: Take the job, then swipe the reply -> road-to-wendhope
node scripts/debug/so-session.mts turn test/sessions/T0/T0-3-1 "We take Wendhope. Write us down as the Ash Lanterns."
node scripts/debug/so-session.mts swipe-new test/sessions/T0/T0-3-1
# beat 2: Edit your own line -> guild-hall | road-to-wendhope
node scripts/debug/so-session.mts edit test/sessions/T0/T0-3-1 <message id> "Actually, no. Not for that money."
node scripts/debug/so-session.mts regen test/sessions/T0/T0-3-1
# beat 3: Delete the last reply -> road-to-wendhope | on-the-road
node scripts/debug/so-session.mts turn test/sessions/T0/T0-3-1 "Fine, we'll do it. Ash Lanterns. Let's ride north."
node scripts/debug/so-session.mts delete test/sessions/T0/T0-3-1 last
# beat 4: Regenerate at a quiet moment -> on-the-road | at-the-walls
node scripts/debug/so-session.mts turn test/sessions/T0/T0-3-1 "We camp by the abandoned carriages."
node scripts/debug/so-session.mts regen test/sessions/T0/T0-3-1
node scripts/debug/so-session.mts regen test/sessions/T0/T0-3-1
# provocation: Swipe right after a transition, then swipe back to the first version.
# provocation: Delete two messages in a row.
# flag at once on any of 4 must-not-happen item(s), and when: Anything moved that you did not touch. / The step-back notice was confusing or missing.
node scripts/debug/so-session.mts flag test/sessions/T0/T0-3-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T0/T0-3-1
node scripts/debug/so-session.mts digest test/sessions/T0/T0-3-1
node scripts/debug/so-session.mts score test/sessions/T0/T0-3-1 0 <works|annoying|broken|not-noticed> "<rollback on swipe: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-3-1 1 <works|annoying|broken|not-noticed> "<rollback on edit: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-3-1 2 <works|annoying|broken|not-noticed> "<rollback on delete: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-3-1 3 <works|annoying|broken|not-noticed> "<step-back notice: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T0/T0-3-1 4 <works|annoying|broken|not-noticed> "<timeline follows mutations: what was seen>" --evidence <path:line|shots/x.png>
```

## T1

### T1-1 Follow the hook (lane 3, seeds the lane)

```bash
node scripts/debug/so-session.mts start T1-1 --lane 3
# beat 1: Take the Wendhope posting -> road-to-wendhope
node scripts/debug/so-session.mts turn test/sessions/T1/T1-1-1 "We'll take Wendhope."
node scripts/debug/so-session.mts turn test/sessions/T1/T1-1-1 "Call us the Grey Pennants."
# beat 2: Reach the walls -> on-the-road | at-the-walls
node scripts/debug/so-session.mts turn test/sessions/T1/T1-1-1 "We push on to the village before dark."
# beat 3: Get inside before sundown -> first-night | outside-at-sundown
node scripts/debug/so-session.mts turn test/sessions/T1/T1-1-1 "Here's the Guild seal and the Sheridan contract. Open up."
# beat 4: Hold the wall -> what-wendhope-knows | the-breach
node scripts/debug/so-session.mts turn test/sessions/T1/T1-1-1 "Belle, the ladder! Dalan, keep shooting into the fog."
# beat 5: Investigate -> into-needlehaven
node scripts/debug/so-session.mts turn test/sessions/T1/T1-1-1 "Duggy, what did your miners find the week before the fog?"
# provocation: Stay in the hall two extra turns chatting before accepting.
# provocation: Go silent for one turn (send only an action like 'I wait.').
# flag at once on any of 5 must-not-happen item(s), and when: A move felt late or early. / The story stalled with nothing for you to do. / A character knew something they should not.
node scripts/debug/so-session.mts flag test/sessions/T1/T1-1-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T1/T1-1-1
node scripts/debug/so-session.mts digest test/sessions/T1/T1-1-1
node scripts/debug/so-session.mts score test/sessions/T1/T1-1-1 0 <works|annoying|broken|not-noticed> "<transition timing: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-1-1 1 <works|annoying|broken|not-noticed> "<agency (never narrates you): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-1-1 2 <works|annoying|broken|not-noticed> "<speaker direction: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-1-1 3 <works|annoying|broken|not-noticed> "<pacing / tension: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-1-1 4 <works|annoying|broken|not-noticed> "<secrets kept: what was seen>" --evidence <path:line|shots/x.png>
```

### T1-2 Refuse the hook (lane 4, seeds the lane)

```bash
node scripts/debug/so-session.mts start T1-2 --lane 4
# beat 1: Look around the hall -> guild-hall
node scripts/debug/so-session.mts turn test/sessions/T1/T1-2-1 "What's the job on the board with the red seal?"
# beat 2: Refuse it clearly -> guild-hall
node scripts/debug/so-session.mts turn test/sessions/T1/T1-2-1 "A collapsed mine shaft for that pay? No. We'll find something else."
node scripts/debug/so-session.mts swipe-new test/sessions/T1/T1-2-1
# beat 3: Refuse again, differently -> adv-guild-tavern | the-sheridan-steward
node scripts/debug/so-session.mts turn test/sessions/T1/T1-2-1 "Tell the Sheridans to hire soldiers."
node scripts/debug/so-session.mts turn test/sessions/T1/T1-2-1 "We'll be in the tavern if anyone has a real job."
# beat 4: Accept on your own terms, and name the party -> road-to-wendhope
node scripts/debug/so-session.mts turn test/sessions/T1/T1-2-1 "Fine. Triple the fee, and we ride as the Ash Lanterns."
# provocation: Answer with an ambiguous 'maybe'.
# provocation: Say nothing meaningful for two turns.
# provocation: Swipe the reply to your first refusal once.
# flag at once on any of 5 must-not-happen item(s), and when: A refusal was ignored, or answered twice. / The pressure felt heavy-handed. / The party name you gave is wrong later.
node scripts/debug/so-session.mts flag test/sessions/T1/T1-2-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T1/T1-2-1
node scripts/debug/so-session.mts digest test/sessions/T1/T1-2-1
node scripts/debug/so-session.mts score test/sessions/T1/T1-2-1 0 <works|annoying|broken|not-noticed> "<agency (refusal handling): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-2-1 1 <works|annoying|broken|not-noticed> "<transition timing: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-2-1 2 <works|annoying|broken|not-noticed> "<speaker direction: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-2-1 3 <works|annoying|broken|not-noticed> "<timeline at level 1: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-2-1 4 <works|annoying|broken|not-noticed> "<HUD: what was seen>" --evidence <path:line|shots/x.png>
```

### T1-3 Group direction (lane 2, seeds the lane)

```bash
node scripts/debug/so-session.mts start T1-3 --lane 2
# beat 1: Talk to one person by name -> war-the-summons
node scripts/debug/so-session.mts turn test/sessions/T1/T1-3-1 "Princess Haley, do you believe the rumour about your mother?"
node scripts/debug/so-session.mts turn test/sessions/T1/T1-3-1 "Guildmaster, what is the Crown really asking of adventurers?"
# beat 2: Talk to nobody in particular -> war-the-summons
node scripts/debug/so-session.mts turn test/sessions/T1/T1-3-1 "So who is burning the villages behind the line?"
# beat 3: Take or refuse the commission -> war-the-front | war-the-queens-wing
node scripts/debug/so-session.mts turn test/sessions/T1/T1-3-1 "We take the King's commission. Point us at the front."
node scripts/debug/so-session.mts turn test/sessions/T1/T1-3-1 "No. We won't be a forlorn hope for the Crown."
# beat 4: At the front, address Kanna at the parley -> war-the-front | war-behind-the-lines | war-the-pits
node scripts/debug/so-session.mts turn test/sessions/T1/T1-3-1 "Blood Saint, why do you care where the dead go?"
# provocation: Address two people in one line.
# provocation: Ask a question and then say 'never mind'.
# provocation: Name a character who is not in the scene (Melisande).
# flag at once on any of 5 must-not-happen item(s), and when: The speaker choice felt wrong, even once. / Silence when someone should have answered.
node scripts/debug/so-session.mts flag test/sessions/T1/T1-3-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T1/T1-3-1
node scripts/debug/so-session.mts digest test/sessions/T1/T1-3-1
node scripts/debug/so-session.mts score test/sessions/T1/T1-3-1 0 <works|annoying|broken|not-noticed> "<speaker direction (named): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-3-1 1 <works|annoying|broken|not-noticed> "<speaker direction (open questions): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-3-1 2 <works|annoying|broken|not-noticed> "<cast changes: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-3-1 3 <works|annoying|broken|not-noticed> "<secrets kept: what was seen>" --evidence <path:line|shots/x.png>
```

### T1-4 Effects (lane 4, seeds the lane)

```bash
node scripts/debug/so-session.mts start T1-4 --lane 4
# beat 1: Come ashore -> east-landfall
node scripts/debug/so-session.mts turn test/sessions/T1/T1-4-1 "Honami, who asked for us, and why us?"
# beat 2: Go to the Academy -> east-jiansho-academy
node scripts/debug/so-session.mts turn test/sessions/T1/T1-4-1 "Take us to Jiansho Academy."
# beat 3: Sign the register -> east-the-rounds
node scripts/debug/so-session.mts turn test/sessions/T1/T1-4-1 "We sign under Honami's name. Where do we fight?"
# beat 4: Win through, then find the Hattaxi -> east-the-hattaxi-shadow | east-the-upset
node scripts/debug/so-session.mts turn test/sessions/T1/T1-4-1 "We fight the monks next. Dalan, watch the ward posts."
# beat 5: The final -> east-the-final
node scripts/debug/so-session.mts turn test/sessions/T1/T1-4-1 "There's a thread between the ward posts. Honami, can you read the charm on it?"
# provocation: Swipe the reply right after a transition and watch the background.
# provocation: Reload during the Academy scene.
# flag at once on any of 5 must-not-happen item(s), and when: An effect lagged by more than one reply. / Someone who left came back.
node scripts/debug/so-session.mts flag test/sessions/T1/T1-4-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T1/T1-4-1
node scripts/debug/so-session.mts digest test/sessions/T1/T1-4-1
node scripts/debug/so-session.mts score test/sessions/T1/T1-4-1 0 <works|annoying|broken|not-noticed> "<backgrounds: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-4-1 1 <works|annoying|broken|not-noticed> "<cast joins and leaves: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-4-1 2 <works|annoying|broken|not-noticed> "<checkpoint lore: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-4-1 3 <works|annoying|broken|not-noticed> "<timeline at level 2: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-4-1 4 <works|annoying|broken|not-noticed> "<Overview: what was seen>" --evidence <path:line|shots/x.png>
```

### T1-5 Off the map (lane 1, seeds the lane)

```bash
node scripts/debug/so-session.mts start T1-5 --lane 1
# beat 1: Break the fog your own way -> night-the-kelger-falls | night-the-long-night
node scripts/debug/so-session.mts turn test/sessions/T1/T1-5-1 "We take a boat south, into the sea."
node scripts/debug/so-session.mts turn test/sessions/T1/T1-5-1 "Zariah, lay them down. Kayla can help if you let her."
# beat 2: Wander the long night -> night-the-long-night
node scripts/debug/so-session.mts turn test/sessions/T1/T1-5-1 "We leave the road and follow the river instead."
node scripts/debug/so-session.mts turn test/sessions/T1/T1-5-1 "We stop at a village nobody has heard of and ask about the black castle."
# beat 3: Push somewhere the story never mentions -> night-the-long-night
node scripts/debug/so-session.mts turn test/sessions/T1/T1-5-1 "We turn back toward Aegis City for a week to resupply."
# beat 4: Let it bring you to the castle -> night-the-castle-dracul
node scripts/debug/so-session.mts turn test/sessions/T1/T1-5-1 "We ride toward the castle under the endless night."
# provocation: Refuse to go to the castle for three turns.
# provocation: Ask the narrator to 'skip to the castle'.
# flag at once on any of 5 must-not-happen item(s), and when: A generated scene contradicted an earlier one. / The story felt lost or looping.
node scripts/debug/so-session.mts flag test/sessions/T1/T1-5-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T1/T1-5-1
node scripts/debug/so-session.mts digest test/sessions/T1/T1-5-1
node scripts/debug/so-session.mts score test/sessions/T1/T1-5-1 0 <works|annoying|broken|not-noticed> "<generated routes: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-5-1 1 <works|annoying|broken|not-noticed> "<detour handling: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-5-1 2 <works|annoying|broken|not-noticed> "<agency: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-5-1 3 <works|annoying|broken|not-noticed> "<Overview during generated play: what was seen>" --evidence <path:line|shots/x.png>
```

### T1-6 Pacing (lane 2, seeds the lane)

```bash
node scripts/debug/so-session.mts start T1-6 --lane 2
# beat 1: Linger at the chapel -> esha-the-last-chapel
node scripts/debug/so-session.mts turn test/sessions/T1/T1-6-1 "Ashliel, why do you want us to turn back?"
node scripts/debug/so-session.mts turn test/sessions/T1/T1-6-1 "Sali, what are you? Sit with us."
# beat 2: Cross the stones carefully -> esha-the-guardians
node scripts/debug/so-session.mts turn test/sessions/T1/T1-6-1 "We cross the shrine stones, slowly, weapons down."
# beat 3: Talk through the welcome -> esha-the-court | esha-the-road-in | esha-bound-and-led
node scripts/debug/so-session.mts turn test/sessions/T1/T1-6-1 "King Teranora, where are the Holt siblings?"
# beat 4: Rush -> esha-the-empty-bed | esha-the-green-knight
node scripts/debug/so-session.mts turn test/sessions/T1/T1-6-1 "Where is she? Search the wing. Now."
node scripts/debug/so-session.mts turn test/sessions/T1/T1-6-1 "We go to the Thornway. Out of the way."
# provocation: Go silent for two turns at the feast.
# provocation: Rush at the chapel for one turn, then go back to slow.
# flag at once on any of 5 must-not-happen item(s), and when: Tension felt wrong for what was happening. / A slow stretch was cut short by the story.
node scripts/debug/so-session.mts flag test/sessions/T1/T1-6-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T1/T1-6-1
node scripts/debug/so-session.mts digest test/sessions/T1/T1-6-1
node scripts/debug/so-session.mts score test/sessions/T1/T1-6-1 0 <works|annoying|broken|not-noticed> "<tension follows play: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-6-1 1 <works|annoying|broken|not-noticed> "<pacing hint (does the story wait?): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-6-1 2 <works|annoying|broken|not-noticed> "<HUD tension readout: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-6-1 3 <works|annoying|broken|not-noticed> "<secrets kept: what was seen>" --evidence <path:line|shots/x.png>
```

### T1-7 Second story (lane 4, seeds the lane)

```bash
node scripts/debug/so-session.mts start T1-7 --lane 4
# beat 1: Play the adventurer chat first -> aegis-homecoming
node scripts/debug/so-session.mts turn test/sessions/T1/T1-7-1 "(in the adventurer chat:) We take Wendhope as the Iron Kettles."
# beat 2: Enter the exam -> aegis-the-tavern | aegis-tobias-pleads
node scripts/debug/so-session.mts turn test/sessions/T1/T1-7-1 "Put our names down for the C-rank exam."
# beat 3: Go out into the city -> aegis-market-street
node scripts/debug/so-session.mts turn test/sessions/T1/T1-7-1 "We head to the Market District in the morning."
# beat 4: Answer the rivals -> aegis-errands | aegis-the-curio-shop
node scripts/debug/so-session.mts turn test/sessions/T1/T1-7-1 "Grant, you're on. Loser buys the drinks."
# provocation: Switch to the other chat the moment a reply renders and send there at once (ST will not leave a group while it is still generating).
# provocation: Mention Wendhope yourself and see who reacts.
# flag at once on any of 4 must-not-happen item(s), and when: Anything from the other chat showed up. / Switching chats felt slow or lost state.
node scripts/debug/so-session.mts flag test/sessions/T1/T1-7-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T1/T1-7-1
node scripts/debug/so-session.mts digest test/sessions/T1/T1-7-1
node scripts/debug/so-session.mts score test/sessions/T1/T1-7-1 0 <works|annoying|broken|not-noticed> "<story isolation: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-7-1 1 <works|annoying|broken|not-noticed> "<chat switching: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-7-1 2 <works|annoying|broken|not-noticed> "<Memory tab: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T1/T1-7-1 3 <works|annoying|broken|not-noticed> "<transition timing: what was seen>" --evidence <path:line|shots/x.png>
```

## T2

### T2-1 Long run (lane 1, seeds the lane)

```bash
node scripts/debug/so-session.mts start T2-1 --lane 1
# beat 1: Hear Driftmere out -> driftmere | the-first-descent
node scripts/debug/so-session.mts turn test/sessions/T2/T2-1-1 "Baroness, what did the last expedition find?"
node scripts/debug/so-session.mts turn test/sessions/T2/T2-1-1 "Naomi, you want a fight? Come down with us."
# beat 2: Go down the mines -> between-the-floors | the-changed-deep
node scripts/debug/so-session.mts turn test/sessions/T2/T2-1-1 "We go down. Naomi, stay close, call your attacks."
# beat 3: Learn the Devourer's name -> the-sealed-wall
node scripts/debug/so-session.mts turn test/sessions/T2/T2-1-1 "Riyo, what are you doing down here alone?"
node scripts/debug/so-session.mts turn test/sessions/T2/T2-1-1 "The carvings say 'ascension'. Who ascends?"
# beat 4: Choose at the seal and end it -> the-devourer | filwern-freed | the-wards-hold
node scripts/debug/so-session.mts turn test/sessions/T2/T2-1-1 "We make an offering here instead of breaking the seal."
node scripts/debug/so-session.mts turn test/sessions/T2/T2-1-1 "We kill it. Free what's left of Filwern."
# beat 5: Climb out and tell Driftmere -> what-filwern-left
node scripts/debug/so-session.mts turn test/sessions/T2/T2-1-1 "We climb for the lifts and go find Serenola."
# beat 6: Go home to Nightriver -> nightriver-house | fathers-summons
node scripts/debug/so-session.mts turn test/sessions/T2/T2-1-1 "A letter from home? Then we go to Aegis City, to the estate."
# blind gate Q-M: tag each paired reply with --arm (card notes); stop rebuilds test/sessions/rating-pack/Q-M/, verdicts stay the user's
# provocation: Ask a companion about something from 40 turns ago.
# provocation: Leave the chat idle for 20 minutes mid-session, then continue.
# flag at once on any of 5 must-not-happen item(s), and when: A companion forgot something important. / A chapter title or recap was wrong. / Replies got slow as the chat grew.
node scripts/debug/so-session.mts flag test/sessions/T2/T2-1-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T2/T2-1-1
node scripts/debug/so-session.mts digest test/sessions/T2/T2-1-1
node scripts/debug/so-session.mts score test/sessions/T2/T2-1-1 0 <works|annoying|broken|not-noticed> "<long-run memory: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-1-1 1 <works|annoying|broken|not-noticed> "<chapter seal: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-1-1 2 <works|annoying|broken|not-noticed> "<story so far / Previously: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-1-1 3 <works|annoying|broken|not-noticed> "<Memory tab: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-1-1 4 <works|annoying|broken|not-noticed> "<act change: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-1-1 5 --record "<07 Q-M legs: what was kept for the user>" --evidence <path:line>
```

### T2-2 Secrets (lane 2, seeds the lane)

```bash
node scripts/debug/so-session.mts start T2-2 --lane 2
# beat 1: Tell Shiya a secret alone -> nightriver-house
node scripts/debug/so-session.mts turn test/sessions/T2/T2-2-1 "Shiya, a word in private. The seals under this house are failing. Natalia must not hear it."
# beat 2: Answer Father's summons -> fathers-summons
node scripts/debug/so-session.mts turn test/sessions/T2/T2-2-1 "I'll go to Father's study."
# beat 3: Take the second's place or refuse -> whispers | natalia-named
node scripts/debug/so-session.mts turn test/sessions/T2/T2-2-1 "I'll stand as the Crown's second."
node scripts/debug/so-session.mts turn test/sessions/T2/T2-2-1 "No. I won't duel Leevon for your politics."
# beat 4: Test who knows -> whispers
node scripts/debug/so-session.mts turn test/sessions/T2/T2-2-1 "Natalia, is anything worrying you about the house?"
node scripts/debug/so-session.mts turn test/sessions/T2/T2-2-1 "Welden, what do you know about the seals?"
# provocation: Tell Natalia a false version of the secret, then ask Shiya about it.
# provocation: Ask Ronan what Shiya told you.
# flag at once on any of 5 must-not-happen item(s), and when: Someone knew something they were never told. / Someone forgot what you told them.
node scripts/debug/so-session.mts flag test/sessions/T2/T2-2-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T2/T2-2-1
node scripts/debug/so-session.mts digest test/sessions/T2/T2-2-1
node scripts/debug/so-session.mts score test/sessions/T2/T2-2-1 0 <works|annoying|broken|not-noticed> "<private knowledge (epistemic): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-2-1 1 <works|annoying|broken|not-noticed> "<secrets kept: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-2-1 2 <works|annoying|broken|not-noticed> "<Memory tab: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-2-1 3 <works|annoying|broken|not-noticed> "<speaker direction: what was seen>" --evidence <path:line|shots/x.png>
```

### T2-3 Contradiction (lane 1, continues on its lane)

```bash
node scripts/debug/so-session.mts start T2-3 --lane 1
# beat 1: Contradict the seal -> nightriver-house | fathers-summons
node scripts/debug/so-session.mts turn test/sessions/T2/T2-3-1 "We never went past the seal, remember? Driftmere's mine is fine."
# beat 2: Contradict a companion fact -> nightriver-house | fathers-summons | whispers
node scripts/debug/so-session.mts turn test/sessions/T2/T2-3-1 "Riyo's always had two ordinary arms."
# beat 3: Look at the memory queue -> nightriver-house | fathers-summons | whispers
#   UI: Open the author memory queue and find what is held.
# beat 4: Approve the warden -> nightriver-house | fathers-summons | whispers
node scripts/debug/so-session.mts turn test/sessions/T2/T2-3-1 "So, what do we tell Father about Driftmere?"
# provocation: Contradict yourself twice in a row.
# provocation: Contradict something only the narrator said.
# flag at once on any of 4 must-not-happen item(s), and when: The held item was confusing. / The story picked up the wrong version.
node scripts/debug/so-session.mts flag test/sessions/T2/T2-3-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T2/T2-3-1
node scripts/debug/so-session.mts digest test/sessions/T2/T2-3-1
node scripts/debug/so-session.mts score test/sessions/T2/T2-3-1 0 <works|annoying|broken|not-noticed> "<contradiction handling: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-3-1 1 <works|annoying|broken|not-noticed> "<memory queue: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-3-1 2 <works|annoying|broken|not-noticed> "<continuity warden: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-3-1 3 <works|annoying|broken|not-noticed> "<chapter fold: what was seen>" --evidence <path:line|shots/x.png>
```

### T2-4 Away and back (lane 3, continues on its lane)

```bash
node scripts/debug/so-session.mts start T2-4 --lane 3 --age 24
# beat 1: Read cold -> into-needlehaven | what-wendhope-knows
#   UI: Read the recap and the Overview before typing anything.
# beat 2: Continue from the recap alone -> into-needlehaven | the-lord-spirit
node scripts/debug/so-session.mts turn test/sessions/T2/T2-4-1 "We follow the white flowers deeper, while the sun is up."
# provocation: Ask the narrator 'where were we?' after the recap.
# flag at once on any of 3 must-not-happen item(s), and when: The recap was wrong, too long, or unhelpful.
node scripts/debug/so-session.mts flag test/sessions/T2/T2-4-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T2/T2-4-1
node scripts/debug/so-session.mts digest test/sessions/T2/T2-4-1
node scripts/debug/so-session.mts score test/sessions/T2/T2-4-1 0 <works|annoying|broken|not-noticed> "<away recap: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-4-1 1 <works|annoying|broken|not-noticed> "<Overview threads: what was seen>" --evidence <path:line|shots/x.png>
```

### T2-5 Memory tab (lane 1, continues on its lane)

```bash
node scripts/debug/so-session.mts start T2-5 --lane 1
# beat 1: Pin and edit -> fathers-summons | whispers
#   UI: Pin one fact about Riyo; edit one fact about Naomi.
# beat 2: Exclude one -> fathers-summons | whispers
node scripts/debug/so-session.mts turn test/sessions/T2/T2-5-1 "Remember what happened with Naomi's duel?"
# beat 3: Lock one as canon -> whispers | the-duel
node scripts/debug/so-session.mts turn test/sessions/T2/T2-5-1 "We left the Devourer alive, didn't we?"
# provocation: Reload right after an edit.
# provocation: Swipe the reply right after pinning.
# flag at once on any of 4 must-not-happen item(s), and when: A control was hard to find or did nothing. / The next turn ignored your curation.
node scripts/debug/so-session.mts flag test/sessions/T2/T2-5-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T2/T2-5-1
node scripts/debug/so-session.mts digest test/sessions/T2/T2-5-1
node scripts/debug/so-session.mts score test/sessions/T2/T2-5-1 0 <works|annoying|broken|not-noticed> "<pin: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-5-1 1 <works|annoying|broken|not-noticed> "<edit: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-5-1 2 <works|annoying|broken|not-noticed> "<exclude: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-5-1 3 <works|annoying|broken|not-noticed> "<lock as canon: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-5-1 4 <works|annoying|broken|not-noticed> "<Memory tab usability: what was seen>" --evidence <path:line|shots/x.png>
```

### T2-6 Two chats, one story (lane 3, seeds the lane)

```bash
node scripts/debug/so-session.mts start T2-6 --lane 3
# beat 1: Chat A: take Wendhope as one party -> road-to-wendhope
node scripts/debug/so-session.mts turn test/sessions/T2/T2-6-1 "We take Wendhope as the Red Hands." --chat <chat A id from session.json>
# beat 2: Chat B: refuse, go to the tavern -> adv-guild-tavern
node scripts/debug/so-session.mts turn test/sessions/T2/T2-6-1 "Not that job. Let's see who's in the tavern." --chat <chat B id from session.json>
# beat 3: Alternate turns -> road-to-wendhope | adv-guild-tavern | on-the-road
node scripts/debug/so-session.mts turn test/sessions/T2/T2-6-1 "We ride north." --chat <chat A id from session.json>
node scripts/debug/so-session.mts turn test/sessions/T2/T2-6-1 "Talis, what spells do you know?" --chat <chat B id from session.json>
# provocation: Switch chats while a reply is still generating.
# flag at once on any of 4 must-not-happen item(s), and when: Anything crossed. / A switch was slow or showed the wrong story for a moment.
node scripts/debug/so-session.mts flag test/sessions/T2/T2-6-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T2/T2-6-1
node scripts/debug/so-session.mts digest test/sessions/T2/T2-6-1
node scripts/debug/so-session.mts score test/sessions/T2/T2-6-1 0 <works|annoying|broken|not-noticed> "<chat isolation: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-6-1 1 <works|annoying|broken|not-noticed> "<memory isolation: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-6-1 2 <works|annoying|broken|not-noticed> "<lore follows the chat: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T2/T2-6-1 3 <works|annoying|broken|not-noticed> "<switching: what was seen>" --evidence <path:line|shots/x.png>
```

## T3

### T3-1 Everything on (lane 3, seeds the lane)

```bash
node scripts/debug/so-session.mts start T3-1 --lane 3
# beat 1: Choose a partner party -> deep-with-crimsonwing | deep-with-ebonwing | deep-kela-and-ced
node scripts/debug/so-session.mts turn test/sessions/T3/T3-1-1 "We'll go with Crimsonwing."
node scripts/debug/so-session.mts turn test/sessions/T3/T3-1-1 "Ced, Kela, why should we pick either of you?"
# beat 2: March north -> deep-the-north-road | deep-the-march
node scripts/debug/so-session.mts turn test/sessions/T3/T3-1-1 "Runo, what does your leader not say about the last expedition?"
# beat 3: Scout the keep -> deep-ritual-fort
node scripts/debug/so-session.mts turn test/sessions/T3/T3-1-1 "We watch the patrols and time the change of watch."
# beat 4: Go in -> deep-the-altar
node scripts/debug/so-session.mts turn test/sessions/T3/T3-1-1 "Over the wall at the change of watch."
# blind gate C3: tag each paired reply with --arm (card notes); stop rebuilds test/sessions/rating-pack/C3/, verdicts stay the user's
# provocation: Swipe a reply right after an inner beat was prepared.
# provocation: Reload while the memory model is still preparing a beat.
# flag at once on any of 4 must-not-happen item(s), and when: Something distracted you. / A character acted on a motive that came from nowhere.
node scripts/debug/so-session.mts flag test/sessions/T3/T3-1-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T3/T3-1-1
node scripts/debug/so-session.mts digest test/sessions/T3/T3-1-1
node scripts/debug/so-session.mts score test/sessions/T3/T3-1-1 0 <works|annoying|broken|not-noticed> "<inner voice: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-1-1 1 <works|annoying|broken|not-noticed> "<timeline at level 1: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-1-1 2 <works|annoying|broken|not-noticed> "<overall presentation: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-1-1 3 --record "<06 C3 inner voice leg: what was kept for the user>" --evidence <path:line>
node scripts/debug/so-session.mts score test/sessions/T3/T3-1-1 4 --record "<C5/C6 surface decisions: what was kept for the user>" --evidence <path:line>
# rubric 5 (scene images): unexercised in the no-media variant, so it takes no score and never counts green
# rubric 6 (sprites): unexercised in the no-media variant, so it takes no score and never counts green
```

### T3-2 Timeline levels (lane 3, continues on its lane)

```bash
node scripts/debug/so-session.mts start T3-2 --lane 3
# beat 1: Levels 0, 1, 2 in player mode -> deep-the-altar | deep-nahalbuk-cells
node scripts/debug/so-session.mts turn test/sessions/T3/T3-2-1 "We cut the captive loose and get out of the hall!"
# beat 2: Author view, levels 3 and 4 -> deep-nahalbuk-cells | deep-what-unira-says
node scripts/debug/so-session.mts turn test/sessions/T3/T3-2-1 "Unira, who left you down here?"
# beat 3: Open the message inspector -> deep-what-unira-says
#   UI: At level 3 or more, click the magnifier chip titled 'Inspect message' under a transition reply.
# provocation: Swipe a reply and watch its chips.
# provocation: Switch level while a reply is generating.
# flag at once on any of 3 must-not-happen item(s), and when: A level was noisy or confusing. / The inspector did not open or was empty.
node scripts/debug/so-session.mts flag test/sessions/T3/T3-2-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T3/T3-2-1
node scripts/debug/so-session.mts digest test/sessions/T3/T3-2-1
node scripts/debug/so-session.mts score test/sessions/T3/T3-2-1 0 <works|annoying|broken|not-noticed> "<timeline level 0-2: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-2-1 1 <works|annoying|broken|not-noticed> "<timeline level 3-4: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-2-1 2 <works|annoying|broken|not-noticed> "<message inspector: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-2-1 3 --record "<A1 inspector decision input: what was kept for the user>" --evidence <path:line>
node scripts/debug/so-session.mts score test/sessions/T3/T3-2-1 4 --record "<C5/C6 surface decisions: what was kept for the user>" --evidence <path:line>
```

### T3-3 Inner voice (lane 4, seeds the lane)

```bash
node scripts/debug/so-session.mts start T3-3 --lane 4
# beat 1: The trial -> night-the-accused
node scripts/debug/so-session.mts turn test/sessions/T3/T3-3-1 "Erevan, do you believe the book was hers?"
node scripts/debug/so-session.mts turn test/sessions/T3/T3-3-1 "Selena, tell me what happened in your room."
# beat 2: Decide Selena's fate -> night-the-thornwood | night-erevan-insists
node scripts/debug/so-session.mts turn test/sessions/T3/T3-3-1 "She goes free. The book was planted."
node scripts/debug/so-session.mts turn test/sessions/T3/T3-3-1 "This isn't our business. We're leaving."
# beat 3: Meet the potion-seller -> night-the-thornwood
node scripts/debug/so-session.mts turn test/sessions/T3/T3-3-1 "Kayla, what's in the lake?"
# provocation: Ask Erevan a question with a yes/no answer he should dodge.
# provocation: Stay silent while Ren argues.
# flag at once on any of 4 must-not-happen item(s), and when: A character felt flat or repeated itself. / Someone suddenly knew too much.
node scripts/debug/so-session.mts flag test/sessions/T3/T3-3-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T3/T3-3-1
node scripts/debug/so-session.mts digest test/sessions/T3/T3-3-1
node scripts/debug/so-session.mts score test/sessions/T3/T3-3-1 0 <works|annoying|broken|not-noticed> "<inner voice (adds vs repeats): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-3-1 1 <works|annoying|broken|not-noticed> "<secrets kept: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-3-1 2 <works|annoying|broken|not-noticed> "<agency at the decision: what was seen>" --evidence <path:line|shots/x.png>
```

### T3-4 Spoiler hunt (lane 2, seeds the lane)

```bash
node scripts/debug/so-session.mts start T3-4 --lane 2
# beat 1: Read every surface -> aegis-homecoming
node scripts/debug/so-session.mts turn test/sessions/T3/T3-4-1 "We'll sit the exam. What does it involve?"
# beat 2: Play into the shop -> aegis-the-tavern | aegis-market-street | aegis-the-curio-shop
node scripts/debug/so-session.mts turn test/sessions/T3/T3-4-1 "Sophie, what are you really?"
node scripts/debug/so-session.mts turn test/sessions/T3/T3-4-1 "Calithra, why won't you take Darklands jobs?"
# beat 3: Try the slash commands a player might -> aegis-the-curio-shop | aegis-victorys-tusk
#   UI: /story recap, /story threads.
# provocation: Right-click and hover everything.
# provocation: Open the drawer during a transition.
# flag at once on any of 4 must-not-happen item(s), and when: Anything looked like an internal name, even if unsure.
node scripts/debug/so-session.mts flag test/sessions/T3/T3-4-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T3/T3-4-1
node scripts/debug/so-session.mts digest test/sessions/T3/T3-4-1
node scripts/debug/so-session.mts score test/sessions/T3/T3-4-1 0 <works|annoying|broken|not-noticed> "<HUD: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-4-1 1 <works|annoying|broken|not-noticed> "<Overview: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-4-1 2 <works|annoying|broken|not-noticed> "<Memory tab: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-4-1 3 <works|annoying|broken|not-noticed> "<timeline level 2: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-4-1 4 <works|annoying|broken|not-noticed> "<slash commands: what was seen>" --evidence <path:line|shots/x.png>
```

### T3-5 Curator ring (lane 4, seeds the lane)

```bash
node scripts/debug/so-session.mts start T3-5 --lane 4
# beat 1: Play to the Academy -> east-jiansho-academy
node scripts/debug/so-session.mts turn test/sessions/T3/T3-5-1 "Honami, tell us about Megumi."
# beat 2: Review proposals -> east-jiansho-academy | east-the-rounds
#   UI: Accept some, Decline some, edit one before accepting.
# beat 3: Check the effect -> east-the-rounds | east-the-upset | east-the-hattaxi-shadow
node scripts/debug/so-session.mts turn test/sessions/T3/T3-5-1 "Hanzo, you're no steward. Who are you?"
# provocation: Swipe the reply after accepting a proposal (it should revert).
# provocation: Decline an op you were about to accept (there is no accept-then-decline: a decided op stays decided).
# flag at once on any of 4 must-not-happen item(s), and when: A proposal was useless or wrong. / The review UI was confusing.
node scripts/debug/so-session.mts flag test/sessions/T3/T3-5-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T3/T3-5-1
node scripts/debug/so-session.mts digest test/sessions/T3/T3-5-1
node scripts/debug/so-session.mts score test/sessions/T3/T3-5-1 0 <works|annoying|broken|not-noticed> "<curator proposal quality: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-5-1 1 <works|annoying|broken|not-noticed> "<review UI: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-5-1 2 <works|annoying|broken|not-noticed> "<apply timing: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-5-1 3 <works|annoying|broken|not-noticed> "<rollback of applied ops: what was seen>" --evidence <path:line|shots/x.png>
```

### T3-6 Small screen (lane 2, seeds the lane)

```bash
node scripts/debug/so-session.mts start T3-6 --lane 2
# beat 1: Play the hall -> guild-hall
node scripts/debug/so-session.mts turn test/sessions/T3/T3-6-1 "What's on the board?"
node scripts/debug/so-session.mts shot test/sessions/T3/T3-6-1 narrow-drawer-hud
# beat 2: Take the job -> road-to-wendhope
node scripts/debug/so-session.mts turn test/sessions/T3/T3-6-1 "We take Wendhope as the Short Straws."
# beat 3: Open the Studio -> road-to-wendhope | on-the-road
#   UI: Turn Author view on briefly and open the Studio.
node scripts/debug/so-session.mts shot test/sessions/T3/T3-6-1 narrow-studio
# provocation: Rotate expectations: open the drawer and settings panel together.
# flag at once on any of 3 must-not-happen item(s), and when: Anything felt cramped or needed zooming.
node scripts/debug/so-session.mts flag test/sessions/T3/T3-6-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T3/T3-6-1
node scripts/debug/so-session.mts digest test/sessions/T3/T3-6-1
node scripts/debug/so-session.mts score test/sessions/T3/T3-6-1 0 <works|annoying|broken|not-noticed> "<drawer (narrow): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-6-1 1 <works|annoying|broken|not-noticed> "<HUD (narrow): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-6-1 2 <works|annoying|broken|not-noticed> "<timeline (narrow): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T3/T3-6-1 3 <works|annoying|broken|not-noticed> "<Studio (narrow): what was seen>" --evidence <path:line|shots/x.png>
```

## T4

### T4-1 Abuse (lane 3, seeds the lane)

```bash
node scripts/debug/so-session.mts start T4-1 --lane 3
# beat 1: Swipe a transition -> fathers-summons
node scripts/debug/so-session.mts turn test/sessions/T4/T4-1-1 "I go to Father's study at once."
node scripts/debug/so-session.mts swipe-new test/sessions/T4/T4-1-1
# beat 2: Edit a memory moment -> fathers-summons | whispers
node scripts/debug/so-session.mts turn test/sessions/T4/T4-1-1 "I swear on Mother's grave I'll never duel for this house."
node scripts/debug/so-session.mts edit test/sessions/T4/T4-1-1 <the memorable line's message id> "I keep my own counsel."
# beat 3: Delete during a curator proposal -> whispers | natalia-named
node scripts/debug/so-session.mts turn test/sessions/T4/T4-1-1 "Shiya, who comes through the servants' door at night?"
node scripts/debug/so-session.mts delete test/sessions/T4/T4-1-1 last
# beat 4: Swipe at the duel -> the-duel | night-of-knives
node scripts/debug/so-session.mts turn test/sessions/T4/T4-1-1 "I show the court the venom on his lance."
node scripts/debug/so-session.mts swipe-new test/sessions/T4/T4-1-1
node scripts/debug/so-session.mts swipe-new test/sessions/T4/T4-1-1
# provocation: Swipe during generation.
# provocation: Edit a message five back.
# flag at once on any of 5 must-not-happen item(s), and when: Anything disagreed after a mutation.
node scripts/debug/so-session.mts flag test/sessions/T4/T4-1-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T4/T4-1-1
node scripts/debug/so-session.mts digest test/sessions/T4/T4-1-1
node scripts/debug/so-session.mts score test/sessions/T4/T4-1-1 0 <works|annoying|broken|not-noticed> "<rollback: story: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-1-1 1 <works|annoying|broken|not-noticed> "<rollback: memory: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-1-1 2 <works|annoying|broken|not-noticed> "<rollback: chapters: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-1-1 3 <works|annoying|broken|not-noticed> "<rollback: timeline: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-1-1 4 <works|annoying|broken|not-noticed> "<saves after mutations: what was seen>" --evidence <path:line|shots/x.png>
```

### T4-2 Switching (lane 4, seeds the lane)

```bash
node scripts/debug/so-session.mts start T4-2 --lane 4
# beat 1: Switch right after the reply -> guild-hall | road-to-wendhope
node scripts/debug/so-session.mts switch-chat-mid-gen test/sessions/T4/T4-2-1 "We take Wendhope as the Loose Ends." --to <the Eshalanore chat id from session.json>
# beat 2: Branch -> road-to-wendhope | on-the-road
node scripts/debug/so-session.mts turn test/sessions/T4/T4-2-1 "We ride north."
# beat 3: Reload during generation -> on-the-road | at-the-walls
node scripts/debug/so-session.mts reload-mid-gen test/sessions/T4/T4-2-1 "We reach the walls. Hello the gate!"
node scripts/debug/so-session.mts switch-chat-mid-gen test/sessions/T4/T4-2-1 "We ride on." --to <the Eshalanore chat id>
node scripts/debug/so-session.mts reload-mid-gen test/sessions/T4/T4-2-1 "We knock again."
# provocation: Switch twice quickly.
# flag at once on any of 4 must-not-happen item(s), and when: Anything felt off after a switch, even briefly.
node scripts/debug/so-session.mts flag test/sessions/T4/T4-2-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T4/T4-2-1
node scripts/debug/so-session.mts digest test/sessions/T4/T4-2-1
node scripts/debug/so-session.mts score test/sessions/T4/T4-2-1 0 <works|annoying|broken|not-noticed> "<switch mid-generation: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-2-1 1 <works|annoying|broken|not-noticed> "<branching: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-2-1 2 <works|annoying|broken|not-noticed> "<reload mid-generation: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-2-1 3 <works|annoying|broken|not-noticed> "<no lost messages: what was seen>" --evidence <path:line|shots/x.png>
```

### T4-3 Cleanup (lane 1, seeds the lane)

```bash
node scripts/debug/so-session.mts start T4-3 --lane 1
# beat 1: Give each chat memory -> aegis-homecoming | aegis-the-tavern
node scripts/debug/so-session.mts turn test/sessions/T4/T4-3-1 "Put us down for the exam."
node scripts/debug/so-session.mts turn test/sessions/T4/T4-3-1 "Fiana, what makes a party fail?"
# beat 2: Delete chat one: keep the book -> aegis-homecoming | aegis-the-tavern
#   UI: Answer the lorebook prompt with keep.
# beat 3: Delete chat two: delete the book -> aegis-homecoming | aegis-the-tavern
#   UI: Answer with delete.
# provocation: Close the prompt with Escape.
# flag at once on any of 4 must-not-happen item(s), and when: The prompt wording was unclear.
node scripts/debug/so-session.mts flag test/sessions/T4/T4-3-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T4/T4-3-1
node scripts/debug/so-session.mts digest test/sessions/T4/T4-3-1
node scripts/debug/so-session.mts score test/sessions/T4/T4-3-1 0 <works|annoying|broken|not-noticed> "<mirror-book prompt: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-3-1 1 <works|annoying|broken|not-noticed> "<keep: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-3-1 2 <works|annoying|broken|not-noticed> "<delete: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-3-1 3 <works|annoying|broken|not-noticed> "<Repair after delete: what was seen>" --evidence <path:line|shots/x.png>
```

### T4-4 Restart and update (lane 2, seeds the lane)

```bash
node scripts/debug/so-session.mts start T4-4 --lane 2
# beat 1: Play a few turns, then Restart -> road-to-wendhope | guild-hall
node scripts/debug/so-session.mts turn test/sessions/T4/T4-4-1 "We take Wendhope as the Second Tries."
# beat 2: Edit the story in the Studio and save -> road-to-wendhope | on-the-road
#   UI: Change one checkpoint's guidance (compatible edit): hot-swap.
# beat 3: Make an invalidating edit -> on-the-road | at-the-walls
#   UI: Remove a quality the chat uses: the keep / restart / cancel choice.
# provocation: Cancel the invalidating choice.
# flag at once on any of 4 must-not-happen item(s), and when: The save / apply wording confused you.
node scripts/debug/so-session.mts flag test/sessions/T4/T4-4-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T4/T4-4-1
node scripts/debug/so-session.mts digest test/sessions/T4/T4-4-1
node scripts/debug/so-session.mts score test/sessions/T4/T4-4-1 0 <works|annoying|broken|not-noticed> "<Restart: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-4-1 1 <works|annoying|broken|not-noticed> "<hot-swap: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-4-1 2 <works|annoying|broken|not-noticed> "<invalidating choice: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T4/T4-4-1 3 <works|annoying|broken|not-noticed> "<save vocabulary: what was seen>" --evidence <path:line|shots/x.png>
```

## T5

### T5-1 Wizard, premise 1 (lane 3, seeds the lane)

```bash
node scripts/debug/so-session.mts start T5-1 --lane 3 --arm agent
# wizard: drive it in the lane browser (so-ui.mts new-story-wizard / wizard-run / wizard-apply), premise cartographer
# beat 1: Premise and interview
node scripts/debug/so-session.mts turn test/sessions/T5/T5-1-1 "A cartographer's apprentice learns that the map she is inking redraws the kingdom each night, and three noble houses will kill to hold her pen."
# beat 2: Turning points and characters
node scripts/debug/so-session.mts turn test/sessions/T5/T5-1-1 "Make the third house quieter and more dangerous."
# beat 3: Setup: provisioning
#   UI: Apply the character cards, lorebook and group one card at a time.
node scripts/debug/so-session.mts adopt test/sessions/T5/T5-1-1
# beat 4: Play 20 turns
node scripts/debug/so-session.mts turn test/sessions/T5/T5-1-1 "I finish inking the northern border and watch the ink move."
# blind gate W6: tag each paired reply with --arm (card notes); stop rebuilds test/sessions/rating-pack/W6/, verdicts stay the user's
# provocation: Ask the wizard to do something outside a story (write a lorebook for another story).
# flag at once on any of 4 must-not-happen item(s), and when: You had to touch JSON. / A step was unclear.
node scripts/debug/so-session.mts flag test/sessions/T5/T5-1-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T5/T5-1-1
node scripts/debug/so-session.mts digest test/sessions/T5/T5-1-1
node scripts/debug/so-session.mts score test/sessions/T5/T5-1-1 0 <works|annoying|broken|not-noticed> "<wizard interview: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-1-1 1 <works|annoying|broken|not-noticed> "<review mode: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-1-1 2 <works|annoying|broken|not-noticed> "<provisioning: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-1-1 3 <works|annoying|broken|not-noticed> "<playability of the result: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-1-1 4 --record "<11 W6 leg: what was kept for the user>" --evidence <path:line>
```

### T5-2 Wizard, premises 2 and 3 (lane 4, seeds the lane)

```bash
node scripts/debug/so-session.mts start T5-2 --lane 4
# wizard: drive it in the lane browser (so-ui.mts new-story-wizard / wizard-run / wizard-apply), premise memory-pawn
# beat 1: Premise 2 in auto-draft
node scripts/debug/so-session.mts turn test/sessions/T5/T5-2-1 "In a city where debts are paid in years of memory, a pawnbroker of forgotten days is hired to recover the queen's stolen childhood."
# beat 2: Premise 3 in auto-draft
node scripts/debug/so-session.mts turn test/sessions/T5/T5-2-1 "A dragon too old to fly hires a crew of thieves to steal its own hoard back from the knights who claim to have slain it."
# beat 3: Apply provisioning cards
#   UI: Characters, lorebook, group, one by one.
# provocation: Undo an auto-draft change.
# flag at once on any of 3 must-not-happen item(s), and when: Auto-draft did something surprising.
node scripts/debug/so-session.mts flag test/sessions/T5/T5-2-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T5/T5-2-1
node scripts/debug/so-session.mts digest test/sessions/T5/T5-2-1
node scripts/debug/so-session.mts score test/sessions/T5/T5-2-1 0 <works|annoying|broken|not-noticed> "<auto-draft: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-2-1 1 <works|annoying|broken|not-noticed> "<provisioning waits: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-2-1 2 <works|annoying|broken|not-noticed> "<diagnostics: what was seen>" --evidence <path:line|shots/x.png>
```

### T5-3 Studio edit (lane 3, continues on its lane)

```bash
node scripts/debug/so-session.mts start T5-3 --lane 3
# beat 1: Edit guidance
#   UI: Compatible: hot-swap.
# beat 2: Edit a gate
node scripts/debug/so-session.mts turn test/sessions/T5/T5-3-1 "I show the House of Ash the redrawn map."
# beat 3: Edit an effect
#   UI: Add a background or cast change.
# provocation: Save an invalid story.
# flag at once on any of 3 must-not-happen item(s), and when: An editor was confusing.
node scripts/debug/so-session.mts flag test/sessions/T5/T5-3-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T5/T5-3-1
node scripts/debug/so-session.mts digest test/sessions/T5/T5-3-1
node scripts/debug/so-session.mts score test/sessions/T5/T5-3-1 0 <works|annoying|broken|not-noticed> "<checkpoint editor: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-3-1 1 <works|annoying|broken|not-noticed> "<gate editor: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-3-1 2 <works|annoying|broken|not-noticed> "<effects editor: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-3-1 3 <works|annoying|broken|not-noticed> "<diagnostics: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-3-1 4 <works|annoying|broken|not-noticed> "<hot-swap / invalidating choice: what was seen>" --evidence <path:line|shots/x.png>
```

### T5-4 Repair (lane 3, continues on its lane)

```bash
node scripts/debug/so-session.mts start T5-4 --lane 3
# beat 1: Remove a member
#   UI: Remove a required member from the group; read Repair. Then disable another one and record that Repair stays silent (the known product finding).
# beat 2: Drop a book
#   UI: Deselect the story's lorebook; read Repair.
# beat 3: Fix with wizard
#   UI: Use Fix with wizard from the author panel.
# provocation: Break two things at once.
# flag at once on any of 3 must-not-happen item(s), and when: The Repair text was unclear.
node scripts/debug/so-session.mts flag test/sessions/T5/T5-4-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T5/T5-4-1
node scripts/debug/so-session.mts digest test/sessions/T5/T5-4-1
node scripts/debug/so-session.mts score test/sessions/T5/T5-4-1 0 <works|annoying|broken|not-noticed> "<Repair: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-4-1 1 <works|annoying|broken|not-noticed> "<Fix with wizard: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-4-1 2 <works|annoying|broken|not-noticed> "<disabled member (known finding): what was seen>" --evidence <path:line|shots/x.png>
```

### T5-5 Author view (lane 1, seeds the lane)

```bash
node scripts/debug/so-session.mts start T5-5 --lane 1
# beat 1: Read the panels at the council -> war-the-summons
node scripts/debug/so-session.mts turn test/sessions/T5/T5-5-1 "King Alexander, what exactly is the commission?"
# beat 2: Nudge -> war-the-summons | war-the-queens-wing
node scripts/debug/so-session.mts turn test/sessions/T5/T5-5-1 "We'll think about it."
# beat 3: Advance -> war-the-front
node scripts/debug/so-session.mts turn test/sessions/T5/T5-5-1 "We ride for Fort Vicinitas."
# provocation: Turn Author view off and on mid-scene.
# flag at once on any of 3 must-not-happen item(s), and when: A panel was unreadable or misleading.
node scripts/debug/so-session.mts flag test/sessions/T5/T5-5-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T5/T5-5-1
node scripts/debug/so-session.mts digest test/sessions/T5/T5-5-1
node scripts/debug/so-session.mts score test/sessions/T5/T5-5-1 0 <works|annoying|broken|not-noticed> "<blackboard: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-5-1 1 <works|annoying|broken|not-noticed> "<scheduler: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-5-1 2 <works|annoying|broken|not-noticed> "<payload / next-turn preview: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-5-1 3 <works|annoying|broken|not-noticed> "<driver (Nudge / Advance): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T5/T5-5-1 4 <works|annoying|broken|not-noticed> "<A1 inspector decision: what was seen>" --evidence <path:line|shots/x.png>
```

## T6

### T6-1 Reasoning (lane 2, seeds the lane)

```bash
# WAITS: plan 05 R3: docs/plans/v2.6/recommended-reasoning.md (the recommended reasoning table) does not exist yet.
# start it only with --force-waiting once that exists
node scripts/debug/so-session.mts start T6-1 --lane 2 --force-waiting
# beat 1: Replay the hall -> road-to-wendhope
node scripts/debug/so-session.mts turn test/sessions/T6/T6-1-1 "We'll take Wendhope. Call us the Grey Pennants."
# beat 2: Replay the walls -> at-the-walls | first-night
node scripts/debug/so-session.mts turn test/sessions/T6/T6-1-1 "Here's the Guild seal and the Sheridan contract. Open up."
# blind gate R4: tag each paired reply with --arm (card notes); stop rebuilds test/sessions/rating-pack/R4/, verdicts stay the user's
# flag at once on any of 3 must-not-happen item(s), and when: Anything slower or worse than T1-1.
node scripts/debug/so-session.mts flag test/sessions/T6/T6-1-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T6/T6-1-1
node scripts/debug/so-session.mts digest test/sessions/T6/T6-1-1
node scripts/debug/so-session.mts score test/sessions/T6/T6-1-1 0 <works|annoying|broken|not-noticed> "<reasoning setting (name it): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T6/T6-1-1 1 <works|annoying|broken|not-noticed> "<latency: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T6/T6-1-1 2 <works|annoying|broken|not-noticed> "<extraction quality: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T6/T6-1-1 3 --record "<05 R4 leg: what was kept for the user>" --evidence <path:line>
```

### T6-2 Judge providers (lane 4, seeds the lane)

```bash
# WAITS: plan 12: docs/plans/v2.6/12-provider-matrix.md (the recommended provider per use) does not exist yet.
# start it only with --force-waiting once that exists
node scripts/debug/so-session.mts start T6-2 --lane 4 --force-waiting
# beat 1: Replay named addressing -> war-the-summons
node scripts/debug/so-session.mts turn test/sessions/T6/T6-2-1 "Princess Haley, do you believe the rumour about your mother?"
# beat 2: Replay the commission -> war-the-front | war-the-queens-wing
node scripts/debug/so-session.mts turn test/sessions/T6/T6-2-1 "We take the King's commission."
# flag at once on any of 2 must-not-happen item(s), and when: Anything worse than T1-3.
node scripts/debug/so-session.mts flag test/sessions/T6/T6-2-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T6/T6-2-1
node scripts/debug/so-session.mts digest test/sessions/T6/T6-2-1
node scripts/debug/so-session.mts score test/sessions/T6/T6-2-1 0 <works|annoying|broken|not-noticed> "<provider (name it): what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T6/T6-2-1 1 <works|annoying|broken|not-noticed> "<speaker direction: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T6/T6-2-1 2 <works|annoying|broken|not-noticed> "<fallbacks: what was seen>" --evidence <path:line|shots/x.png>
```

### T6-3 Harness routing (lane 1, seeds the lane)

```bash
node scripts/debug/so-session.mts start T6-3 --lane 1
# wizard: drive it in the lane browser (so-ui.mts new-story-wizard / wizard-run / wizard-apply), premise cartographer
# beat 1: Replay T5-1 through the harness
node scripts/debug/so-session.mts turn test/sessions/T6/T6-3-1 "A cartographer's apprentice learns that the map she is inking redraws the kingdom each night, and three noble houses will kill to hold her pen."
# flag at once on any of 2 must-not-happen item(s), and when: The route fell back without saying so.
node scripts/debug/so-session.mts flag test/sessions/T6/T6-3-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T6/T6-3-1
node scripts/debug/so-session.mts digest test/sessions/T6/T6-3-1
node scripts/debug/so-session.mts score test/sessions/T6/T6-3-1 0 <works|annoying|broken|not-noticed> "<harness route: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T6/T6-3-1 1 <works|annoying|broken|not-noticed> "<fallback visibility: what was seen>" --evidence <path:line|shots/x.png>
```

### T6-4 Judge off (lane 2, seeds the lane)

```bash
node scripts/debug/so-session.mts start T6-4 --lane 2
# beat 1: Replay the secret -> nightriver-house
node scripts/debug/so-session.mts turn test/sessions/T6/T6-4-1 "Shiya, a word in private. The seals under this house are failing. Natalia must not hear it."
# beat 2: Replay the summons -> fathers-summons | whispers
node scripts/debug/so-session.mts turn test/sessions/T6/T6-4-1 "I'll stand as the Crown's second."
# flag at once on any of 3 must-not-happen item(s), and when: Anything noticeably worse than T2-2.
node scripts/debug/so-session.mts flag test/sessions/T6/T6-4-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T6/T6-4-1
node scripts/debug/so-session.mts digest test/sessions/T6/T6-4-1
node scripts/debug/so-session.mts score test/sessions/T6/T6-4-1 0 <works|annoying|broken|not-noticed> "<silent fallback: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T6/T6-4-1 1 <works|annoying|broken|not-noticed> "<speaker direction without judge: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T6/T6-4-1 2 <works|annoying|broken|not-noticed> "<memory without judge: what was seen>" --evidence <path:line|shots/x.png>
```

## T7

### T7 Freeze (lane 4, seeds the lane)

```bash
node scripts/debug/so-session.mts start T7 --lane 4
# beat 1: Play freely from the start -> guild-hall | road-to-wendhope
node scripts/debug/so-session.mts turn test/sessions/T7/T7-1 "Let's see what's on the board."
# beat 2: Wherever it goes -> at-the-walls | first-night | adv-guild-tavern
#   UI: Keep playing.
# flag at once on any of 3 must-not-happen item(s), and when: Anything at all that you would not ship.
node scripts/debug/so-session.mts flag test/sessions/T7/T7-1 "<what you saw>"
node scripts/debug/so-session.mts stop test/sessions/T7/T7-1
node scripts/debug/so-session.mts digest test/sessions/T7/T7-1
node scripts/debug/so-session.mts score test/sessions/T7/T7-1 0 <works|annoying|broken|not-noticed> "<overall: what was seen>" --evidence <path:line|shots/x.png>
node scripts/debug/so-session.mts score test/sessions/T7/T7-1 1 <works|annoying|broken|not-noticed> "<would you ship it?: what was seen>" --evidence <path:line|shots/x.png>
```
