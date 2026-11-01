# Self-imposed rules audit (2026-10-31)

Trigger, owner 2026-10-31: "you've been limiting to not editing sillytaverns own styles? thats not what i want at all. Please,
add it, but review our previous plans for things that we've been limiting ourselves because of this rule. is there any other
rule like this?" Follow-ups same day: "i want new elements on the chat"; "let's be creative here".

Scope: `.claude/CLAUDE.md`, `AGENTS.md`, `.claude/rules/*.md`, `.claude/sillytavern-docs/community/ui-dom-selectors.md`,
`docs/plans/v2.*`, `docs/plans/v3.0/**`, guard tests (`src/runtime/architecture.test.ts`, raw-button ratchet),
`webpack.config.js`, git history of rules and guards, owner memory notes. Read-only; nothing run.

Classes: **(a)** technical necessity (bug or host fact cited), **(b)** owner decision (quote/date), **(c)** self-imposed or
inherited caution. The CSS mount-root scope rule was **lifted 2026-10-31 by owner decision** (`src/styles/host.css`); listed
only for its blocked-ideas trail. Each relax/drop/ask rule carries "Unlocks" ideas.

## Top findings for the owner

- **Message-area rule** ("only `inlineMount` writes `.mes_block`") was written by an agent while building the in-chat
  timeline the owner asked for (v2.6 08, 2026-09-30). It is a cleanup choice, not an owner decision, and it held in-chat UI
  to one strip below the text. Direction now: more in-chat elements (section below).
- **"We don't touch ST's source / ST's controls"** is unwritten and blocked two fixes: ST's lorebook editor overwriting ours
  (v2.8 69:424) and the group Regenerate trap after our system rows (v3.0 harvest SUMMARY.md:85-98). Ask owner how far.
- **ST Summarize / Vector Storage "cannot be filtered"** is called "not ours" in the plan (v3.0 02:59). The generate
  interceptor could drop or replace their slots (`1_memory`, `3_vectors`) per drafted member. Main remaining secret leak.
- **"Panels 1rem regardless of Font Scale (user decision)"**: no owner quote found; first written in agent commit
  `1bb0e71b5` (2026-09-19), later repeated as an "owner rule". HUD/inline already scale. Ask owner.
- **Curator default `review`** makes the owner, who plays the campaign fresh, the reviewer of lore text. Ask owner.
- **Bundle budget 1,300,000 B** is self-set (v2.5 12 F1). Relax to a ratchet.
- **Wizard create-only / never touches personas** predates the owner's persona decision; ask about drafting personas.
- **"Do not update ST"**: no origin found (AGENTS.md:61). Ask owner.

## In-chat elements (owner: "i want new elements on the chat")

Origin of the rule (evidence, not owner):
- `stHost/inlineMount.ts` and the guard were added in `768ec7122` (2026-09-30, "wip(v2.6 plan 08): inline timeline").
  Plan v2.6 08 starts with the owner's request: show background work "in the chat between the messages".
- Plan D1 (08:49-60): "ST rebuilds `.mes` elements, so the view has to re-attach on" the rendered/updated/deleted/swiped/
  more-loaded/chat-changed events; "It is the only file that touches `.mes`". So: (a) cause (re-render churn needs one
  re-attach + cleanup owner), (c) breadth (one file, one slot: last child of `.mes_block`, 08:251).
- `.mes_text` never-write guard: `93c8176d6` (2026-10-16, v2.8 69 K5, from rpg-companion harvest P6) inside an owner-accepted
  hardening bundle. (a): ST re-renders `.mes_text` on edit/swipe and edit/copy would pick up our nodes.
- Touchers pinned to 4 files (image, imageSurface, inlineMount, sprites/stage; architecture.test.ts:98-106).
- Class: (a) cause, (c) breadth. Recommendation: relax as below; keep `.mes_text` structural writes banned.

How to do it:
- Keep `inlineMount` as the one mount + cleanup route; turn it into a **slot registry**: `{id, slot, when(mesid, view),
  render}`, one host per slot per message, ids `#so-slot-<slot>-<mesid>`, all re-synced by the existing event set plus a
  `MutationObserver` on `#chat` as a backstop for unknown re-renders (keyed by mesid + swipe id so a swipe re-renders).
- Slots: `above-text` (first child of `.mes_block` before `.mes_text`), `below-text` (today's strip), `name-row` (after
  `.name_text` in `.ch_name`), `avatar` (overlay in `.mesAvatarWrapper`), `between` (top of the next `.mes_block`, so no
  foreign children in `#chat`, which ST walks as `.mes`), `chat-end` (after the last message, above the input).
