# Automating images, and tag lorebooks

Open this when images should fire without a button press, or when you want the LLM to use exact
booru tags. Lorebook field semantics (keys, positions, timed effects) belong to
`../../st-lorebook-authoring/SKILL.md`. QR JSON and STscript syntax belong to `../../st-scripting/SKILL.md`.
Citation key as in `../SKILL.md`.

## Trigger mechanisms compared

| Mechanism | Fires | Relative to the reply | Source status |
|---|---|---|---|
| QR button | on click | — | core |
| QR *Execute on AI message* (`executeOnAi`) | every `CHARACTER_MESSAGE_RENDERED` | **after** | verified: qr/index.js:284-292, qr/src/AutoExecuteHandler.js:56-59 |
| QR ↔ WI `automationId` | when a WI entry with the same automation ID activates | **before**. Prompt assembly waits for the QR | verified: world-info.js:900-903, qr/index.js:302, AutoExecuteHandler.js:85-100 |
| `sd` interactive mode | user message like "send me a picture of …" | instead of a normal reply | verified: sd/index.js:162-172, 375-440 |
| `GenerateImage` function tool | the model calls the tool | during the reply | verified: sd/index.js:5452-5484 |
| Marker in reply (`%[1]`) + Sorcery | streaming output contains the marker | after | third-party, not installed here (community, 2025-08) |

Facts that decide the design:

- **Auto-execute recursion guard.** `/sd` posts its image by emitting `CHARACTER_MESSAGE_RENDERED`
  (sd/index.js:4997-4999), which is exactly the event an `executeOnAi` QR listens to. A QR with
  *Don't trigger auto-execute* (`preventAutoExecute`, default **true** on new QRs) pushes a flag that
  blocks nested auto-execution while it runs (verified: qr/src/QuickReply.js:39,
  AutoExecuteHandler.js:16-31). Turn that off on an auto-image QR and every image re-triggers it.
- **Swipes.** The `executeOnAi` hook skips a message whose text is the `...` swipe placeholder (verified:
  qr/index.js:285-288). A swipe still re-scans World Info, so WI-automation QRs fire again on it.
- **WI automations also run on quiet generations.** The `/sd` LLM call is `Generate('quiet')`, and its WI
  scan emits `WORLD_INFO_ACTIVATED` like any other, unless the scan is a dry run (verified: world-info.js:900-903).
  An automation entry that can match text in the tag prompt can therefore re-enter itself. Scope it with
  **Filter to Generation Triggers** = Normal (verified: world-info.js:4806-4812).
- The "image appears *before* the reply" behaviour people report with WI automations
  (community, 2024-12, left unanswered in-thread) is by design. The QR runs inside prompt assembly,
  before the model is called.

## Per-situation images with fixed prompts (Idiot, Aug 2024)

A library of hand-written `/sd` prompts, often one LoRA and one expression each, fired by scene keywords.
It needs no second LLM.

1. One QR per situation. Its body is `/sd <lora + tags for that situation>`, which is free mode, so no LLM.
   Leave every auto-execute box off and set **Automation ID** = the situation, e.g. `embarrassed`.
2. A dedicated lorebook with one entry per situation. Keys = words that signal it (`blush, flustered,
   embarrassed, shy …`). **Automation ID** = the same string. **Content empty**, so no tokens are spent.
   Recursion off, so entries don't chain. An inclusion group or character filter can limit it to one character.
   The mechanism is also documented in `../../../sillytavern-docs/worldinfo.md` §Automation ID.
3. **The Continue problem.** Continue re-runs the WI scan, so the image QR fires again. The guide's fix
   is a helper QR on *Execute on AI message* that stores `{{lastMessageId}}` in a variable. Each image QR
   first compares the live `{{lastMessageId}}` with that stored value and `/abort`s when they are equal,
   i.e. when no new AI message has arrived since the last image. A cleaner current-ST option is setting the
   lorebook entries' **Generation Triggers** to Normal (+ Swipe), which leaves Continue out entirely
   (verified: public/scripts/constants.js:36-43 lists `continue` as its own trigger type).

Limits: a keyword fires on the *previous* text, not the reply being written. The prompts are static,
so outfits and settings don't follow the scene. Several situations that match in the same scan *all*
fire, one image each (each automation ID runs once per scan, worldinfo.md §Automation ID), so keep the
key lists disjoint.

## Frequency control with marker lorebooks

If the reply itself should request an image (the marker approach), the knobs are WI timed effects on a
constant entry that tells the model to end with the marker. Cooldown N means at most one image per N
messages, delay N means none before message N, and probability X% means randomly. Timed effects and
probability apply to constant entries. Secondary keys **don't** (verified: world-info.js:4846-4856, 4892-4896,
5030-5053). The instruction should sit at depth 1 as a system or user message (`role` 0 or 1; 2 = assistant,
verified: public/script.js:494-498). With a QR-driven pipeline you don't need markers at all. The guide's
author dropped them because they depend on the model following instructions.

## Danbooru-tag lorebook (Cap, Jan 2026)

**Idea**: the tag-writing LLM paraphrases ("standing in a t pose") when the image model only knows the
indexed tag (`t-pose`). The fix is a lorebook whose **keys** are natural-language phrasings and whose
**content** is the exact tag, visible to the LLM when it writes the image prompt. The gain is largest on
obscure poses, clothing and hairstyles.

Entry shape (example written for this skill):

```
Keys:    kneel, kneeling, on one knee, knelt, genuflect
Content: danbooru tags: kneeling, on one knee
```

1. Add one line to the tag instructions: *condense descriptions into comma-separated Danbooru tags, using
   the Danbooru lorebook for exact tags.* The author reported that line alone helps on DeepSeek R1/V3.x,
   Gemini and GPT-4+ (community, 2026-01).
2. For tags that rarely trigger, add more keys and related tags to the same entry. `{}` / `[]` emphasis
   inside the content is fine.
3. **Placement.** Lorebook text lands *before* the image-prompt instruction. The stock templates open with
   "Ignore previous instructions" (verified: sd/index.js:186, 213), which tells the model to discard the tags.
   The author's fix was position **@D, depth 0** on every entry, plus rewording the template opener to *ignore
   previous instructions that do not concern image generation* (community, 2026-01).
4. **Bleed into roleplay.** An always-on tag book also fires on normal turns and costs tokens (it was seen in
   DeepSeek's reasoning). The author had no fix. Current ST has one: set every entry's **Generation Triggers** to
   **Quiet**, and the book only activates for quiet generations such as the `/sd` prompt call, summaries and other
   background prompts (verified: world-info.js:4806-4812; `quiet` option index.html:7080; `generateQuietPrompt`
   → `Generate('quiet')`, public/script.js:3108). This inference hasn't been live-tested.

Finding tags: Danbooru's wiki and tag search, where `*word` finds tags ending in *word*, `word*` tags that start
with it, and `*word*` tags that contain it. For artist-style previews, nax.moe shows SFW samples per artist tag.
Blend artists with de-emphasis `[artist]` rather than emphasis (NAI bracket syntax) (community, 2026-01).

## Tag prompt hygiene (applies to every technique)

- The character prefix should hold **permanent** visible traits only (hair, eyes, species, marks). Clothing
  and accessories in the prefix get drawn in every scene (community, 2025-08).
- Popular, well-indexed characters (game characters, VTubers) render from their name tag alone. OCs need a
  LoRA or a very specific tag list.
- Prefer the booru tag over a description: `t-pose`, not "standing with arms out". Weight the few elements
  that must appear.
