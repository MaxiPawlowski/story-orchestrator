---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1269752398310670471
thread_id: "1269752398310670471"
forum_tags: ["Other", "WorldInfo/Lorebooks", "Character Management"]
author: "Idiot"
created: 2024-08-04
last_activity: 2024-12-29
active_span_days: 146
upvotes: 5
reactions_total: 5
reactions: ["upvote 5"]
comments: 6
participants: 3
author_replies: 4
scraped: 2026-09-18
---
# SillyTavern — "Automated Stable Diffusion Quick Reply System" Guide

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "Automated Stable Diffusion Quick Reply System"
<https://discord.com/channels/1100685673633153084/1269752398310670471>
**Author:** `Idiot`
**Thread spans:** 04 Aug 2024 → 29 Dec 2024. Scraped 18 Sep 2026.

---

## TL;DR — what this achieves

A way to make Quick Replies fire specific Stable Diffusion prompts (including LoRAs) automatically, keyed off what's happening in the scene — e.g. one preset prompt+LoRA combo for "embarrassed" moments, another for a different emotion/situation — with **no manual button press** and **no risk of interrupting the Continue button**. Built entirely from Quick Reply's `automationId` field plus a dedicated World Info/lorebook whose entries share that same automation ID and fire on emotion/situation keywords. For anyone who wants preset SD images to pop in automatically as a scene calls for them, without hand-triggering `/sd` every time.

This is a lighter, older (Aug 2024) technique than the newer "Seamless Image Generation" prose-to-prompt pipeline documented separately in `sillytavern-seamless-image-generation-v2.md` — this guide uses fixed, hand-written prompts per situation rather than an LLM converting scene prose into tags on the fly.

---

## 1. Setup — step by step

### 1.1 Create one Quick Reply entry per situation/emotion

In a Quick Reply group, make one QR entry per prompt/LoRA you want available. Each entry's message must start with this guard, then the `/sd` call:

```
/if left={{lastmessageid}} right={{getvar::lastmessageid}} rule=eq /abort | /sd prompt and/or Lora goes here
```

Replace `prompt and/or Lora goes here` with whatever you want generated for that situation — everything after `/sd` is the Stable Diffusion prompt. Author's own example, a LoRA plus contextual tags for an embarrassed scene:

```
/if left={{lastmessageid}} right={{getvar::lastmessageid}} rule=eq /abort | /sd <lora:Hinata[Shippuden][V1]:0.7>  hinata(shippuden), headband around neck,konohagakure symbol,fishnets,embarrassed,blushing,shy,nervous
```

(What the guard does is explained in §1.3 below — it's what lets Continue work without also firing the SD prompt.)

### 1.2 Set the QR's automation ID (not auto-execute)

Open the QR entry's three-dot menu. Leave the auto-execute checkboxes **unchecked**. Instead, put a word into the **automation ID** field — this is what ties the QR to a lorebook trigger later. One QR per emotion/situation, each with its own automation ID (e.g. `embarrassed` for the example above). Make as many as you want, one per emotion or situation.

### 1.3 Create a dedicated lorebook to drive the automations

Make a new lorebook (World Info) used only to trigger these automations. For each QR entry:

- New lorebook entry, titled to match what it's linked to (e.g. `embarrassed`).
- Status: green dot (enabled).
- **Trigger/key words**: terms related to the target emotion, e.g. for "embarrassed" — `Shy, timid, flustered, blush, blushing, embarrassed, embarrassing`.
- **Automation ID**: the exact same string used on the QR entry in §1.2 (e.g. `embarrassed`).
- Optional: use the **inclusion group** to restrict the entry to firing only on a specific character's messages.
- Turn **off Recursive** so this entry doesn't trigger other automation entries by accident, and isn't triggered by them.
- **Content field**: the author leaves it blank on purpose — you *can* put context text in there like any normal lorebook entry, but for pure SD-triggering you don't want to spend tokens on content that does nothing for the automation.

### 1.4 Add the Continue-button guard QR

Add one more Quick Reply entry, message body just:

```
/setvar key=lastmessageid {{lastmessageid}} |
```

Configure it to **execute on AI message** (check that box) and leave its automation ID blank.

**Why this exists:** the `/if left={{lastmessageid}} right={{getvar::lastmessageid}} rule=eq /abort` guard at the top of every prompt QR (§1.1) is what detects whether you're sending a new message or hitting **Continue**. Without it, hitting Continue would still fire the SD-triggering QRs — you'd get an image, but the Continue generation itself would get cut short/skipped. This extra "execute on AI message" QR stores the last message ID into a variable each time the AI replies; the guard then compares the live `{{lastmessageid}}` against that stored value and aborts the SD call when they match (i.e., when you're continuing rather than sending fresh), letting Continue proceed normally without triggering an image.

### 1.5 Result

With this system, you get a library of preset SD prompts/LoRAs, each auto-triggered whenever its linked lorebook entry's keywords appear in the scene — so most situations in a roleplay can have a matching image generated automatically. Author's closing invite: if you find other creative uses for this pattern, share them.

---

## From the comments

- **`Gr3y`** asked for screenshots to follow along; **`Idiot`** (author) agreed to add them and posted four image attachments the next day (§Links & resources below) — inferred from context to be screenshots of: the scenario/QR setup, the lorebook automation entries, the `/setvar` Continue-guard QR, and the Hinata example in action. The images themselves were not retrievable as text/markup (they're PNGs), so only the links are kept here.
- **`Nadzro`** (29 Dec 2024, several months later) asked: *"is the img sent before/after character replies? in my case, it was before"* — this question is **unanswered in the captured thread**. No later message in this export addresses it, so timing behavior (image posted before vs. after the character's text reply) is unconfirmed/unclear from the source and may depend on setup or have changed with later ST versions.

---

## Links & resources

- Screenshot/example images (Discord CDN attachments posted by `Idiot`, 05 Aug 2024) — signed URLs, likely expired:
  - `2024-08-05_16_01_35-Window.png` — general scenario/setup screenshot.
  - `automations.png` — the lorebook automation entries.
  - `setvar.png` — the `/setvar key=lastmessageid` Continue-guard QR.
  - `hinata1.png` — example output for the Hinata LoRA/embarrassed-prompt QR.
- No external non-Discord links or text-file attachments were present in this thread.
