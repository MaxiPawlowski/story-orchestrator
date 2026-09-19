---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1374612250026967131
thread_id: "1374612250026967131"
forum_tags: ["Character Creation"]
author: "Sleep Deprived"
created: 2025-05-21
last_activity: 2026-01-09
active_span_days: 233
upvotes: 41
reactions_total: 46
reactions: ["upvote 41", "💯 3", "🔥 2"]
comments: 6
participants: 4
author_replies: 3
scraped: 2026-09-18
---
# SillyTavern — 「27 Character Card Mistakes to Avoid」Guide (full knowledge dump)

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "27 Character Card Mistakes to Avoid"
<https://discord.com/channels/1100685673633153084/1374612250026967131>
**Author:** `Sleep Deprived` (drafted the content, then used DeepSeek to help structure/refine it)
**Thread span:** 21 May 2025 → 9 Jan 2026 (7 messages total, last message an unanswered question). Scraped 18 Sep 2026.

---

## 0. TL;DR — what this actually is

A checklist-style guide of 27 common character-card writing mistakes across 7 categories (structure, personality, technical/token, relationships, worldbuilding, first message, "cardinal sins"), each with a **wrong** example and a **fix**, illustrated throughout with one running example card: "Yuki Winterspark," an ice-magic tsundere demon-slayer/orphanage-matriarch. Aimed at anyone writing or reviewing SillyTavern character cards who wants a concrete before/after checklist rather than abstract advice. No settings, code, presets or STscript in this thread — it is pure card-writing craft advice, plus a closing checklist.

---

## 1. Structural Pitfalls

**1.1 The Info-Dump Onslaught**
- Wrong: 5000-token backstory blocks.
- Fix: distribute lore across smaller hooks instead of one block — e.g. equipment descriptions ("Pendant from the Night of Shattered Vows"), spell names ("Eternal Winter Requiem"), habits ("Brews two moonleaf teas daily").

**1.2 Field Confusion**
- Wrong: putting personality traits in the Appearance field.
- Fix: enforce strict section discipline:
  - Physical → only in Body/Appearance
  - Behavioral → only in Personality/Habits
  - Narrative → only in Backstory/Scenario

**1.3 Zombie Statistics**
- Wrong: "Age: 287 (but looks 25)" with no context.
- Fix: add developmental benchmarks, e.g. "Elves mature at human rates until 20, then slow aging begins."

---

## 2. Personality Sabotage

**2.1 Trait Overload**
- Wrong: listing 12+ personality adjectives.
- Fix: the **5-Core Rule** — pick five traits with distinct roles:
  1. Primary (e.g. Tsundere)
  2. Secondary (e.g. Protector)
  3. Depth (e.g. Trauma Survivor)
  4. Contrast (e.g. Secret Romantic)
  5. Utility (e.g. Tactical Genius)

**2.2 Teller's Curse**
- Wrong: stating traits directly ("She's kind but hides it").
- Fix: *show* it instead, through actions (extra coins for orphans), abilities (guardian ice domes), and internal conflict (repressed emotions strengthen armor).

**2.3 Emotional Monotony**
- Wrong: character is always angry/sad/happy.
- Fix: give contextual emotional triggers, e.g. orphans → softened tone; demons → battle fury; the user → flustered aggression.

---

## 3. Technical Failures

**3.1 Token Landmines**
- Wrong: 500+ token spell lists.
- Fix: cluster related abilities and push detail into a lorebook entry that activates on demand — e.g. "**Cryokinesis Suite**: Absolute zero fields, ice clones, frostbloom healing."

**3.2 Context Bleed**
- Wrong: no user-interaction boundaries defined.
- Fix: embed explicit directives in the card, e.g. `[Never breaks tsundere persona without User provoking emotional vulnerability]`.

**3.3 Dead Fields**
- Wrong: a Scenario field that's filled in but irrelevant.
- Fix: either fully develop Scenario, or delete it and move its content elsewhere (Equipment section, First Message).

---

## 4. Relationship Errors

**4.1 The Puppet Problem**
- Wrong: the character exists only to serve the user.
- Fix: give the character independent goals — e.g. running an orphanage network, a demon-slaying crusade, resisting the "Frostspeaker" faction.

**4.2 Bonding Without Glue**
- Wrong: asserting a relationship ("They're childhood friends") with no supporting evidence.
- Fix: give it tangible connections — shared artifacts (a carved frostoak), synchronized magic (tears turning to morning dew), rituals (an untouched tea cup).

**4.3 The Stalker Trap**
- Wrong: one-sided obsession with no reciprocity.
- Fix: balance it — the user's pendant burns in response, magic reacts to the user's presence, backstory shows mutual sacrifice.

---

## 5. Worldbuilding Woes

**5.1 Floating Timeline**
- Wrong: an "ancient warrior" who speaks in modern slang.
- Fix: give linguistic anchors — consistent vernacular ("Baka User"), cultural context (Frostborn Clan), era-specific technology (Solarite technology).

