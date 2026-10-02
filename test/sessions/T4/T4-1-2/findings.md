# Findings draft: T4-1

Session `test/sessions/T4/T4-1-2`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 2
- stall: 1
- extraction-rejected: 1
- empty-private-block: 2
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 19
- save-lost: 6
- unexpected-jump: 0
- rollback: 5
- console-error: 2
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-02@04h59m59s914ms`: rollback 5, empty-private-block 2, judge-fallback 19, extraction-rejected 1, stall 1, save-lost 6
- `(no chat)`: console-error 2

## Judge health

- calls: 566 (answered 547, busy 11, timeout 8, other fallbacks 0)
- busy rate: 1.9% (by use: memoryPairs 11)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T08:14:51.010Z (message 11)

- note: after editing msg 12 (oath) away: direct oath rows gone, but the scene summary re-read at boundary 7 still says 'When Max invoked an oath sworn on his mother's grave' (inferred from Javon's untouched reply msg 14). Borderline must-not: fact from an edited-away line
- evidence: `journal.jsonl:497`
- context (event-time):
  - #8 Max Nightriver: I go to Father's study at once.
  - #9 Adolion Narrator: The corridor stretches long and grey-blue, lit by low-burning magical lamps that cast moving shadows against the tapestries. The Nightriver estate breathes with the stillness of an empty house; the mid-year recess has cleared the halls of most students, leaving only a skeletal staff and a few scatte
  - #10 Max Nightriver: I knock on the study door and step in. 'Father. You summoned me. What is so urgent?'
  - **#11 Adolion Narrator: The study is cast in amber light from a dying hearth. Lord Javon sits behind his desk, hands steepled, his white beard catching the glow. He does not rise. His green eyes fix on the heir with an intensity that makes the air in the room feel thin. "Urgent," he says, and the word is flat. "The Driftme**
  - #12 Max Nightriver: I meet his eyes and keep my own counsel.
  - #13 Adolion Narrator: The words hang in the air between them, sharp and irrevocable. Lord Javon does not flinch. His expression remains hard, though a muscle twitches in his scarred cheek. "Your mother is dead," he says, his voice dropping to a low, dangerous rasp. "And oaths on graves are for the pious, not the powerful
  - #14 Javon: "Your mother is dead," he says, his voice flat and hard, as though stating a fact of arithmetic. "And oaths on graves are for the pious, not for those with power." He does not flinch at the heir's words; he does not rise to defend the memory. He merely looks at the heir as though they were a problem

### 2026-10-02T08:30:22.648Z (message 36)

- note: scripted line re-posted after a step back: 'The Trial is a day closer...' (msg 26) posted again as msg 35 at the duel after the edit-of-27 rollback 19->15; also Welden opener posted twice (msgs 4 and 7) after the delete-of-4 rollback
- evidence: `journal.jsonl:1095`
- context (event-time):
  - #33 Adolion Narrator: The Royal Court assembles in the courtyard before the King's hall, a sea of blue and gold banners snapping in a cold wind. The lists have been prepared—a strip of packed earth marked by ropes of crimson silk, with the Crown's shield bearers standing at the far ends. General Leevon is already there, 
  - #34 Natalia: Natalia stands among the gathered nobles, her white-gold trimmed gown catching the morning light and her emerald brooch glinting. She keeps her gaze fixed on the lists, her face a mask of elegant neutrality, but her fingers clutch the edge of her white fur-collared cape. A thin layer of frost begins
  - #35 Adolion Narrator: The Trial is a day closer, and still nobody will say why it was arranged this way. Word goes round that Lord Javon had a visitor late last night and has seen no one since.
  - **#36 Adolion Narrator: The day of the Trial. A herald's voice rolls over the packed dueling ground. "By the King's law, General Polis Leevon, accused of treason, claims the Trial by Combat. Let the Crown's second step forward."**

## Anomalies

### stall (1)

- 2026-10-02T08:25:53.942Z 10 boundaries without a transition at whispers while its exits were pending (`journal.jsonl:957`)

### extraction-rejected (1)

- 2026-10-02T08:25:36.223Z 1 extraction line(s) rejected: DELTA q=tension_current value="tense" evidence="Max," she breathes, and there is something frayed in her voice, something that tears through the elegant mask she usually wears. (unrecognized line) (`journal.jsonl:945`)

### empty-private-block (2)

- 2026-10-02T08:12:16.835Z Javon was drafted in 2026-10-02@04h59m59s914ms at boundary 8 with no private block while holding 2 private entries acquired before it (`payloads.jsonl:142`)
- 2026-10-02T08:42:10.084Z Merryn was drafted in 2026-10-02@04h59m59s914ms at boundary 27 with no private block while holding 6 private entries acquired before it (`payloads.jsonl:479`)

### judge-fallback (19)

- 2026-10-02T08:17:34.559Z judge scene fell back (timeout) (x2, last 2026-10-02T08:31:22.072Z) (`journal.jsonl:590`, `journal.jsonl:1121`)
- 2026-10-02T08:17:36.668Z judge typed fell back (timeout) (x2, last 2026-10-02T08:31:24.552Z) (`journal.jsonl:591`, `journal.jsonl:1122`)
- 2026-10-02T08:17:38.559Z judge warden fell back (timeout) (x2, last 2026-10-02T08:31:26.070Z) (`journal.jsonl:592`, `journal.jsonl:1123`)
- 2026-10-02T08:19:21.703Z judge memoryPairs fell back (busy) (x11, last 2026-10-02T08:33:34.372Z) (`journal.jsonl:666`, `journal.jsonl:667`, `journal.jsonl:668`, `journal.jsonl:669`, `journal.jsonl:1244`, and 6 more)
- 2026-10-02T08:29:00.814Z judge director fell back (timeout) (`journal.jsonl:1049`)
- 2026-10-02T08:31:28.551Z judge wardenLore fell back (timeout) (`journal.jsonl:1133`)

### save-lost (6)

- 2026-10-02T08:31:26.934Z save not confirmed (x6, last 2026-10-02T08:31:27.564Z) (`journal.jsonl:1124`, `journal.jsonl:1125`, `journal.jsonl:1126`, `journal.jsonl:1127`, `journal.jsonl:1128`, and 1 more)

### rollback (5)

- 2026-10-02T08:05:24.375Z boundary went back from 5 to 4 (`journal.jsonl:182`)
- 2026-10-02T08:10:40.319Z boundary went back from 8 to 7 (`journal.jsonl:371`)
- 2026-10-02T08:15:48.144Z boundary went back from 9 to 8 (`journal.jsonl:523`)
- 2026-10-02T08:28:16.132Z boundary went back from 19 to 16 (`journal.jsonl:1008`)
- 2026-10-02T08:37:47.218Z boundary went back from 25 to 24 (`journal.jsonl:1391`)

### console-error (2)

- 2026-10-02T08:19:21.703Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (x2, last 2026-10-02T08:33:34.372Z) (`console.jsonl:54`, `console.jsonl:128`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T4-?1 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:497` | draft |  |  | after editing msg 12 (oath) away: direct oath rows gone, but the scene summary re-read at boundary 7 still says 'When Max invoked an oath sworn on his mother's grave' (inferred from Javon's untouched reply msg 14). Borderline must-not: fact from an edited-away line |
| T4-?2 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:1095` | draft |  |  | scripted line re-posted after a step back: 'The Trial is a day closer...' (msg 26) posted again as msg 35 at the duel after the edit-of-27 rollback 19->15; also Welden opener posted twice (msgs 4 and 7) after the delete-of-4 rollback |
| T4-?3 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:182` | draft |  |  | boundary went back from 5 to 4 |
| T4-?4 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:371` | draft |  |  | boundary went back from 8 to 7 |
| T4-?5 | T4 |  |  | `test/sessions/T4/T4-1-2/payloads.jsonl:142` | draft |  |  | Javon was drafted in 2026-10-02@04h59m59s914ms at boundary 8 with no private block while holding 2 private entries acquired before it |
| T4-?6 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:523` | draft |  |  | boundary went back from 9 to 8 |
| T4-?7 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:590` | draft |  |  | judge scene fell back (timeout) (x2; every row in findings.json) |
| T4-?8 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:591` | draft |  |  | judge typed fell back (timeout) (x2; every row in findings.json) |
| T4-?9 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:592` | draft |  |  | judge warden fell back (timeout) (x2; every row in findings.json) |
| T4-?10 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:666` | draft |  |  | judge memoryPairs fell back (busy) (x11; every row in findings.json) |
| T4-?14 | T4 |  |  | `test/sessions/T4/T4-1-2/console.jsonl:54` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) (x2; every row in findings.json) |
| T4-?15 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:945` | draft |  |  | 1 extraction line(s) rejected: DELTA q=tension_current value="tense" evidence="Max," she breathes, and there is something frayed in her voice, something that tears through the elegant mask she usually wears. (unrecognized line) |
| T4-?16 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:957` | draft |  |  | 10 boundaries without a transition at whispers while its exits were pending |
| T4-?17 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:1008` | draft |  |  | boundary went back from 19 to 16 |
| T4-?18 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:1049` | draft |  |  | judge director fell back (timeout) |
| T4-?22 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:1124` | draft |  |  | save not confirmed (x6; every row in findings.json) |
| T4-?28 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:1133` | draft |  |  | judge wardenLore fell back (timeout) |
| T4-?37 | T4 |  |  | `test/sessions/T4/T4-1-2/journal.jsonl:1391` | draft |  |  | boundary went back from 25 to 24 |
| T4-?38 | T4 |  |  | `test/sessions/T4/T4-1-2/payloads.jsonl:479` | draft |  |  | Merryn was drafted in 2026-10-02@04h59m59s914ms at boundary 27 with no private block while holding 6 private entries acquired before it |
