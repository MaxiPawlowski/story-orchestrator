# Plan 23: Story widgets (story-authored UI for its mechanics)

**Status: DRAFT 2026-10-03 (user topic). Not decided.** Overview: `00-overview.md`. **Gate tiers:** implementation D;
acceptance D (widgets read state, they never call a model). Builds after v2.8 18 (visible qualities), because most widgets
show what 18 makes public.

The user's words: "Shall we create a plan to allow stories to create dedicated html ui for certain mechanics? Like a board
for arcs or idk some other examples."

## The idea

A story declares widgets that show its own mechanics: a board of open and resolved threads, a clue wall, a map of places
reached, faction standing, a countdown clock. Each widget is a movable panel in the panel framework (v2.7 06). It reads
the same state the drawer already reads, and only what the player is allowed to see.

## What exists today

- **The state a widget would show already exists:**
  - qualities (`blackboard`);
  - checkpoint path and names (`narrative.ts`);
  - arcs (`memory/types.ts` `ArcEntry`: id, text, `open`/`resolved`, entities, summary);
  - chapters;
  - tension history;
  - rolls (`snapshot.rolls`, v2.7 06);
  - the quests and visible qualities of v2.8 18 once built.
- **Where widgets would live:**
  - v2.7 06 ships the movable-panel framework and per-story toggles.
  - v2.8 18 adds `display.public` for qualities.
- **Today `StoryDisplay` holds only `lore_names_public`** (`schema.ts:406`). Nothing renders story-authored UI, and
  the story format carries no markup.
- **What players see vs what authors see:**
  - The player sees the Overview composition (`narrative.ts`).
  - The author sees everything in Author view.
  - The spoiler checklist (`assert-player-clean`) guards the player side.
- **Prior art, to verify before building:** some ST card/extension communities render HTML status bars inside messages
  through regex scripts or script-runner extensions. We have not checked any in our extensions corpus (`C:\dev\st-extensions-research` has none indexed).

## The core risk: author HTML is code from a stranger

Stories are shared files. A story that ships raw HTML/JS runs inside SillyTavern's page, which holds:
- the CSRF token;
- the user's chats;
- calls that can write secrets and settings.

So "the story brings its own HTML" must never mean injecting it into our DOM. The options below are ordered by how much
an author can do against how much a downloaded story can do to the player.

## Options

### A. Declarative widgets (recommended first)

The story picks a widget **kind** and binds it to state. We render it with our own React components, so no author markup
is ever executed. Kinds that cover the examples:

| Kind | Shows | Binds to |
|---|---|---|
| `board` | columns of cards (open / resolved threads, or any enum) | arcs, or an enum quality per item |
| `clues` | found clues, optional links between them | bool qualities + an authored link list |
| `map` | an authored image with pins for places reached | checkpoint ids or a location enum; pins hidden until reached |
| `meters` | bars/numbers (standing, supplies, sanity) | public int/float qualities |
| `clock` | Blades-style segmented countdown clocks | an int quality + segments |
| `track` | a numbered progress track with named stops | int quality or checkpoint path |
| `roster` | party or faction list with a status per member | per-member enum qualities |
| `timeline` | chapters and checkpoints reached, with dates if authored | chapter/path state |
| `log` | the last N rolls, checks or notes | `snapshot.rolls`, v2.8 18 checks |

- **Schema:** `widgets: [{id, kind, title, bind, options, visible_when?, audience: "player" | "author"}]` in the story.
  - The validator checks binds against declared qualities.
  - `visible_when` uses the existing gate grammar.
- **Spoiler safety:**
  - A widget shows only public qualities (v2.8 18 Q2), reached checkpoint names and the player copy of arcs.
  - An `author` widget appears only in Author view.
  - Pins, clues and cards are hidden until their condition holds.
  - Hidden items never ship to a player surface, not even as hidden DOM.
- **Theming:** the CSS lives in our scoped roots. A story may pick an accent colour and an icon set from a fixed list,
  never raw CSS.
- **Cost:** one component per kind plus a pure projection (`runtime/widgets.ts`) composed into the snapshot.

### B. Sandboxed author HTML (possible later, on top of A)

For layouts the kinds cannot express, the author ships an HTML template. It renders in an
`<iframe sandbox="allow-scripts" srcdoc=…>` with **no `allow-same-origin`**, so the template cannot reach ST's page,
cookies, storage or network.

- **Data in:** the host posts the **same player-safe projection** A uses, over `postMessage`. The frame never sees raw
  state.
- **Data out, at most a closed list of intents:**
  - "put this text in the input box" (never send);
  - "open the drawer at X";
  - "request a roll the story declares".

  Each intent is validated by the runtime like any player action. The frame cannot write qualities.
- **Content-Security-Policy:** the CSP in `srcdoc` blocks network access (`default-src 'none'`, inline only), so a
  template cannot phone home with what it was shown.
- **Gates:**
  - escape tests: no `parent` access, no network, no same-origin;
  - a malicious-template fixture;
  - projection leak tests.
- **Cost:** higher; plus an install-wide switch "Allow story-made panels", default off, with an explanation.

### C. Raw HTML in our DOM: rejected

It runs a downloaded story's script with the player's ST session. Not offered.

## Recommendation

- Build A with 5 kinds first: `board` (arcs), `meters`, `clock`, `clues`, `map`.
- Ship `track`, `roster`, `timeline`, `log` when a story asks for them.
- Author them in the Studio (a Widgets tab with a live preview over a sample state).
- Add one Adolion pilot widget (an arcs board) through v2.8 02.
- Leave B as a seed until an author needs a layout A cannot express. If B is built, it is sandboxed exactly as above and
  off by default.

## Gates

- **Pure:**
  - the projection per kind;
  - hidden items absent from the player projection (property test over random states);
  - `visible_when` gating;
  - rollback ≡ replay (a widget rebuilt after a swipe shows the restored state);
  - validator errors for a bad bind.
- **UI:**
  - Storybook interaction plus a11y for every kind, at phone width too;
  - `assert-player-clean` with every widget open;
  - Author-only widgets absent in player mode.
- **Live (D, no model):** a scripted story on a lane: set qualities by `/cp set` in Author view, check each widget
  updates, swipe back, check it reverts.
- **Payload invariance:** widgets change nothing sent to the model.
- **Registry:** a feature entry plus a Help topic. Story-guide + `guideTopics.ts` gain a "Widgets" topic (drift test).

## Decisions for the user

1. Start with declarative widgets (A), no author HTML? **Recommended: yes.**
2. First kinds: board (arcs), meters, clock, clues, map? **Recommended: yes**; others on demand.
3. Sandboxed author HTML (B): keep it as a seed, built only on a real need, off by default when built?
   **Recommended: yes.**
4. One Adolion pilot widget (an arcs board) via v2.8 02? **Recommended: yes.** The campaign content stays unseen by
   you; a second model reviews it.
5. Build position: v2.8, after 18 (visible qualities). **Recommended: yes.**

## Links

v2.7 06 (panel framework, per-story toggles, roll store), v2.8 04 (player panels), v2.8 18 (public qualities, checks),
v2.8 20 (relationship meters stay author-only), v2.8 02 (campaign pilot), `.claude/rules/architecture.md` (two personas,
spoiler checklist).
