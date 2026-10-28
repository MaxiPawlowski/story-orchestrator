# v3.0 21: image fixes from playtest 1 (2026-10-26)

Owner's first playtest chat drew two pictures at chat start that matched neither the on-screen cast nor the background.
Diagnosis (read-only, no campaign content): both came from our illustration module; the image-prompt profile id pointed to a
deleted profile, so every picture used the template fallback (style + every enabled member's look + lore + label); the narrator's
"never drawn" note was pasted as a subject; no location; the greeting got a picture as well as the opening establishing shot.

Reviews that followed: `research/image-audit-2026-10-26.md` (code audit), `research/image-astra-2026-10-26.md` (Astra round 1),
`research/image-astra-prep-bridge-2026-10-26.md` (Astra round 2: prep, gameplay, bridge). Live review: `18-image-e2e-review.md`.
Next stages: `20-visual-bridge.md`.

## Built

- `2403c70f`: subjects = speakers + named in the recent window (not every enabled member); a narrator's authored look is never
  drawn; the greeting is never drawn by the cadence; the opening shot is skipped when the start beat sets `effects.background`
  or `effects.stage`; place from the latest authored background when no location fact exists; Repair row
  `image-prompt-profile-missing`. Guide updated.
- `5d65515d` + `f96dabda`: real framing tags (`cowboy shot`, `upper body`, `full body`, `wide shot`, ...; the bare `cowboy`
  booru tag was appended to every scene prompt) and the director's `shot` wins over the route default; scene-break cues name the
  place only for a location break, never the reason code; an unusable director reply (error or invalid JSON twice) falls back
  to the template instead of no picture; the opening cue waits for `requirements.ready` (it was marked done before readiness
  and lost until reload); every picture records `prompt_source` (`directed` | `template` | `degraded`); the every-N cadence
  counts player turns and considers only the first reply of a turn (it counted every member reply and swipe, and saved chat
  metadata each time); thought blocks stripped with `stripReasoningBlocks`. Settings copy "Every N turns".
- `d12deead`: harness images over ~1 MB are re-encoded as same-size JPEG before sending (opencode `WebSocket inbound queue
  overflow` refused live-head rigs; same miss as v2.8 74 and 80 a7/e2e26).

## Owner settings changed (backups in `C:\dev\backups\story-orchestrator\`)

- `image.directorProfileId` set to the existing "Image Director" profile (was a deleted profile id).
- Stray `admin` removed from the scene purpose's extra negative.

## Owner decisions (as recommended)

1. Empty `sprites.builders`: fixed in 20 (install-wide default Qwen recipe, consumption independent of builders), not patched here.
2. One model family for all character pictures: decided by blind rating in 20's pilot, not switched now.
3. Every-N counts player turns: done (`5d65515d`).
4. Remove `admin`: done (settings).

## Gate record

- 2026-10-26 `2403c70f`: `npm run gates:quick` green (typecheck, typecheck:test, lint, jest related, defect replay 32/32);
  `npm run gates` all green in 395.7 s (1002 Storybook tests). Merged, staged, installed. Live gate: none (owner reload only).
- 2026-10-26 `5d65515d`: `npm run gates` RED at test: `errorCopy.guard` and `codeHealth.guard` (S4 branches) on
  `StoryImageDirector.plan`; fixed in `f96dabda` (director call split out, error-copy ledger row moved).
- 2026-10-26 `f96dabda`: `npm run gates` all green in 483.8 s. Merged, staged, installed (owner + lanes).
- 2026-10-26 `d12deead`: first `npm run gates` RED at test (flake; passed on rerun), `--resume` green; second full run green on
  every step except `test-storybook:ci` (load: three agents running gates at once); `npm run test-storybook:ci` alone 1002/1002
  green on the same tree. Merged on the owner's OK with that record; staged after the image probe.
- Live gates owed: the image consistency probe on `f96dabda` (18), a live-head rig build on `d12deead` (next p41 run).
