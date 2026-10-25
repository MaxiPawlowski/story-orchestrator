# v2.9 02 S6 harder set (`v29-02-s6h`)

Frozen 2026-10-25 before any inference; NOT run (needs the 3090). The 2026-10-23 set (`../frozen.json`, scenarios
`v29-02-s6-*.json`) scored blind attribution 60/60 in both arms: gain 0 at the ceiling. Owner decision 2026-10-25 item 12: Sol
writes a harder card set; floors unchanged (copied into `frozen.json` from `../frozen.json`).

## What makes it harder (stated before inference; `frozen.json` `harderBecause`, Sol's words)

- The three members (Brelan, Nerik, Veska) are peers with the same role, age, pronouns (they/them), rank, personality,
  scenario and first message; `mes_example` is empty. Their cards differ only in hair and eye colour, which no situation uses.
- The old cards differed in role, age and backstory, and the old notes leaned on content (a brother to find, stories from his
  youth), so the rater could attribute by what was said. The new notes are delivery only: clipped/blunt, ornate/formal,
  flowing/warm. Rhythm differs per member.
- The 20 narrator situations are set in the shared packet office and favour no member; reply order rotates per situation.
- Prediction if the feature works: baseline near the three-way chance level, prevention >= 10 points higher. If it does not:
  little or no gain. Ceiling in both arms again would mean this set still leaves a shortcut.

## Files

| File | What |
|---|---|
| `cards.json` | Sol's output, unedited: setting, three cards + sheets, 20 situations, harderBecause |
| `sol-prompt.md` | the prompt |
| `make-arms.mjs` | writes `test/scenarios/v29-02-s6h-baseline.json` / `-prevention.json` from `cards.json` (same step shape as the 2026-10-23 arms) |
| `setup.js` / `teardown.js` | create / remove the three cards and `Group: S6H Clerks` (+ the lane's existing DM Narrator) through `st-eval --file` |
| `rate.mjs` | Sol rater + scorer: attribution per arm, repetition, self-agreement repeat |
| `frozen.json` | sha256 of all of the above, floors, stop rules, rater protocol |

## Run (GPU window; one model lane; never lane 0, 45, or the owner's ST)

Lane 42 shown; any free lane 30+ that is not 45 works. The owner is not playing (the 3090 is theirs).

```bash
node scripts/local/cli.mjs automatic
node scripts/debug/st-lanes.mts seed 42 --fresh
node scripts/debug/st-lanes.mts start 42 --allow-local --headed
```

In the lane: profile `Artemis RunPod RP` -> :18888, context 32768, thinking and inner voice on; images and sprites off (each
arm's first step refuses otherwise). Then:

```bash
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/st-eval.mts --file test/measurements/v2.9/02-s6/harder/setup.js
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/so-run-header.mts capture --label s6h-before
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/st-payload.mts arm --persist --out C:/dev/so-lanes/42/debug/s6h/payloads.jsonl
```

(the payload tail runs in its own terminal until both arms finish), then the arms back to back:

```bash
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/so-scenario.mts run test/scenarios/v29-02-s6h-baseline.json --sandbox --group "Group: S6H Clerks"
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/so-scenario.mts run test/scenarios/v29-02-s6h-prevention.json --sandbox --group "Group: S6H Clerks"
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/st-eval.mts "return Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('so-v29-s6h-baseline-')).map((k) => [k, JSON.parse(localStorage.getItem(k))]))"
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/st-eval.mts "return Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('so-v29-s6h-prevention-')).map((k) => [k, JSON.parse(localStorage.getItem(k))]))"
```

Each `st-eval` prints `Wrote JSON: <path>`; those two files are the dumps. Stop the payload tail, then (no GPU needed from here):

```bash
node test/measurements/v2.9/02-s6/harder/rate.mjs <baseline-dump.json> <prevention-dump.json> C:/dev/so-lanes/42/debug/s6h/rate "<player persona name>"
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/st-eval.mts --file test/measurements/v2.9/02-s6/harder/teardown.js
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/so-run-header.mts diff <s6h-before header> --owned <the two sandbox chats>
node scripts/debug/st-lanes.mts stop 42
node scripts/debug/so-evidence.mts archive --label v29-02-s6h
```

`report.json` gives attribution per arm (correct, unclear, per member), `attributionGainPoints` (floor >= 10),
`repetitionDownPct` (floor >= 25), self-agreement on 10 repeats. Guidance tokens: delivery lines in `payloads.jsonl` for the
prevention arm, chars/4 per drafted request (n, max, p95; floor <= 120). Record in plan 02 as `### S6 harder run <date>`:
counts and denominators only, never retuned. A row stopped by a harness error or backend outage is NOT A MEASUREMENT (stop rule
S5); a partial run is scored only over situations complete in both arms.