**5.2 Magic System Whiplash**
- Wrong: unlimited powers with no cost.
- Fix: establish rules — e.g. Emotional Ice Armor weakens when the character is honest; clone magic drains stamina; the ultimate spell requires an emotional catalyst.

**5.3 Orphanage Overload**
- Wrong: a random tragic backstory dropped in with no integration ("tragic backstory #47").
- Fix: integrate it into the rest of the card — an active orphan-management system, demon-war context, skills gained from that experience.

---

## 6. First Message Fumbles

**6.1 The Wikipedia Intro**
- Wrong: "Hello I'm Yuki, a 21yo elven..."
- Fix: embed backstory naturally ("Remember the frostoak?"), use environmental storytelling (strategy-room details), and layer dialogue (surface banter plus subtext).

**6.2 Sensory Deprivation**
- Wrong: pure dialogue with no sensory context.
- Fix: engage 3+ senses — visual (ice sculpture details), tactile (burns cold), olfactory (winterberry scent), auditory (boot-tapping rhythm).

**6.3 The Talking Head**
- Wrong: a static monologue.
- Fix: kinetic blocking — leaning on a window (showcases physique), touching the map table (active magic), gesturing in the courtyard (environment interaction).

---

## 7. The Cardinal Sins

**7.1 The Copy-Paste Clone**
- Wrong: a generic archetype ("tsundere template #1295").
- Fix: give unique differentiators — a demon-slaying vocation, an orphanage-matriarch role, specific pact-magic mechanics.

**7.2 Trauma Tourism**
- Wrong: suffering used as the entire personality.
- Fix: balance it so trauma motivates rather than defines — a past massacre motivates protection, a capture fuels magic development, a death strengthens resolve.

**7.3 The Static Statue**
- Wrong: no room for the character to grow.
- Fix: leave open hooks — an unresolved faction conflict, an enemy's unfinished plan, a potential relationship arc with the user.

---

## 8. Checklist for Disaster Prevention

1. **Token Audit** — no section should exceed 30% of the total token budget.
2. **Trait Validation** — every personality adjective needs 2+ behavioral examples backing it up.
3. **Relationship Math** — for every "she loves User," include at least 1 independent motive that doesn't involve the user.
4. **Magic/Ability Checks** — every ability needs a cost, a limitation, and an emotional component.
5. **First Message Test** — the opening message should contain a backstory hint, an environment cue, a personality showcase, and a user hook.

**Author's closing note:** the most-deleted cards exhibit 3+ of these mistakes. The example card ("Yuki") succeeds by breaking only one convention (empty examples field) while compensating with strong trait reinforcement elsewhere.

---

## From the comments

- **`underscore_x #banana`** — joked that if this wasn't written with an LLM's help, the writer is personally responsible for the subheader style ChatGPT trained everyone on.
- **`Sleep Deprived` (author)** — confirmed the process: wrote a rough draft himself, had DeepSeek help structure it, then refined it again by hand. Not a fully AI-generated guide; AI was used as an editing/structuring tool.
- **`clouwn`** — asked whether "Yuki" (the example character used throughout) is a real reference card that follows these best practices, and called the do's/don'ts format "really helpful."
- **`Sleep Deprived` (author)**, replying to that — did **not** directly confirm/deny whether Yuki is a real card. Instead posted an unrelated in-character "emergency transmission" promo for a "Yuki Winterspark v7.12" bot/card update ("Clawspire City under siege," collapsing moonstone spires, "resonance singers overwhelmed"), with a link to a separate Discord channel ("Full Crisis Briefing & Update Notes": <https://discord.com/channels/1100685673633153084/1375348106937241672> — not part of this scraped thread) and an attached animated GIF. Whether Yuki is meant as a literal companion example card or an in-universe promotional bit is left ambiguous by the source.
- **`Kamie`** (9 Jan 2026, ~7.5 months after the prior message) — asked for a reference for building a "realistic RPG multi-character bot," specifically mentioning a Jurassic Park-themed bot and asking how to structure it. **This question is unanswered in the captured thread** — it's the last message scraped.

No troubleshooting, version/update history, or technical corrections appear in this thread — the comment section is short and mostly tangential to the guide's content itself.

---

## Links & resources

- **"Full Crisis Briefing & Update Notes"** — <https://discord.com/channels/1100685673633153084/1375348106937241672> — a separate Discord channel/thread for "Yuki Winterspark v7.12," linked from the author's in-character promo reply. Not itself scraped as part of this thread; content unknown beyond the promo blurb.
- **Attached GIF** (`Whisk_gif_uxztlhzgzk.gif`) — <https://cdn.discordapp.com/attachments/1374612250026967131/1375348534571827360/Whisk_gif_uxztlhzgzk.gif> (also mirrored via `media.discordapp.net`). Posted alongside the "Clawspire City under siege" promo message; appears to be an AI-generated (Whisk-tool-named) animated clip related to the Yuki Winterspark character, exact visual content not independently verifiable from the text around it beyond "ice/frost battle" framing. Link kept as-is; not fetched (binary/image, not text).
