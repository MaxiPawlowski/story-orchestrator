# Plan 23: Story widgets (story-authored UI for its mechanics)

**Status: BUILT 2026-10-10 on `v2.8-story-widgets` (deterministic tiers; see §Gate record).** Option A's first five kinds were
built in v2.7 36 (`meters`, `track`, `log`, `clock`, `board`); this branch adds `clues` and `map`, the Studio live preview,
named player intents, and option B (sandboxed author HTML, kind `html`) shaped on MCP Apps, on by default per the owner's
2026-10-10 rule (every built feature on). Was: DRAFT 2026-10-03 (user topic). Overview: `00-overview.md`. **Gate tiers:** implementation D;
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

## Prior art (2026-10)

Researched 2026-10-10 (coordinator brief, then the sources below read directly). What each one taught, what this branch
took, and what is left as a follow-up.

| Source | What it does | Taken | Follow-up |
|---|---|---|---|
| OpenAI Intelligent UI in ChatGPT (2026-10-07) | a library of native, streamable components the model arranges: buttons, forms, checklists | a small, typed catalog: two more kinds (`clues`, `map`), each a closed shape; no model chooses a layout | none: our layout is the author's, never the model's |
| OpenUI (open standard) | a deliberately small domain catalog, compact declarations, reads (`Query`) apart from writes (`Mutation`), each write validated by the server before it runs | every widget interaction is a **named intent** declared in the story (`action` on a clue or pin, `actions[]` on an HTML panel) that becomes the player's own action: its text goes in the box where they type, to send or change; it never writes story state (agency + propose-only kept) | an intent that opens a drawer tab or asks for a declared roll (plan B's other two intents) |
| OpenAI Apps SDK, "Plan components" | inline first; data tools apart from render tools; durable state on the server, ephemeral UI state in the component | the projection is the data (`runtime/widgets.ts`), the components only render it; the HTML page gets the same projection | fullscreen / picture-in-picture panel modes |
| Claude Dashboards (2026-10-08) | every number can show the query behind it; each chart shows "last refreshed" | player freshness only: a clue or pin that appeared at the last turn is marked "new" (`fresh`), computed from the boundary log so it rolls back with it | author provenance (which quality, which boundary or reply changed a value) and a player "changed N replies ago" on meters and clocks |
| Claude Motion | animation as code over text and shapes, so wording and timing stay editable | deterministic, state-diff transitions in CSS only: a meter bar eases to its new width, a clock box fills, a new clue slides in, a new pin drops; all inside `prefers-reduced-motion: no-preference`; no video | a per-story motion toggle |
| MCP Apps (SEP-1865, `io.modelcontextprotocol/ui`) | `ui://` HTML resources rendered in a sandboxed iframe, JSON-RPC over `postMessage`, predeclared templates a host can review, loggable messages, consent for tool calls, text fallback | the model for option B; see the next section | see the next section |

Sources:
- https://www.macrumors.com/2026/10/07/chatgpt-intelligent-ui/
- https://wavect.io/blog/openai-intelligent-ui-vs-openui/
- https://www.openui.com/
- https://developers.openai.com/apps-sdk/plan/components
- https://runtimewire.com/article/anthropic-claude-dashboards-motion-beta
- https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/
- https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html
- the spec draft and SDK: https://github.com/modelcontextprotocol/ext-apps (`specification/draft/apps.mdx`, package
  `@modelcontextprotocol/ext-apps`)

## MCP Apps: what option B follows and what it leaves out

Read 2026-10-10: the announcement, the API overview and the spec draft in `modelcontextprotocol/ext-apps`.

**Followed.**
- **Predeclared templates.** An HTML panel is a `widgets[]` entry of kind `html` with its whole `template` in the story, so
  it exists before anything renders: the Studio shows it in the Widgets editor with a live preview (template size, the
  view it is given, its actions, its plain version) and Diagnostics lists every one (`html-widget-declared`, info) with what
  it may put in the box. MCP Apps' prefetch-and-review step is our Studio review.
- **Sandboxed iframe, restrictive content policy by default.** `srcdoc` frame, `sandbox="allow-scripts"`, CSP
  `default-src 'none'`, inline scripts and styles only, `data:` images, `connect-src 'none'` (the spec's default policy,
  without its `'self'` entries, because we declare no domains at all), plus `form-action`, `base-uri`, `frame-src` and
  `worker-src 'none'`; `referrerPolicy="no-referrer"`.
