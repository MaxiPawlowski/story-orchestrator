# v2.9 03 S2 shadow rating at plan size

Prepared 2026-10-25; NOT run (needs new Artemis replies on the 3090). Owner decision 2026-10-25 item 8: the S2 rater is Sol
(opencode `openai/gpt-6.1-sol`) instead of DeepSeek.

## Why recorded replies do not suffice

Plan size is 100 eligible replies (a reply the shadow evaluated: verdict accepted, refused or unchanged) in the
prevention + polish arm. Recorded so far: shadow run 1 (prevention on) 1 evaluated; shadow run 2 (prevention off, forced) 11
evaluated (5 accepted, 6 refused) plus 4 rate-limited. 12 of 100, most from the wrong arm, and the dumped chats
(`C:/dev/so-lanes/42/debug/v29gpu/shadow-chats.json`) carry no `extras.polish` ring, so the candidate texts are not on disk
either. The 02 S6 replies (120) have no polish records. New replies are needed.

## Self-rating caveat

The polish route is Sol, and so is the rater: zero-change and preference are Sol judging text Sol wrote. Results are recorded
as self-rated and informational; a lenient self-judge would bias zero-change toward 0 changes and preference toward the
polished version. Attribution is less exposed (the rater picks a speaker from the sheet notes, not its own output) but the
polished text is still Sol's.

## Files

| File | What |
|---|---|
| `make-arm.mjs` | writes `test/scenarios/v29-03-s2-shadow.json` from the 02 S6 prevention arm: same three members and 20 situations, delivery on, story `polish.mode: shadow`, each member's `avoid` extended with 12 stock model phrases (so polish has findings), `polishMaxPerHour` 200 for the run (restored by the runner), final step stores replies + the polish ring in `localStorage` `so-v29-s2-run-<ms>` |
| `rate.mjs` | Sol rater over one or more harvest dumps: the first 100 eligible replies in run order; three Sol calls (zero-change E/K/G/M on accepted, blind A/B preference on accepted, blind attribution of original vs polished on all used); writes `report.json` |

sha256 (frozen 2026-10-25): `make-arm.mjs` `0e03de8aaaaa63c80c343cc52f395401c5dd908b8732579cb28ce8871e3217f4`, `rate.mjs`
`dbc639531f0fec2c697674babff0ad60781caee7910790563dc0bea2ede861ff`, `test/scenarios/v29-03-s2-shadow.json`
`b455bfc152a569b79e1248081ddaa957d5cfce32e93ea167da8e2e681afa2c11`.

Story check (parseStory 0 errors; Studio diagnostics): `delivery-over-budget` on two members (the extended `avoid` lists
do not all fit the 120-token private line, so the line drops the tail of `avoid` while polish still triggers on the whole list:
intended, it is what leaves polish something to find under prevention), `roster-member-is-player` and
`quality-outcome-player-evidence` inherited unchanged from the 02 S6 story.

Scoring (frozen): zero-change = accepted items with any of E/K/G/M yes (floor 0); preference = polished picked / accepted
items, ties count against (floor >= 60 %); attribution gain = (polished correct - original correct) / used, in points (floor
>= 10; original = the prevention-only reply, polished = the same reply with the accepted windows applied, unchanged when not
accepted). Latency/coverage floors are S3 (moved to v3.0).

## Stop rule (plan 11)

N = 100 eligible. Each run is 60 member replies; the eligible rate with prevention on is unknown (2026-10-22 free play: 1 of
22). Run 1 measures it. Stop collecting at >= 100 eligible or after 5 runs (300 replies, about 2.5 h of GPU); below 100 the
report says `informational: n of 100`. Blind/paired metrics need every used item (no early pass). A harness error or outage
stops the run as NOT A MEASUREMENT after one retry (S5).

## Run (GPU window; one model lane; never lane 0, 45, or the owner's ST)

The lane also needs the harness plugin offering opencode sol (the polish role's default route).

```bash
node scripts/local/cli.mjs automatic
node scripts/debug/st-lanes.mts seed 42 --fresh
node scripts/debug/st-lanes.mts start 42 --allow-local --headed
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/so-scenario.mts run test/scenarios/v29-03-s2-shadow.json --sandbox --group "Group: Arin, DM Narrator"
node scripts/debug/st-lanes.mts run 42 -- scripts/debug/st-eval.mts "return Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('so-v29-s2-run-')).map((k) => [k, JSON.parse(localStorage.getItem(k))]))"
```

Repeat the `so-scenario` line until the dump holds >= 100 eligible or 5 runs (the harvest keeps every run). Then, no GPU:

```bash
node test/measurements/v2.9/03-s2/rate.mjs --out C:/dev/so-lanes/42/debug/s2/rate <dump.json printed by st-eval>
node scripts/debug/st-lanes.mts stop 42
node scripts/debug/so-evidence.mts archive --label v29-03-s2
```

Record in plan 03 `### S2 run <date>`: counts with denominators, rater, the self-rating caveat.

Hashes are of the committed (LF) blobs: check with `git show HEAD:<path> | sha256sum`; a CRLF checkout hashes differently.