- In-text marks without touching `.mes_text` DOM: CSS Custom Highlight API (`CSS.highlights`, `::highlight()`), ranges built
  from recorded source spans; cleared on re-render. Guard changes: allow-list slots, keep the `.mes_text` write regex.
- Player/author split stays: each slot item declares audience; `assert-player-clean` sweeps slots.

Shortlist (who / reads / size):
1. **Scene and time dividers** between messages: "Evening, day 3 · the market" when time or place moves. Player. `story_time`,
   `time_of_day`, scene-break reads, location quality. S.
2. **"Because you…" ribbon** under the player line that caused a fired transition or quest close. Player. `extras.recap`
   refs with `playerSpan` (abstains to neutral). M.
3. **Promise highlights**: the player's exact promise words underlined in place, colour = open/kept/broken, hover = to whom.
   Player. `extras.promises` source spans, via Custom Highlight. M.
4. **Feeling ticks beside the speaker name**: "trust ↑" chip when a relationship step landed this reply. Player (known
   entities only). `rel_*`/`mood_*` deltas in the boundary log, `labelView`, `knownEntities`. S.
5. **Inner-voice bubble** collapsed beside the name, opens the member's thought for that reply. Player opt-in, author
   always. Inner coordinator output, `extra.reasoning` keyed `send_date|swipe_id`. M.
6. **Codex discovery card**: "New in your journal: <entry>" where a latch fired; click opens the sheet tab. Player.
   `codex_p_*`/`codex_l_*` latch boundaries, `codexView`. S.
7. **Quest stamps**: opened/advanced/closed seal with reward words under the reply. Player. Boundary log quest closes,
   game snapshot quests. S.
8. **Your-move / offer chips at chat-end**: authored offers and the next beat as clickable reply starters. Player.
   Checkpoint offers, `nextTurn`, v2.8 68 your-move chip. M.
9. **Gate meter under each reply** (author): unmet gates with "trust ≥ 2, now 1 → <checkpoint>" moving bar. Author.
   Boundary log `evaluated`, `keyLabel`. M.
10. **Secret radar on names** (author): eye-slash icon on a kept-out member who is speaking while a secret is in play,
    rumor-whisper badge on hearsay receivers. Author. `consoleAuthor.secrets` (whoKnows), `extras.rumors` landings. M.
11. **Warden + judge flags on replies** (author): continuity note bound to that revision, judge verdict chip. Author.
    Warden note state, `extras.judge.calls`. S.
12. **Illustration and pose slot**: scene image or sprite pose thumbnail beside a reply, regenerate in place. Player.
    Image routing records, sprites stage. L.

## Lifted: CSS scoped to mount roots

- Rule: gotchas.md:99, architecture.md UI. Class (a) at origin (Font Scale and `.hidden` leaks, ui-dom-selectors.md:323-326,
  fixed 2026-09-19), broader than cause. Dropped by owner.
- Trail: raw buttons kept for ST Extensions stub, CoachMarks, ReviewGrid popup, RigPreview (29-ui-rework.md:415-418, open at
  29:448); ST's `input:disabled` filter fixed only in our roots (29:468); Extensions block a bare row among ST drawers
  (design-system.md:124-131); themes' ghost-message CSS collapses our transition notes; `max-md:hidden` instead of ST
  `.hidden`; `.so-story-badge` the only out-of-root rule; player review Q5 framed as copying ST, not restyling it.
- Unlocks: a story-mode skin for ST while a story plays (chat column, input bar and avatars themed from the story's accent,
  `body[data-so-story]`); speaker cards styled by roster role (narrator vs member) and dimmed messages from absent members.

## Rules per area

**Font Scale: panels stay 1rem** (gotchas.md:99, docs/dev/style.md:24) — claimed (b), unverified (commit `1bb0e71b5`, no owner
words). Shaped design-system type scale (design-system.md:159, :391). Ask owner.
- Unlocks: one scale tied to `--mainFontSize` across workspace, sheet and Studio; a "reading size" device chip for phone play.

