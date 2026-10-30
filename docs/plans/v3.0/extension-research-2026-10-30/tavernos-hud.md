# tavernos-hud — 2026-10-30 harvest

meta: https://github.com/alewwi/HUD · head `2bf687e` (75 commits, 2026-10-16..30) · **no licence file: ideas only, no code** ·
read: `prompt.js`, `prompt-en.js`, `hud-snapshot.js`, `codes.js`, `hud-block.js`, `adapt-prompt.js`, `snapshot-edits.js`,
`token-budget.js`, `index.js` 126-330 + 590-840 (fetch rewrite), `render/secrets-grid.js`, `render/look.js`/`canon.js` heads,
`render/carryover.js`/`chronicle-store.js`/`regen.js` heads, `post.md`, SECURITY.md row (CLEAR, one privacy note) · skipped: themes,
phone/music/medieval casket, pregnancy/intimacy/fertility modules, diary mood lexicons, tests · prior review: none (new) · source
identifiers and comments are Russian.

## What it is / what changed

- An in-reply state tracker. Each main reply is told to end with one `[HUD]` JSON block (scene clock/weather/mood; per present
  character outfit, lasting look, body/mind, thought, hidden subtext `D`, goals, relationships, trust 0-100, fears, exposure `Eo`;
  memory: log, mood/route history, facts, secrets with knowers/unaware/misled, Chekhov's guns; optional diary, dreams, phone, world).
- The card renders under the message; a side panel since 2026-10-29.
- Token tricks: 1-3 letter codes for keys and fixed labels, values in full words (`codes.js:1-12`); only the last HUD goes to the
  model, as a compact snapshot at the end of the request (`prompt.js:478-490`); older HUD blocks in history become a one-line
  `[HUD_SUMMARY]` (`index.js:146-282`); disabled modules leave the schema (`prompt.js:28-90`).
- "Diaries that can lie" is only a prompt clause: entries "may contradict themselves" (`prompt.js:388-391`). Nothing checks a diary
  against state.

## How it works

- **Request rewrite, not injection.** It wraps `window.fetch` and rewrites every text-generation body (`index.js:590-840`). Its
  instruction goes in as a separate system message after everything ST built, or before a trailing assistant prefill
  (`index.js:820-835`). Requests without its "ticket" (summaries, other extensions) still get history HUD blocks swapped for
  summaries (`index.js:616-660`).
- **Snapshot hygiene** (`hud-snapshot.js:96-200`):
  - The last HUD is folded to codes and empties are dropped at any depth (`вычистить`, :66-82).
  - Fields written fresh each turn (thought, expectation, subtext, diary, dreams, horoscope) are cut, and the key stays with the
    placeholder `<new this turn>` (:108-118, :190-198). Comment: with the field missing, "the model reads the snapshot as a template
    of the answer: what is absent, it does not write"; with the old text present, it copied it.
  - Chats, routes and mood histories go as tails of 3-4 lines (:118-120, :170-180), because the model was re-copying them verbatim.
- **Off-scene compaction** (`hud-snapshot.js:121-166`). With more than 3 cast, characters not named in recent text and not at the
  same location prefix lose look/outfit/thoughts/items/lines/fears. Living fields stay (place, plans, mood, relations). Returning
  characters get the full card back from history, plus a reminder to write them in full.
- **Collapsed history line** `[HUD_SUMMARY] date · time · weather | who where (common location prefix factored) | Event: last new log
  line | New: secret X → known; fired: Y` (≤2 items, `index.js:190-282`).
- **Secrets** (`prompt.js:231-242`):
  - Schema per secret: `f` fact, `lv` damage, `stt` spread, `knw[{n,src}]` with the source required, `hd[]` unaware, optional
    `wrg` "name: what they believe instead".
  - Grid: secret × person cells knows / suspects / not / wrong (`secrets-grid.js:50-60`), sorted by damage.
  - Alert: a high or critical secret, with someone in the scene who does not know or believes wrongly, shows "in the scene — not
    in front of them" (`:113-122`).
- **Propose, don't overwrite** (`snapshot-edits.js:1-15, 95-140`). When a verbal-duel concession or the conflict topic shares ≥2
  five-letter roots with a secret, it proposes "known" or "suspects" for present people. The default is ask.
  - A confirmed edit is stored per chat, keyed by a normalised secret key plus the name, and overlaid on the snapshot sent to the model.
  - A later model value that disagrees shows as a divergence; it is never silently fixed.
- **Adaptive reminder** (`adapt-prompt.js:1-110`).
  - Per chat × model, it keeps a 50-turn window of whether each required field came back empty.
  - After ≥12 observations, at most 3 fields over 30% missed get one line: "You regularly leave X empty."
  - Disabled modules are never reinforced.
- **Section cost by subtraction** (`token-budget.js:1-12`): rebuild the instruction without each section and diff, instead of
  measuring inside the builder.
- **Reasoning mask** (`hud-block.js:1-14, :38-60`). Before searching for tags, `<think>/<plan>/...` content is replaced by an
  invisible character of the same length, so match indices are valid on the raw text. Reason given: models write "[HUD]" in their
  plan, and that mention was parsed as the block.
- **Code design rule** (`codes.js:18-22`): no code has two meanings even case-insensitively, because "the model confuses similar codes".

## Patterns for SO

### P1. Author-only "who knows which secret" grid + on-stage alert — pattern · author UI / memory · partial · value 3 · effort M
- **What:** secret rows × cast columns. Cells: knows (with source), suspects, believes-false, unaware, hiding-from. A row is flagged
  when a member kept from it is present and enabled right now.
- **Theirs:** `render/secrets-grid.js:50-60, 113-122`.
- **Ours:**
  - Tags exist: knows, suspects, believes, hiding, unaware (`src/memory/epistemic.ts:16`, labels `components/drawer/tabs/MemoryPanels.tsx:7`).
  - Secrets resolve to knowers and `onlyFrom` (`src/memory/heldSecrets.ts:27-45`). Presence: `runtime/whereabouts.ts`
    `presentRosterIds`, used by `runtime/sceneCard.ts:46`.
  - What is missing: a flat tag list exists; the per-secret × per-member view and the on-stage alert do not.
- **Fit:**
  - **Author view only.** Player surfaces must stay identical with and without a held secret (architecture §Memory and privacy).
    TavernOS shows this to the player, so it spoils; we never would.
  - The alert is an `info` check or an inspector row, never `blocks`, because enforcement already happens in the per-member block.
    Its use is watching the filter live: did the reply right after a flagged turn restate it?
  - Provenance (message id) plays the part of their required `src`.
- **Sketch:** a pure `secretGrid(epistemic, heldSecrets, roster, present)` read-model on the snapshot, rendered in the author
  inspector panel (v3.0 29 decision 10). Storybook with a planted kept-out member.

### P2. Story sheet "Here now" tab from the existing scene view — feature · UI 29 · partial · value 3 · effort S
- **What:** the TavernOS per-character card, cut to what SO may show a player: who is present, portrait, public relationship
  labels, visible faction band, link to their People page.
- **Ours:**
  - `runtime/sceneCard.ts:42-64` already builds exactly this, player-safe (`knownEntities`, `holderLabelRows`, `factionVisible`).
  - It surfaces only when a story authors a `scene` widget (`runtime/widgets.ts:268`).
  - The v3.0 29 sheet tabs come from `chatPanelsShown`: Journal, Stats, Ideas, Memory (`ui-review/inchat.md` §3.3).
- **Fit:**
  - Offer the tab whenever the story has codex people or labelled relationships, not only with a widget.
  - **Never** thoughts, hidden subtext, trust numbers or outfit-from-text on it. Those come from private blocks or generated
    state, and showing them breaks "disclosure is not knowledge".
- **Sketch:** one more tab body in phase 2's shared tab set, reusing `sceneView`.

### P3. Placeholder, not stale copy, when re-feeding model output — pattern · prompts · unverified · value 2 · effort S
- **What:** when a prompt includes the model's earlier output for a field it must rewrite, keep the slot and put a "new this turn"
  marker in it. Dropping the slot makes the model skip it; leaving the old text in makes it copy (`hud-snapshot.js:108-118`).
- **Ours:** to audit. Candidates:
  - prompts that show the previous inner beat or ring (`memory/innerRender.ts` `BEAT_RING_CAP`, narrator holdings);
  - the living director re-planning with prior ops (`generation/living/prompt.ts`);
  - suggestions re-asked with their previous set.
- **Fit:** prompt-only. A change to the play path needs a blind rating (architecture §Local text backend: layout is quality-rated).
  Inner voice stays on.
- **Sketch:** grep for prompts that embed `last*`/ring text of the same field. Measure the copy rate (shared n-grams with the previous
  output) before changing anything.

### P4. Per-model field-miss stats, diagnostic only — test-idea · extraction observability · partial · value 2 · effort S
- **What:** a sliding window per route × model of which shared-read sidecars came back empty or malformed when they were due:
  knowledge lines, arcs, promises, `WITNESS`/`SPAN`, scene.
- **Theirs:** `adapt-prompt.js` auto-adds a reminder line.
- **Ours:** audits persist (`extras.extraction.audits`); the tier scorers are offline (`extraction/liveTiers.ts`). No live per-model
  miss rate.
- **Fit:**
  - **Do not copy the auto-reminder.** It makes the read prompt drift per chat, breaks replay and payload goldens, and amounts to
    silent retuning against a floor.
  - Show the rate on the author Model calls panel (`components/drawer/ModelCallsPanel.tsx`) or in `so-run-header`. A model swap
    (v3.0 07) is then visible as "skips WITNESS 40%".

### P5. Raw-offset-preserving reasoning mask — pattern · extraction/spans · partial · value 2 · effort S
- **What:** search tags and anchors on a copy where reasoning spans are blanked at the same length, so offsets index the raw text.
- **Theirs:** `hud-block.js:38-60`.
- **Ours:**
  - `extraction/parse.ts:57` `stripReasoningBlocks` strips leading blocks only, by design.
  - `windowHygiene.ts:99` `cleanMessageText` strips reasoning and collapses whitespace, so witness and promise spans index cleaned
    text, hashed consistently (`promises/impl.ts:119`, `witness/contract.ts:66`). That is fine today.
- **Fit:** only matters if a consumer ever needs raw `mes` offsets, for example a highlight drawn by `stHost/inlineMount.ts`. Record
  the trick for that day.
- **Test idea (cheap):** a window fixture with a non-leading `<think>` that quotes contract lines (`[knows] …`, a promise quote).
  Assert that nothing in it anchors or parses.

### P6. Collapsing old blocks deep in history — anti-pattern · prefix stability (13) · n/a · value 2 (as a warning)
- **Theirs:** keep N full HUDs, move the last one into the tail snapshot, turn older ones into summaries (`index.js:684-700`). Each
  turn, the block that crosses the window changes text mid-history, and the cache misses from that message on.
- **Ours:** per-turn lore moves late (`runtime/lorePlacement.ts`); prefix gate in plan 13. The one sound part of their approach
  matches ours: volatile state goes last in the request.
- **Fit:** any SO summarisation of history must summarise once, at a sealed point (chapters), never on a sliding window.

## Host facts

- Co-installation hazard. TavernOS rewrites every text-generation request through a `window.fetch` wrapper. Requests it does not own
  (other extensions, quiet summaries) still get `[HUD]` blocks replaced by `[HUD_SUMMARY]` (`index.js:616-660`).
  - SO's model calls go through ST's `/api/backends/`, so with TavernOS on, SO's reads would see rewritten history.
  - It would also add an unowned, per-turn-changing system message to play prompts.
  - Treat it like the `transcript-copiers` check: a candidate "foreign request rewriter" info row, if the owner ever installs it.
    It is not installed now.
- Models put the extension's own tag inside `<plan>`/`<thinking>` ("final [HUD] json block"). A tag search over raw text then matches
  the mention (`hud-block.js:16-22`). SO's leading-block strip covers the common case; see P5 for the rest.
- ST's server converts a mid-conversation `system` message to user for Claude/Gemini (their claim, `index.js:826-828`; not verified
  against `C:/dev/SillyTavern-MainBranch`).

