# SillyTavern — Tracker Extension Guide (thread knowledge dump)

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "Tracker Extension Guide"
<https://discord.com/channels/1100685673633153084/1348830796303044669>
**Author:** `Giglio` (Kaldigo's Tracker extension guide author)
**Thread spans:** 11 Mar 2025 → 30 Oct 2025 · Scraped 18 Sep 2026.

---

## 0. TL;DR

This forum thread is a **pointer post + community Q&A**, not a self-contained guide. The actual
guide content is an external PDF written by `Giglio` for Kaldigo's **Tracker** extension
(a SillyTavern extension, linked from the extension's own Discord channel). This scraped thread
contains only the forum post that links the PDF plus 30 replies of feedback, bug reports and
questions. The PDF itself was **not fetched** — it isn't a text-ish attachment type this scrape
inlines (`.pdf` is out of scope; see brief), and it isn't hosted on `cdn.discordapp.com` anyway
(it's a GitHub-hosted doc). Treat this file as "what the comments say," not as the extension
manual itself.

**For the actual documentation, go to:**
`https://github.com/kaldigo/SillyTavern-Tracker/blob/main/docs/Tracker%20Documentation.pdf`

---

## 1. The original post

> Guide for Kaldigo's [tracker extension](https://discord.com/channels/1100685673633153084/1303574621618180186/1303574621618180186).
>
> Link to the guide:
> https://github.com/kaldigo/SillyTavern-Tracker/blob/main/docs/Tracker%20Documentation.pdf

Posted with one image attachment (`11.png`, a screenshot — likely of the extension UI or a
tracker output; not described further in the surrounding text). Link:
`https://cdn.discordapp.com/attachments/1348830796303044669/1348830796735320114/11.png` (may be
expired — Discord CDN links carry a signed expiry).

`Giglio` later noted this was his first time writing a user guide of this kind, and asked for
feedback.

---

## 2. From the comments

### 2.1 DRY repetition penalty corrupts tracker output (`Uncle Burrito`) ⭐ — the thread's main bug report

**Symptom:** with DRY (Don't Repeat Yourself) repetition penalty enabled, the tracker's generated
fields get garbled where they should repeat a token pattern. Concrete example given: a date field
that should read `5/15/2023` instead comes out as `5/15/3033` or `5/152023`. Not model-dependent —
reporter tried multiple models and saw it every time, on **local** inference.

**Workaround the reporter uses (acknowledged as not a real fix):**
1. Write your reply with DRY off.
2. The moment tracker generation starts, turn DRY back on.
3. This keeps tracker output solid while still avoiding repeated/identical chat outputs from DRY
   being off during normal generation.
4. Downside, in their own words: manually toggling DRY in settings before/after every message
   "becomes tedious very quickly."

Two screenshots were posted showing a tracker entry with DRY on vs off, plus a screenshot of the
**previous** tracker entry for comparison (to show the field getting garbled relative to the last
good state):
- DRY on/off comparison: `https://cdn.discordapp.com/attachments/1348830796303044669/1349025047083221012/SmartSelect_20250311_192256_Chrome.jpg` and `https://cdn.discordapp.com/attachments/1348830796303044669/1349025047351922740/SmartSelect_20250311_192334_Chrome.jpg`
- Previous tracker entry (baseline, DRY enabled — shows the garbling): `https://cdn.discordapp.com/attachments/1348830796303044669/1349025375996481578/SmartSelect_20250311_192424_Chrome.jpg`

(All three are Discord CDN screenshots — image content not independently verifiable from this
scrape beyond the description given in the surrounding messages; links may expire.)

**Author's (`Giglio`) response:** he doesn't see this on Sonnet 3.5 (his own model), which has no
DRY repetition-penalty knob exposed via Chat Completion, so he can't reproduce it. He pointed to a
**planned feature — connection-profile switching** — as something that would likely resolve it for
local/text-completion users (presumably by letting the tracker's generation pass use a different
connection profile / sampler settings than the main roleplay generation, sidestepping DRY
entirely). Not confirmed shipped as of this thread; treat as roadmap, not a current fix.

**Follow-up detail from `Uncle Burrito`:** DRY's availability/control differs by backend — on Chat
Completion APIs it's mostly server-side with little user control; the corruption is specifically
a **local/text-completion** problem, where DRY is fully user-configurable and "completely ruins
the tracker results." His conclusion: this defeats the point of an extension meant to keep facts
consistent.

### 2.2 Typo on page 44 (`Uncle Burrito`)

Reported a typo on page 44 of the PDF guide, with a screenshot:
`https://cdn.discordapp.com/attachments/1348830796303044669/1349353338046644276/image.png`
(image not independently re-verified here — PDF page numbering may have shifted since if the doc
was revised).

### 2.3 Format gripe — PDF vs Markdown (`Jeff`)

- "I do wish it was in md instead of pdf." / "pdf is evil."
- Reasoning given when `Giglio` asked him to elaborate: PDFs require rendering/loading time vs.
  plaintext being "basically instant" — described as a personal preference, not a hard complaint.
  Also mentioned PDF searchability as a secondary point, but noted modern browsers handle PDF
  search reasonably well anyway.
- He was still clear the guide content itself is good: "The guide is very good though."

### 2.4 Token efficiency (`Der Große Kleine` asks, `Jeff` answers)

**Question:** how many tokens does the tracker use — is it more efficient than a per-message
~500-token repeated block doing the same job? Does the AI have to read through the full history
of stored tracker entries, or only the latest one (globally, or per character)?

**Answer (`Jeff`, marked IIRC — not from the author, take as secondhand):** the extension
**stores all** tracker entries over time, but the AI **only sees the most recent one** in context.
`Der Große Kleine` confirmed this reading back and concluded it's "really token efficient."

No response from `Giglio` in-thread confirming this mechanism — it is community-sourced, not
author-verified in this scrape.

### 2.5 Unanswered questions (left open in the thread — no reply visible in this scrape)

- `GodHandGriffith` (2025-08-05): "Can this roll dice if needed?" — no answer recorded.
- `skeolan` (2025-10-30, last message in the scrape): "Can it carry different tracker formats for
  different chats?" — no answer recorded (thread may have continued after the scrape cutoff).

### 2.6 General reception (chit-chat, for context only)

Multiple short positive reactions across the thread's lifespan (11 Mar 2025 through 16 Sep 2025):
"very good," a star-rating reaction, a bookmark-to-read-later, and (`Magi`, 16 Sep 2025) — "pretty
good guide thank you for it, make me less lazy to actually make use of this extension... it's very
concise." No corrections or technical content in these; included only to show the guide was still
being found and used well after posting.

---

## 3. Links & resources

| Link | What |
|---|---|
| `https://github.com/kaldigo/SillyTavern-Tracker/blob/main/docs/Tracker%20Documentation.pdf` | **The actual guide** — full Tracker extension documentation PDF by `Giglio`, hosted on Kaldigo's extension repo. Not fetched by this scrape (PDF, not a text-ish attachment; not on `cdn.discordapp.com`). |
| `https://discord.com/channels/1100685673633153084/1303574621618180186/1303574621618180186` | Link (from the OP) to the Tracker extension's own Discord channel. |
| `https://cdn.discordapp.com/.../11.png` | Screenshot attached to the OP — unlabeled, likely a UI/output example. Link may be expired (signed Discord CDN URL). |
| `https://cdn.discordapp.com/.../SmartSelect_20250311_192256_Chrome.jpg`, `..._192334_Chrome.jpg` | `Uncle Burrito`'s DRY-on vs DRY-off tracker output comparison screenshots (§2.1). |
| `https://cdn.discordapp.com/.../SmartSelect_20250311_192424_Chrome.jpg` | `Uncle Burrito`'s "previous tracker entry" baseline screenshot, for comparison against the DRY-corrupted one (§2.1). |
| `https://cdn.discordapp.com/.../image.png` (1349353338046644276) | Screenshot of the page-44 typo (§2.2). |

---

## 4. Notes on this scrape

- Only 31 messages total; the thread is short and low-detail relative to other guides in this
  folder. Most of its value is the DRY repetition-penalty bug report (§2.1) and the "AI sees only
  the latest tracker entry, all entries are stored" mechanism note (§2.4) — the latter is
  secondhand/unverified by the author in-thread.
  - No presets, code, regex, CSS, lorebooks or JSON configs were posted anywhere in this thread —
    there is nothing of that kind to inline.
- All four image attachments are Discord CDN screenshots; none were fetched as text (out of scope
  — they're images, not text-ish files), and their signed URLs may already be expired.
- Two questions (dice rolling support, per-chat tracker format switching) are open/unanswered as
  of the scrape's last captured message (30 Oct 2025).
