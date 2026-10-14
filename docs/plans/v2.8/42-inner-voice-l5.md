# Plan 42 — Inner voice L5 spike: the carried thought

**Status (2026-10-14): built on `v2.8-a13-l5` (queue A13, backlog D3). Deterministic gates in the Gate record; CL leg
run below; RP legs owed.** Source: `v2.7/37-character-life.md` §L5 ("inner voice, promoted"), `v2.6/06-inner-voice.md`
B2 and C, `v2.8/01-v27-carry-over.md` §F M2/M3.

## Why a spike, and why this one

L5's own text has no design: it promotes the reasoning harvest (B2) and the inner beat (C) once their measurements pass.
Since 2026-10-09 both are on by default (owner: every built feature on), so promotion of the switches is moot; what L5
can still add is the piece the two leave open. The beat is the only thing that writes "Your intent this turn", and it is
missing whenever the prediction missed and the draft-time beat did not land within `INNER_DRAFT_WAIT_MS` (3 s), the call
was unusable, or the beat went stale. Meanwhile the drafted member's own previous reply usually carries native
reasoning (thinking is on), which already states what that character is after, and B2 only uses it as extraction
evidence. Stepped Thinking's second value, "that want persists across turns", is the gap.

## L5 as built (decided before the first run)

- **Spike** `spikes.thoughtCarry`, install-wide, on unless literally `false` (owner rule). Lazy: the picker lives in
  `runtime/spikes/thoughtCarry.ts` (spike chunk), installed as the `carry` seam by `runtime/spikes/index.ts`.
- **When:** at draft time, inside the beat host (`runtime/innerBeatHost.ts` `beatFor`), only when `takeBeat` found no fresh
  beat, the inner beat is on, the reasoning harvest is on (it reads `message.extra.reasoning`, which B2's switch guards),
  and the seam is installed. A fresh beat always wins; when the draft-time beat lands, the re-apply replaces the carry.
- **What:** the drafted member's own newest reply in the last 8 rows and after the active checkpoint's start message,
  never the member's in-progress draft row. From its reasoning: the first labelled aim (`goals:`, `aim:`, `wants:`,
  `motivation:`, … with an own possessive or none), else the latest sentence whose subject is the member (name, first
  name, he/she/they/I) followed by an aim verb (`wants`, `needs to`, `intends`, `plans to`, `hopes to`, `is determined
  to`, …). Refused: meta-commentary (`isMetaCommentary`) and writing instructions (write, narrate, describe, tone, reply,
  scene, prose, persona, the user, the story, …), lines whose subject is the player (story personas plus the chat's user
  names) or another character, under 12 characters; clipped at 200.
- **Line:** `(carried from your last thought) <aim>`, rendered by the existing path as `- Your intent this turn: …` in that
  member's private block only. It rides the beat channel, so the held-secret drop (`keptFrom`) applies unchanged, the
  narrator view never sees another member's carry, and the resting block stays empty.
- **No model call, nothing stored.** The line is a pure function of the chat rows at draft time: rollback ≡ replay holds
  by construction (a swipe, edit or delete changes the rows and so the line). No census row (no async write).
- **Journal** (status): `Inner thought carried for <name>` (`from message N`) or `No thought to carry for <name>` with
  `no-reply`, `no-reasoning`, `no-aim`. Counters on `storyOrchestratorSpikes.thoughtCarry.stats()`.

## Floors (predeclared, never retuned)

- **D (deterministic, jest):** 0 model calls on the carry path; 0 carried text from another member's reasoning; the line
  only in the drafted member's block (resting block and other members' blocks clean); a line restating a kept-from
  secret dropped; every meta/writing negative control refused (22 lines); player-subject and other-character-subject
  lines refused; rollback ≡ replay over every cut of a grown chat, and a swipe changes the line.
- **CL (offline, real Artemis v1.1 reasoning from a recorded private session, rater Sol `openai/gpt-6.1-sol`, ≤ 100
  calls):** each reply with reasoning is replayed as a draft of that member right after the player's next line.
  - L5-CL1 precision: ≥ 0.80 of carried lines rated "a standing aim of that character, in character" (not a writing
    instruction, not the player's action, not a step already performed in that reply);
  - L5-CL2 meta leak: ≤ 0.05 of carried lines rated a writing/narration instruction;
  - L5-CL3 player: 0 carried lines rated as stating what the player character does or decides;
  - L5-CL4 yield: ≥ 0.25 of replies with reasoning produce a carried line;
  - at least 20 carried lines rated, else INCOMPLETE; the rater runs twice over the same picks and both runs must pass.
- **RP (owed, Artemis on the 3090 or a pod):**
  - L5-RP1 coverage: on drafted group turns, the private block holds an intent line (beat or carry) on ≥ 90 %;
  - L5-RP2 quality: 20 paired replies on beat-miss turns (carry on vs `spikes.thoughtCarry: false`, same seed), blind
    second-model rater: carry arm preferred or tied on ≥ 12 of 20, and repeating the member's previous action rated no
    more often than control;
  - L5-RP3 privacy: `so-ui assert-player-clean` and the J5 block-scoped privacy check green with the spike on.
- Below a floor: the miss is recorded; the spike stays on (owner rule) unless the owner switches it off.

## Runner

`node scripts/debug/so-l5-carry.mts pick --chat <chat.jsonl> --out <items.json>` (deterministic picks, the shipped picker
bundled with esbuild), `rate --items <items.json> --out <ratings.jsonl> [--batch 10] [--max-calls 50]` (Sol through
`opencode run`, calls counted), `score --items <items.json> --ratings <ratings.jsonl>` (floors, exit 1 on a miss). The
corpus and ratings hold campaign text: they stay in the debug dir or the private so-sessions repo, never here.

## Gate record

(appended at handover)