## Not worth taking

- In-reply state block: it puts extraction into the play generation and its token budget, against off-path extraction
  (`ExtractionScheduler`) and thinking-on play. It also lets the play model write state.
- Short codes for keys: SO's read contract is already line-tagged and terse. The lesson "no code with two meanings" holds for any
  future tag.
- Chekhov's guns `open|building|fired`: covered by arcs open/resolved (`memory/arcs.ts`), authored patterns (v2.9 05) and echoes
  (v2.9 07). A model-judged "building" state has no consumer.
- Lying diaries: an unchecked prompt clause. Also covered by M01 (`v2.9/01-triage-sol.md:63`, v3.0, reopen on request). A diary is
  built from private blocks, so a player-facing one leaks held secrets.
- Off-scene card compaction: we draft per member, and presence-filtered ledgers are triaged as V19 (`v2.8/61-harvest-triage-2026-10-14.md:166`).
- Propose-then-confirm secret edits: our conflict queue / `commitDecision` already has the shape. Keyword-root disclosure was
  rejected in v2.9 04 ("keyword-only secret disclosure", `01-triage-sol.md:319`).
- Twist hints "a compass, not a plan; never steer toward them": the wording is nice, but v2.9 06 next actions owns suggestions.
- Appearance voting across history (`render/look.js`): v3.0 20 makes prepared packs the visual authority, and `image/prompt.ts:71`
  already says not to take clothing from the story text.
