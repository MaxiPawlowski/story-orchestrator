# Findings draft: T2-5

Session `test/sessions/T2/T2-5-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 2
- stall: 0
- extraction-rejected: 1
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 1
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 1

### By chat

- `(no chat)`: harness-error 1
- `2026-10-01@16h56m09s049ms`: judge-fallback 1, extraction-rejected 1

## Judge health

- calls: 77 (answered 76, busy 0, timeout 1, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-01T23:59:35.776Z (message 151)

- note: Excluded both 'Javon's conditions' facts (gone from the memory block of the next prompt, payloads index 3), but the same content still rides in [Open threads] ('Javon demands Max explain his conduct at the mines...') and Natalia's reply (msg 151) uses it.
- evidence: `journal.jsonl:1156`
- context (event-time):
  - #148 Max Nightriver: Natalia, have you ever actually met Baroness Serenola? What did you make of her?
  - #149 Natalia: *Natalia pauses, her expression shifting into something genuinely thoughtful. She looks away from Max for a moment, gazing at the ornate ceiling.* "Once. Years ago, when Father brought me to a council meeting. She is... unpleasant." *The corner of her mouth turns up in a ghost of a smile.* "Tough as
  - #150 Max Nightriver: Natalia, Father said he'd only tell me the whole truth on conditions. Do you know what he wants from me first?
  - **#151 Natalia: *Natalia lets out a sharp, short laugh that doesn't reach her eyes.* "Conditions. Father's favorite word for chains." *She leans back against the railing, her emerald eyes studying Max with unsettling intensity.* "He wants to ensure you're broken. That you've learned your place in the family before **

### 2026-10-02T00:05:46.273Z (message 156)

- note: Locked fact did not win: after Lock as canon on 'killing the Devourer released them into dust' (row still 'held out: folded', not in any later prompt), 'We left the Devourer alive' was stored LIVE twice ('Max admits ... left the Devourer alive and only sealed it back in'), no held/conflict row, and Natalia answers 'Finally, the truth comes out' (msg 156).
- evidence: `journal.jsonl:1244`
- context (event-time):
  - #153 Adolion Narrator: *The admission hangs in the air, cold and clear. Belle's grip on Cleaver's haft tightens until her knuckles go white, her jaw locking shut.*
  - #154 Max Nightriver: Belle? Say something. Is the Devourer still alive down there or not?
  - #155 Adolion Narrator: *Belle's eyes flash with a mixture of relief and irritation, her shoulders dropping from their tense hunch. She lets out a huff that's half-laugh, half-snarl.*
  - **#156 Natalia: *Natalia's frost-dusted hand stills on the railing as she watches the exchange, her head tilting slightly.* "Finally, the truth comes out." *Her voice is dry, almost approving.* "A much better foundation for a story than the one you were trying to build." *She straightens, her gaze flicking between **

## Anomalies

### extraction-rejected (1)

- 2026-10-02T00:04:20.706Z 1 extraction line(s) rejected: DELTA q=location value="nightriver_estate" evidence="*I turn to Belle and Dalan by the door.*" (evidence only in the player's line) (`journal.jsonl:1243`)

### judge-fallback (1)

- 2026-10-02T00:04:15.802Z judge director fell back (timeout) (`journal.jsonl:1227`)

### harness-error (1)

- - WARNING: the page restarted 2 time(s); captures between the last drain and each restart are UNKNOWN, not zero. (`payloads.log:31`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T2-?1 | T2 |  |  | `test/sessions/T2/T2-5-1/journal.jsonl:1156` | draft |  |  | Excluded both 'Javon's conditions' facts (gone from the memory block of the next prompt, payloads index 3), but the same content still rides in [Open threads] ('Javon demands Max explain his conduct at the mines...') and Natalia's reply (msg 151) uses it. |
| T2-?2 | T2 |  |  | `test/sessions/T2/T2-5-1/journal.jsonl:1244` | draft |  |  | Locked fact did not win: after Lock as canon on 'killing the Devourer released them into dust' (row still 'held out: folded', not in any later prompt), 'We left the Devourer alive' was stored LIVE twice ('Max admits ... left the Devourer alive and only sealed it back in'), no held/conflict row, and Natalia answers 'Finally, the truth comes out' (msg 156). |
| T2-?3 | T2 |  | harness | `test/sessions/T2/T2-5-1/payloads.log:31` | draft |  |  | WARNING: the page restarted 2 time(s); captures between the last drain and each restart are UNKNOWN, not zero. |
| T2-?4 | T2 |  |  | `test/sessions/T2/T2-5-1/journal.jsonl:1227` | draft |  |  | judge director fell back (timeout) |
| T2-?5 | T2 |  |  | `test/sessions/T2/T2-5-1/journal.jsonl:1243` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="nightriver_estate" evidence="*I turn to Belle and Dalan by the door.*" (evidence only in the player's line) |