- **JSON-RPC 2.0 over `postMessage`, a closed method set.** View → host: `ui/initialize` (request; answers
  `protocolVersion`, `hostInfo`, `hostCapabilities.intents`, `hostContext {displayMode: "inline", theme}` and the
  `widget` view), `ui/notifications/initialized`, `ui/notifications/size-changed` (clamped 40 to 800 px), and our one
  write-shaped request `story/propose-intent {id}`. Host → view: `ui/notifications/widget-data` (the view, sent when it
  changes; the spec's `ui/notifications/tool-result` in our terms) and `ui/resource-teardown` on unmount. Anything else is
  answered `-32601` and logged. A small helper (`window.storyWidget`: `ready`, `onData`, `propose`, `resize`) is injected
  before the template, so authors need no SDK.
- **Every message auditable.** Every inbound message, every data notification and every host decision goes into an
  in-memory audit ring (cap 200, `storyOrchestratorWidgetBridge.audit()`); the opening, each intent and each refusal also go
  into the session journal (kind `author`). The full ring is not persisted: a resize per render would flood the 200-row
  persisted journal.
- **Consent, narrowed.** The only write is an intent, and it never acts: its declared text goes into the box where the
  player types, refused while they are typing and paced to one per 1.5 s; the player's own Send is the consent.
- **Graceful degradation.** `source` names an ordinary widget; with "Story-made panels" off (`display.presence.htmlWidgets`),
  or after a closed page, the player gets that widget, so a story never depends on the page.

**Left out, on purpose.**
- **`allow-same-origin` and the double-iframe sandbox proxy on a separate origin.** The spec requires both for web hosts.
  We have one origin (ST's), and an extension cannot stand up a second one; a frame with `allow-same-origin` on ST's origin
  would reach the CSRF token and the chats. Instead the frame gets no same-origin grant at all, so it runs in a unique
  opaque origin: the isolation the proxy's separate origin buys, without the proxy. The cost is that the page cannot use
  storage or cookies of its own.
- **Declared network domains (`ui.csp` connect / resource domains).** Not offered: a story is a stranger's file, and a page
  that may reach a domain can report what the player has seen. Pictures go inline as `data:` URLs.
- **`tools/call`, `resources/read`, `ui/message`, `ui/update-model-context`, `ui/open-link`, `ui/download-file`,
  `ui/request-display-mode`, `sampling/createMessage`.** None is offered: the page never talks to a model, never writes
  the chat, never opens links or files, and never changes the prompt (payload invariance: widgets change nothing sent to the
  model). The two other intents plan B named ("open the drawer at X", "request a declared roll") are follow-ups.
- **Display modes (fullscreen, pip).** Our panels are already movable and resizable in the panel frame; inline only.
- **The SDK (`@modelcontextprotocol/ext-apps`).** Not used: it depends on the MCP client/core packages and zod, far over
  the bundle headroom, and we use a five-method subset. The bridge is `runtime/htmlWidget.ts` (pure, tested) and
  `components/widgets/HtmlWidgetFrame.tsx`, both in the lazy panel chunk.
- **Waiting for a teardown answer.** We post `ui/resource-teardown` and unmount; the page has nothing to save.

**Residual risk, stated.** A sandboxed frame may still navigate itself (`location.href = …`, a link, `meta refresh`), and
no frame attribute or CSP directive blocks that in current browsers, so a hostile template can make one request that carries
what it was shown (player-safe data the player has already seen). The frame counts its loads; a second load closes the page
at once, shows the plain panel and journals it (`LeavingThePageClosesIt` story). Fetch, XHR, images, fonts, frames,
workers, forms, popups, top navigation, parent access, cookies and storage are all blocked (`EscapeAttemptsAreBlocked`).

## Decisions (2026-10-10, for the user)

1. **Story-made HTML panels on by default.** Built on, per the owner's rule that every built feature ships on. The plan
   text said off by default, and the residual self-navigation channel above exists. Recommended: keep on (the data a page
   could leak is what the player already sees, and the panel closes on the first navigation); switch to off if a shared
   story arrives from someone untrusted. One install setting, `display.presence.htmlWidgets`.
2. **`roster` and `timeline` kinds** stay "on demand" (no story asks yet). Recommended: yes.
3. **Map pins on a location enum.** Built: pins by `checkpoint` (reached = on the path) or by `when` (a gate). Not built: a
   pin per enum value with "visited" memory, because the boundary log is capped at 200 and history would silently drop;
   authors use a latching bool per place. Recommended: keep.
4. **The Adolion pilot widget (an arcs board via v2.8 02)** is not part of this branch (public repo; content reviewed by a
   second model per rule 11). Recommended: run it with v2.7 38's lab copy.
5. **Follow-ups from §Prior art:** author provenance on values, player "changed N replies ago", drawer/roll intents,
   per-story motion toggle. Recommended: build provenance first (author view only, no player copy change).
