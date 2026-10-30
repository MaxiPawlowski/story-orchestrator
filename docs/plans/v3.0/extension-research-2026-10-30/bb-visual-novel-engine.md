# BB Visual Novel Engine — 2026-10-30 harvest

meta: https://github.com/maxkara14/BB-Visual-Novel-Engine `326f4ad..193a991` (2 commits, no version change, 8 files +99/−10) · **no
licence: ideas only** · read: full diff (`CHANGELOG.md` EN, `modules/portrait-image-options.js`, `modules/social.js`, `docs/portraits.md`,
test titles in `tests/performance.test.mjs`, `tests/portrait.test.mjs`) · prior: `docs/plans/v2.8/extension-research-2026-10-21/bb-visual-novel-engine.md`,
`-2026-10-14/bb-visual-novel-engine.md` (triage H11a/H11b/R31–R33/R69, v2.9 G11–G14). Nothing here reopens a row.

## What it is / what changed
Same relationship tracker + portraits. Two fixes:
- `edecee7`: the automatic GPT Image 2/2.5 size now respects the provider's maximum pixel area (8,294,400). Square 4K and 3:4 portraits
  failed local size validation before.
- `193a991`: after a hidden tracker block was stripped from a visible message, it called `getContext().markdownToHtml`, which does not exist. The
  throw aborted the recalculation before the cards refreshed and before the first-relationship prompt for a new character, so the panel kept a stale
  roster. Now it calls ST's `updateMessageBlock(messageId, msg)`.

## How it works
- Size (`modules/portrait-image-options.js:52-68`): the scale is the larger of `edge / max(ratio)` and the minimum-area scale, then **capped** at
  `sqrt(8294400 / (w*h))`. Both sides are rounded to 16. If rounding pushes the area back over the cap, both sides are recomputed with `floor`.
  Explicit custom sizes are untouched and validated separately.
- Re-render (`modules/social.js:2797`): the native `updateMessageBlock` re-runs ST's message formatting (regex, markdown, reasoning block)
  instead of a hand-rolled `innerHTML`.

## Patterns for SO

### P1. Clamp after rounding, not only before — test-idea · image sizes (v3.0 20 / track B) · partial · value 2 · effort S
What: rounding to a grid after an area-based scale can overshoot the area the scale was chosen for. VNE floors when it does.
Our state: `qwenOutputSize` scales to `resolution²` at the aspect ratio, then rounds each side to 32 (`src/image/autoScene.ts:109-115`).
`imageSize` rounds hires-scaled sizes to 8 (`src/image/catalog.ts:110-114`). Neither has a post-rounding area check. The overshoot is small
(a few %), but the GPU reserve and the refit admission count pixels on a shared 3090.
Sketch: a jest property over aspect × resolution that pins `width*height <= resolution²·(1+ε)`, or floor like VNE when the area exceeds it.
Fold into the plan 20 resolver tests. Not worth its own row.

### P2. One failing cosmetic step must not abort the state update after it — pattern · runtime · present · value — · effort —
What: their DOM re-render threw and skipped the roster refresh and the first-relationship prompt that followed in the same pass.
Our state: message re-renders go through `updateMessageBlock?.` in two host files (`src/services/stHost/chatMessages.ts:29`,
`src/services/stHost/polishWrite.ts:12`). Writers answer `WriteResult` (`stHost/typedResults.test.ts`), and boundary work is a registry of
independent entries (`src/runtime/boundaryWork.ts`). Nothing to add. Recorded only because it confirms the shape.

## Host facts
- `SillyTavern.getContext()` has no `markdownToHtml`. To re-render a stored message use `updateMessageBlock(messageId, message)`
  (`ST public/scripts/st-context.js:47,238`). SO already does (above).
- Provider pixel caps (GPT Image) do not apply to our routes. We render on local ComfyUI only.

## Not worth taking
- GPT Image size modes / OpenAI Images protocol: no cloud image route in SO, and none is wanted (local ComfyUI, track B).

## Security notes
- SECURITY.md: CLEAR. The diff adds no network or secrets access; the `updateMessageBlock` swap removes an `innerHTML` write.
- Pre-existing: portraits can call a user-configured OpenAI-compatible image endpoint (cloud). Not needed by anything here.
- No text addressed to an AI agent found.