- Section cost by subtraction: `NextTurnPanel` already counts per registry block.
- Trust as a separate axis from feeling: authored relationship axes cover it (`engine/life/lines.ts:33`).

## Security notes

- No licence file: ideas only. Nothing above copies code or prompt text.
- No text addressed to AI agents found (grep for agent/Claude/Codex: only provider names in comments; `.gitignore` lists `.claude/`).
- Unsafe or invasive for an install (none of this is needed by the ideas above):
  - A global `window.fetch` wrapper rewrites every text-generation request body, other extensions' included (`index.js:590-840`).
  - `regen.js:27, 85-87, 548` copies ST's `reverse_proxy`/`proxy_password` into its own direct
    `/api/backends/chat-completions/generate` request (same-origin). It scrubs secret-looking fields from a copy it shows
    (`index.js:1521`).
  - `index.js:1351` POSTs `/api/settings/get` (the whole settings payload) to read `world_names`.
  - `lore-dialog.js:67` writes lorebooks (`/api/worldinfo/edit`).
  - `chronicle-store.js:115, 153` uploads per-chat files to `/api/files/upload`, served under `/user/files/`. `:197, :215` read other
    chats (`/api/characters/chats`, `/api/chats/get`).
- Off-localhost: music only (iTunes, NetEase via `music-api.gdstudio.xyz`, QQ via `api.vkeys.cn`, Invidious, fonau.ru, Audius,
  radio-browser). It is off by default (`settings.js:235`); once on, model-picked track names go to unofficial proxies (SECURITY.md).
- No server plugin, no remote code, no `/api/secrets` access seen.
