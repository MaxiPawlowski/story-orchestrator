---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1284322277483085844
thread_id: "1284322277483085844"
forum_tags: ["WorldInfo/Lorebooks"]
author: "underscore_x #banana"
created: 2024-09-14
last_activity: 2025-12-27
active_span_days: 469
upvotes: 62
reactions_total: 71
reactions: ["upvote 62", "💗 8", "❌ 1"]
comments: 49
participants: 8
author_replies: 31
scraped: 2026-09-18
---
# SillyTavern — Getting Started with World Info (Lorebooks)

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "Getting started with World Info (Lorebooks)"
<https://discord.com/channels/1100685673633153084/1284322277483085844>
**Author:** `underscore_x #banana`
**Thread spans:** 14 Sep 2024 → 27 Dec 2025 (guide body posted 14 Sep 2024; rest of the thread is Q&A in the following year). Scraped 18 Sep 2026.

> The author explicitly left this **unfinished**: "far from done with this guide" (14 Sep 2024), and it never resumed — Recursion and Group Scoring are named as "we'll cover later" but never covered in this thread. Companion post referenced but not included here: "Getting the most out of WorldInfo…" (title truncated in the export, no direct link captured). Official docs, recommended as required first reading by the author: <https://docs.sillytavern.app/usage/core-concepts/worldinfo/>.

---

## 0. TL;DR

A from-scratch, screenshot-driven walkthrough of World Info (aka Lorebooks) for someone who just installed SillyTavern: what WI actually is (extra text injected into the prompt, triggered by keywords or always-on), how to create a world and an entry, what "Strategy" (Normal/Constant/Vectorized) means, how **Position** (relative, e.g. Before Character Definition) differs from **Depth** (objective, counted from the bottom of the chat) and from **Order** (tie-breaker among entries sharing a position), and the main global Activation Settings (Scan Depth, Context %, Budget Cap, Case Sensitive, Match Whole Words, Min Activations, Max Depth). The back half of the thread is a year of Q&A: why depth/position matters ("attention"), whether to move character-card fields into World Info, WI-as-RAG framing, and a troubleshooting case for entries firing without their keyword present.

---

## 1. What is World Info / a Lorebook

> "In a very simple sense, it is a way to send additional text to the AI apart from your chat and character card description... It's all just additional text boxes with ways to 'trigger' when they are sent."

- You could technically put the character description itself into World Info (author says he covers that "another time" / points at the other guide — not included in this thread).
- Author's Note does something similar; WI just has far more control over triggering and placement.
- A lorebook can be **global** (activate it, use with any card/chat), tied to a **particular chat**, or tied to a **particular character card**. This guide only covers the global case.

Setup: click the World Info icon → "New World" to create your first lorebook. The author's example world is named "Banana Farm".

---

## 2. The prompt — what actually gets sent

Before touching entries, the author establishes what "the prompt" is: every time you message the AI, ST sends one full wall of text made of:

- Information from your character card
- Your chat history
- "More stuff" (World Info, covered next)

You can see the literal text ST sent by opening the ST console (the CMD/terminal window) and scrolling — the raw prompt appears there. Formatting differs per backend/model.

---

## 3. Creating your first entry

Minimum fields needed for a basic entry:

- **Key(s)** — the trigger keyword(s), e.g. `Banana`. The keyword only *activates* the entry; it is not itself inserted into the prompt. Only the **Content** field's text is sent — you must write the actual information in Content (e.g. writing "They have purple ones too" in chat won't make the AI aware unless the entry's Content field explicitly says it).
- **Strategy**, one of:
  - 🟢 **Normal** — activates only if the keyword is found in the (scanned range of the) chat.
  - 🔵 **Constant** — always inserted, keyword irrelevant.
  - 🔗 **Vectorized** — activates via vector/semantic search instead of literal keyword match (introduced here as a third option; not elaborated further in this thread).

Once an entry is created, **don't forget to activate the lorebook itself** (there's a separate on/off toggle for the world, distinct from individual entries).

Verified in the walkthrough: with a `Banana` entry active and the lorebook enabled, the model picked up the entry's content ("purple bananas") in its reply, and the console showed the entry's text inserted at the very top of the prompt — because "Before Character Definition" is the position default.

---

## 4. Position vs Depth

