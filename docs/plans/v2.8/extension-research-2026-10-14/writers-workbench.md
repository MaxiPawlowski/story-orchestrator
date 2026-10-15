# Writer's Workbench — 2026-10-14 harvest
meta: https://github.com/deiomo/Writers-Workbench · head `5ac2eb9` (bridge 0.4.0, CHANGELOG 2026-10-02) · MIT (code reusable with notice; ideas taken here) · read: README, BRIDGE.md, CHANGELOG, manifest, `index.js` (all 441), `writers-workbench.html` templates (l.430–1440), export/keys/lore settings/map prose/relationship export (l.2217–2665, 3727–3800, 4230–4258, 6381–6430); skipped: UI wiring, IndexedDB project store, PNG codec, paste parser internals, themes · prior review: none (new repo)

## What it is / what changed
Single offline HTML (8.4k lines) for writing cards + lorebooks from eight templates (main/side character, scenario, location, item, faction, history, concept), each a list of short sections with a one-line "why this matters" hint and an example placeholder. Output = XML-tagged markdown per entry (`<Name_section>`), exported as an ST lorebook / V2-V3 card. Extras: relationship graph (directed/reciprocal labelled edges → one `<relationships>` entry), room/region map maker whose layout becomes prose, paste import of free-form cards. Repo doubles as an ST extension ("Bridge") that live-syncs project entries into a named lorebook over a same-origin BroadcastChannel. No LLM anywhere.

## How it works
- Templates = static HTML sections with `data-k` fields + `.hint` paragraphs (main l.506–754, side l.778–879, scenario l.896–946, location l.970–1123, item l.1146–1210, faction l.1230–1306, history l.1326–1368, concept l.1388–1440).
- Export: `cardMd` wraps each section in `<tag_section>` (`SECTION_TAGS` l.2217, `wrapSeg` l.2250). `baseLorebookEntry` l.2605: scenario always constant, main constant by toggle, everything else keyed; ST field defaults spelled out.
- Keys: `lorebookKeys` l.2586 = name, name minus leading article, first non-stopword word; aliases appended for characters; custom keys override for location/item/faction/history/concept.
- Map → prose: `mapProse` l.3727 turns grid extent into a size band (cramped…very large, "long and narrow"), doors/windows per wall, object positions relative to an anchor, exits with direction + distance + barrier; reciprocal exits written on the destination (`writeReciprocal` l.3700).
- Bridge (`index.js`): `sanitizeEntry` l.106 whitelists ST entry fields with types, passes unknown small JSON through, counts truncations instead of cutting silently. `pushBook` l.192 matches by `wwId`, merges over the existing entry keeping `uid`/`displayIndex`, skips no-op writes (JSON compare), prunes only entries with the same `wwProject` that the project no longer has (l.254). Adopts older un-tagged exports by comment prefix `[Kind] ` (l.146, 218). Writes via `saveWorldInfo(book, data, !exists)` (cache now, disk on debounce for existing books) + `reloadEditor`. Multi-tab: `navigator.locks` leader lock so only one ST tab answers (l.408–429).

## Patterns for SO