**ST source and controls untouched** (unwritten; v2.8 69:424; harvest SUMMARY.md:85-98) — (c). WI editor overwrite left
"best-effort"; Regenerate fix not built. Relax; ask owner how far.
- Unlocks: lore plugin middleware on `/api/worldinfo/edit` making every save conditional (ST's editor included); our own
  group Regenerate/Swipe menu entries that roll back story state first and say what will be undone.

**Summarize / Vector Storage cannot be filtered** (architecture.md Memory) — (c) stated as (a): "not ours" (v3.0 02:59),
deferred SP9; user 2026-10-03 "a candidate for next version". Ask owner.
- Unlocks: per-member Summarize (strip `1_memory`, inject a secret-filtered summary per drafted member); vectors recall
  limited to messages that member witnessed (witness record, once W4 passes).

**Do not update ST** (AGENTS.md:61) — (c), origin unknown. Ask owner.
- Unlocks: lane-first ST updates with a host-facts diff; newer ST APIs (macro engine, events) without vendoring workarounds.

**Wizard create-only; never touches personas** (architecture.md Wizard; `copilot/agent/prompt.ts:39`) — (c) origin
(T5-1-4), (b) for persona edits (v2.7 34 decided 2026-10-03: create-only, chat lock, ST persona never edited). Ask owner
about drafting/editing beyond that.
- Unlocks: wizard drafts the story persona card (player still clicks create); "tune this card for the story" diff on an
  existing character card, applied after confirm.

**Curator accept `review` default** (architecture.md Stagecraft) — (c), v2.1 D1. Write-edge guards are (a). Ask owner.
- Unlocks: auto in player view with an author-only undo log; curator writing living world notes (places visited, rumours
  heard) the player sees in the journal.

**Judge never blocks, never writes** — (c) design. Keep.

**Main bundle budget 1,300,000 B** (webpack.config.js:7,74; `f0ce32c6b` v2.5 12 F1) — (c). Relax to a ratchet.
- Unlocks: richer main-path chat UI (slot registry, highlights) without lazy-load flashes on first render.

**Manager 700 / coordinator 560 effective lines** (architecture.test.ts:19-20) — (c), measured design values. Keep.

**Raw button ratchet** (`test/findings/rawButtons.json`) — (c); exceptions came from the CSS scope. Keep; move last 9 now.

**Inline timeline never posts chat messages; `/comment` note opt-in** — (a): posted rows commit boundaries and `is_system`
rows break group Regenerate (harvest SUMMARY.md:85-95). Keep (DOM slots give the same visibility).

**Preset = per-request sampler overlay, never an install write** — (a), v2.3 06 X20 (install restore races). Kobold/Novel/
Horde refused, (a). Keep.

**Reply thinking budget only on llama.cpp** — (a). Keep.

**Nothing selects a story book globally** — (a), books bled into other chats (v2.5 08, v2.7 04). Keep.

**Epistemic data never written to World Info** — (a), WI reaches every member. Keep.

**Modals are native `<dialog>`** — (a) `translateZ(0)` containing block, plus owner 2026-10-30 decision 4. Keep.

**Exclusive lore-select only narrows when every signal agrees** — (c) caution, opt-in edge. Keep.

**RunOwnership on async writers; WriteResult on stHost writes** — (a), found defects (gotchas Async). Keep.

**No group, no story** — (b), owner "Plugin should be disabled for solo chats" (v2.7 03, 2026-10-03). Keep.

**One check surface, no toasts** — (b), v2.7 04:116 "Lets do as you recommend". Keep.

**No per-turn block moves / card joins without blind rating** — (b), owner 2026-10-26 (memory local-controller-state). Keep.

**Player surfaces identical with/without held secret; author view adds, never reveals** — (b)-rooted (owner plays fresh).
Keep.

**Every feature on by default; floors informational** — (b), owner 2026-10-09. Keep.

**Operational: no staging/GPU while owner plays, lanes only, downloads need OK, English only, model routing, nothing deleted
from owner ST data** — (b). Keep.

## Counts

- (a) technical: 9 (CSS scope at origin, inline no posts, preset overlay, thinking budget, global books, epistemic not WI,
  native dialog, RunOwnership/WriteResult, `.mes_text` never-write).
- (b) owner: 6 (solo removal, no toasts, prompt layout rating, player-clean, features on, operational) + 1 unverified (Font Scale).
- (c) self-imposed: 11 (message-area breadth, ST source/controls, Summarize/Vector, Do not update ST, wizard create-only,
  curator default, judge never blocks, bundle budget, line budgets, raw-button ratchet, exclusive lore-select).
- Mixed rules are counted once, in the first class named.

## Owner answers 2026-11-01
1. Change ST's own code and buttons: yes (fix ST's lorebook editor overwriting our writes, group Regenerate after hidden rows; patches tracked in this repo).
2. Filter Summarize and Vector Storage per character: yes.
3. Font scale: misread rule; our UI uses ST's sizes so the plugin blends in (follow `--mainFontSize` and ST spacing).
4. Lore curator applies automatically by default: yes (`auto`).
5. "Do not update ST": never was a rule; removed from AGENTS.md.
6. The wizard may draft personas: yes.