**Position** = a *relative* insertion point, anchored to one of ST's built-in prompt parts:

- **CN** → Character Definitions. Default is "Before Character Definition" — this is why a fresh entry lands at the very top of the prompt, above the character's own definition.
- **AN** → Author's Note. Places the entry relative to your Author's Note, if you have one defined.
- **EM** → Example Messages.

**Depth ("At Depth")** = an *objective* position, counted from the bottom of the chat, independent of the other prompt parts:

- **Depth 0** = the very bottom, inserted even after your last message to the AI.
- **Depth 1** = right above the last message.
- **Depth 2** = above the last 2 messages.
- ...and so on.

When inserting **at depth**, you also choose a **role** for the injected line: **User**, **Assistant**, or **System**. System is used when you don't want the AI to think the text was part of an earlier chat turn — it stays distinct, and "many AIs freak out if there's no role assigned."

Worked example in the guide: an entry set to Depth 2, role System, and the console output shown to confirm exactly where it landed.

---

## 5. Order — tie-breaking within a position

Order controls sequencing **among entries that share the same position/depth**. Numbering runs opposite to Depth:

```
order 1     - topmost
order 560   - goes here (middle)
order 99999 - bottommost
```

Worked example: author has two entries at the same position — "Purple Bananas" and "The Farm" (specifying the farm is in the British countryside, not India, after the model wrongly assumed India). Setting Order = 1 for Purple Bananas and Order = 2 for The Farm put Purple Bananas first in the sent prompt, as intended.

> "So you can combine the Order field with the Position field. If you have a group of entries at a certain position... Order helps you arrange the entries amongst themselves *at that position*, like a sort of tie-breaker!"

---

## 6. Activation Settings (global, per-lorebook)

These are the world's default treatment for every entry; ST lets you override most of them per-entry too.

| Setting | What it does |
|---|---|
| **Scan Depth** | How many messages back (from most recent) ST scans for keywords. Example: Scan Depth = 4 and you're about to send message #7 → ST only checks messages #7, #6, #5, #4 for the keyword. (A 🔵 Constant entry ignores this — no keyword needed.) |
| **Context %** | Cap on how much of your total context budget (set in the sampler panel) World Info as a whole may consume. Once triggered entries would exceed this %, no more entries get inserted. |
| **Budget Cap** | Same idea as Context %, but a hard token-count cap rather than a percentage. |
| **Case Sensitive** | Self-explanatory — keyword matching respects case. |
| **Match Whole Words** | With this on, `Banana` triggers but `Bananas` does not. |
| **Alert on Overflow** | Pops a warning if the WI budget gets exceeded. |
| **Min Activations** | Ignores Scan Depth — keeps scanning further back in history until at least *Z* entries have activated. |
| **Max Depth** | A cap that bounds how far back Min Activations is allowed to scan. |

Named but explicitly deferred by the author, never covered in this thread: **Recursion**, **Group Scoring**.

---

## 7. From the comments (Q&A, grouped by topic)

### 7.1 Why does depth/position even matter?
`Doom` asked directly why they should care where things get inserted.

- `underscore_x` — the underlying concept is usually called **"attention"** (a technical/model term; "doesn't strictly apply to creative writing use cases, but—"). No further technical elaboration given in-thread.
- Practical guidance given elsewhere in the thread (see 7.2) is more concrete than the "attention" name-drop.