### P1. Per-kind lore-entry content templates (location, item, faction, history, concept, scenario) — pattern · authoring guidance (guide, wizard prompt, `st-lorebook-authoring`) · our state: absent · value 4 · effort S
What: each kind has a fixed short section list with a "why" line. Highlights worth copying as guidance:
- location: vibe (senses, not mood), ways in and out, who's here and when ("decides whether characters can talk freely, fight, or be alone"), what you can do, objects, people, rules & dangers, over time (l.993–1115); world scale: "distance is the field the model most needs: it will invent travel times otherwise" (l.1074).
- item: what it does, how it's used, limits & costs, who wants it ("if nobody wants it, it's set dressing"), current state (l.1157–1200).
- faction: size & reach ("without it every group reads as a street gang or a world power"), goal + whether members believe it, methods, outsiders, rules & code, rivals/allies, current state (l.1230–1296).
- history: what really happened vs what people say happened, who was there, effect on the present ("if you can't fill this in, cut the event") (l.1326–1358).
- concept: who knows about it, definition, mechanics, limits ("a concept with no limits gets used to solve everything"), how people treat it, signs in a scene, misconceptions (l.1388–1440).
- scenario: tech level as constraints ("constraints generate scenes"), what's normal here, what happens if nobody acts (l.909–936).
Our state: guide covers lore *mechanics* only (`docs/authoring/story-guide.md:392` `lore-entries`, Part 2 items 24–27 l.~603–606); skill workflow says only "one subject per entry, self-contained and concise" (`.claude/skills/st-lorebook-authoring/SKILL.md:119`); wizard op has no content guidance (`src/copilot/prompts.ts:64-71`).
Fit: no invariant conflict. Two SO-specific edits: (a) "current state" sections are exactly what the stagecraft curator patches — tell authors to keep stable text and a short "Current state" paragraph, optionally the stable part under `{{// so:protect}}`…`{{// so:end}}`; (b) WW's "who knows about it" / "what people say happened" puts the truth in shared lore, which every drafted member reads — SO rule is the secret goes in the member's own entry / drive (guide Part 2 item 16), so the template must keep only the public version in shared lore. Also beat for places: plan 52 (codex) places; this is model-side lore, codex is player-side, no overlap.
Sketch: new guide topic `lore-content` (+ compact twin in `src/copilot/guideTopics.ts`, coverage test), one-line-per-kind rule appended to the wizard's lore op grammar, `references/patterns.md` §content in the skill. English, no campaign content.

### P2. Character behaviour prompts: triggers as "When X, they do Y", core belief chain, side-cast "why they show up" — pattern · Build a character / card review · our state: partial · value 3 · effort S
What: main card asks for behavioural triggers in condition→observable-behaviour form with a worked example (l.632), an optional belief chain core belief → protective strategy → emotional need → condition for change (l.637–641), a core contradiction (l.653), public goal vs private want ("that gap creates tension", l.506, 721), current status where/how they feel (l.523). Side cast: "Why scenes include them. If you can't answer this, cut the character" (l.817), one want, one repeatable quirk ("more useful than backstory", l.856), two voice lines.
Our state: `src/copilot/characterTutorial.ts:36-66` steps who/look/voice/first/examples/review; voice step asks for "how they act and speak, with an example of each trait"; checklist `.claude/skills/st-character-authoring/SKILL.md:91-106` ("~5 core traits, each shown by 2+ behaviours; contextual emotional triggers", "independent goals"). Drive/motive covers the private want (`story-guide.md:103`). Missing: the When-X-then-Y form, the change condition (useful input for plan 59 reconciliation / life mood), and the side-cast "function in story" test.
Fit: fine. "Wrongly believes" belongs in SO epistemic/drive, not the card when the card is shared (group "join cards" setting) — keep it out of the template.
Sketch: add the trigger form + side-cast function line to the voice step `why` text and a `warns` tutorial finding "trait without a trigger"; one checklist line in the skill.

### P3. One-writer-per-install across ST tabs (Web Locks leader) — pattern · runtime writers · our state: absent (detect-after only) · value 2 · effort M
What: `navigator.locks.request(LEADER_LOCK, {ifAvailable:true})`; non-leaders wait on the lock and take over when the leader tab closes (`index.js:408-429`). Reason given: two tabs each write the whole book from their own cache, so a stale tab undoes the other's edits.
Our state: no `navigator.locks` in `src/`; `src/runtime/chatIdentity.ts:41` only notices "another tab wrote it" after the fact and reloads; `stHost/worldInfo.ts:167` adopts a disk copy. Memory mirror, curator applies, install-wide settings delta and wizard sessions all write whole objects from the tab's cache.
Fit: one user, but owner tab + harness CDP page on :8000 is a known collision (`shared-st-browser-collisions` memory). A lock keyed `so:<chatId>` around boundary work + lorebook writes would make the second tab read-only with a Repair-style `info` row. Needs RunOwnership integration; measure first whether it ever happens (test-idea: open the same chat in two tabs on a lane, count double boundary writes).