### 7.2 Where should instructions/character info live — card fields or World Info entries, and at what depth?
`Katrun` asked a cluster of questions: should instructional/important entries sit at Depth 4 @ System because the model weighs the bottom of the prompt as most important; should character descriptions go into World Info too, and at what depth; what should stay in the character card itself (description/personality/scenario/character's note/example messages)?

- `underscore_x` — **it's all personal preference, there's no "should."** "Why would I limit myself to static text in a 'personality' field, when I could have whatever I need in a worldinfo entry." If the built-in card fields already work for you, that's fine too — **what matters is what depth the text gets inserted at, not which UI box it started in.**
- There's no functional need for "personality" or "scenario" fields to exist as such — "those are just vestiges of whoever dreamed up the character card templates." In the final prompt it's just text, sometimes with prefix text like `scenario: ` — you can replicate that yourself in a raw WI entry.
- On **depth for influence**: if you want something to actively steer the ongoing scene, put it toward the **bottom** of the prompt (i.e. low Depth values / near the end).
- Instructions placed only at the **top** of the prompt work fine to *start* a conversation, but lose influence as the chat grows or drifts — "if you want to add new instructions, or find the interaction deviating slowly from them, you can imagine that instructions at the top are not as useful." The fact that "jailbreaks with random token stuffing work at all" is offered as informal evidence that top-of-prompt system instructions alone aren't sufficient to keep a model on-track.
- Katrun's takeaway, confirmed as reasonable by the author's silence/agreement in-thread: put an important, character-voice-preserving entry in as **Constant @ Depth 4**, and keep the character card itself barebones.

### 7.3 "World Info is RAG"
- `ipc` — "In my opinion, world info is a kind of RAG that works on regex instead of vector searches... and you should just think of it like that."
- `underscore_x` — **"that's not an opinion, it is just a fact, worldinfo is for RAG, with options for both regex and vector searches."** (Confirms Vectorized strategy from §3 is a real, supported second retrieval mode alongside keyword/regex matching, though not elaborated further here.)
- Author reiterated the thread is deliberately written as a **beginner's guide** despite this more technical framing being accurate.

### 7.4 Entry fires even though its keyword was never used — troubleshooting
`Katrun` reported an entry set to 🟢 Normal strategy showing up in the sent prompt (checked via prompt inspection) despite the trigger keyword never appearing in chat messages.

- `underscore_x` — check, **in this order**: **recursion**, **additional matching sources**, **vectorization**. (No further detail given on how each specifically causes this in this thread — treat as a checklist, not a full explanation; recursion itself was never covered earlier in the guide either, see §6.)

### 7.5 Card fields vs. lorebook — is a Constant entry just a permanent version of a card field?
`Deleted User` asked: are character-card fields (description etc.) essentially just "cosmetic/historic" — and is a lorebook entry set to 🔵 Constant functionally the same as the card's own Description field, i.e. permanent tokens injected into the prompt every time?

- `underscore_x` — **confirmed correct** ("got it right").
- Follow-up tip: to see this for yourself rather than take it on faith — install the **Prompt Inspector** extension (Extensions panel → Download Extensions and Assets → Prompt Inspector), enable it via the magic-wand (✨) menu, and inspect the actual sent prompt directly.

### 7.6 Practical asides
- `Farris` independently confirmed getting instructed formatting (markdown) to display correctly using **CommandR+** with **max tokens = 500** and an entry at **Depth 2, role System** — i.e. model compliance with formatting instructions is achievable with the right depth/role/token budget, contradicting an earlier claim (from a now-removed message) that the model was "ignoring markdown."
- The author repeatedly redirected deeper troubleshooting/support questions to the server's dedicated help channels (`🆘┃sillytavern-help`, `🧙┃prompt-crafting`) to keep this thread uncluttered — several such redirects are omitted here as pure channel-pointer chit-chat.

---

## 8. Links & resources

- Official docs (read first, per the author): <https://docs.sillytavern.app/usage/core-concepts/worldinfo/> — "World Info (also known as Lorebooks or Memory Books)..."
- Companion guide referenced in the opening post: *"Getting the most out of WorldInfo…"* — title truncated in the scraped export, no resolvable link captured; likely another post in the same `💡・st-guides` forum by the same author.
- Author's separate FAQ-collection call for a "dummies guide" companion doc (2 Jul 2025): Google Form, free-text, no fixed questions — <https://docs.google.com/forms/d/e/1FAIpQLSfx3C2lqUA2plTjIChlgUFUOgYi2_HQ6WucVlQmWXQR6z3jvA/viewform?usp=header>. Author asked responses go through the form (or DM), not as replies in-thread.
- Third-party tool mentioned for verifying prompt structure yourself: **Prompt Inspector** extension, installed via ST's Extensions & Assets downloader (see §7.5).
- Screenshots throughout (creating a world, entry field layout, console/prompt-inspector views of Banana/Farm entries at various positions and depths, activation-settings panel) are Discord CDN image attachments; links were time-limited (`ex=`/`is=`/`hm=` signed params) and were not fetched — they are illustrative of the exact same UI steps described in prose above, so no content is lost by omitting them.