### P4. Write only what changed; count, never silently cut — pattern · stHost writers · our state: present · value 1
`pushBook` skips JSON-equal entries and reports `truncated` (`index.js:241, 339`). SO already returns typed `WriteResult` with read-back (`src/services/stHost/worldInfo.ts:108-152`) and `changed:false` no-ops. Nothing to add.

### P5. Ownership tags on synced entries — pattern · our state: present
WW tags `wwId`/`wwProject` as extra entry fields and prunes only its own project's rows. SO: `{{// so:created …}}` stamp (`src/stagecraft/createdStamp.ts:6-27`), wizard created-asset ledger, `so-owner` mirror marker. Difference only: WW's tag is an out-of-band field (not model-visible, survives content rewrites); ours lives in content as a comment macro. No change suggested.

### P6. Location layout → prose (size band, exits with distance, reciprocal exits) — feature · places · our state: absent (map widget is player-side pins: `story-guide.md:481`) · value 2 · effort M
Deterministic text from a drawn layout; reciprocal exits keep two places from disagreeing. For SO the cheap part is guidance (P1: list exits with direction and distance, mirror them on the other place). A layout editor is out of scope; revisit only if plan 52 places grow a model-side half.

### P7. Static relationship graph view — feature · Studio · our state: absent; note doc drift · value 2 · effort M
WW: graph of labelled directed/reciprocal edges, exported as one shared entry (l.4240). SO relationships are dynamic quality axes (`story-guide.md:503`, `src/engine/lifeSchema.ts:15-22`) and private by design (feelings never public), so the shared-entry export is wrong for SO. A Studio graph over `roster[].relationships` would be authoring help only. **Drift found:** there is no Studio UI for character life at all (`setCharacterLife` is used only by the wizard tool, `src/copilot/agent/tools.ts`, `src/studio/gameMutations.ts`; no `.tsx` references it), yet `docs/plans/v2.8/51-relationship-labels.md:119` plans to extend "the Roster tab's character-life editor". Plan 51/55 need that editor built first (v2.7 37 l.417 said "No Studio editor for the life fields").

## Host facts
- `saveWorldInfo(name, data, immediately=false)` sets `worldInfoCache` first, then debounces the disk write (`public/scripts/world-info.js:4177-4190`). WW relies on the debounce for existing books, so a tab closed inside the debounce loses the edit. SO always passes `true` and reads the server copy back (`stHost/worldInfo.ts:78-85`, `65-75`): not a bug here.
- `loadWorldInfo` returns the cached object by reference (`world-info.js:2041-2043`); WW's `linkBook` mutates it in place before saving. SO also mutates `book.data` in place before save (`stHost/worldInfo.ts:132-137`) but evicts the cache on a lost write; consistent with the known gotcha, no new defect.
- `getContext().getWorldInfoNames()` exists (`st-context.js:284`, WW says added in 1.18); SO already uses it (`stHost/worldInfo.ts:26-28`).
- ST keeps unknown fields on WI entries (WW's `wwId` survives round trips per its changelog); not verified against the editor save path here.

## Not worth taking
- XML-tagged section wrapping of entry content: costs tokens; our skill already rates structured JSON/XML as too expensive (`writing-craft.md:17`).
- Key heuristic "first meaningful word of the name" (l.2586): produces exactly the surname/first-name collisions guide Part 2 item 27 warns about.
- Rough char/4 token counter: SO has real tokenization paths; a section counter adds little.
- Paste import of free-form cards / own IndexedDB project store / BroadcastChannel bridge transport: SO authors in Studio against the live install; no second editor to sync.
- NSFW/intimacy template sections: outside SO's authoring guide scope.
