# obsidian-leaflet — v2.8 27 review (tier 2)
meta: https://github.com/javalent/obsidian-leaflet · clone `C:\dev\st-extensions-research\gamification\obsidian-leaflet\source` @ `a26e36b` (2025-07-09) ·
★ 714 · downloads 315k · licence **no LICENSE file in the repo**; `package.json:14` declares `"license": "MIT"` (both
recorded; without the file the MIT grant text and copyright notice are absent) · files read: `types/{marker,main}.d.ts`,
`src/layer/marker.ts`, `src/controls/filter.ts`, `src/renderer/renderer.ts`, `src/map/map.ts`, `src/main.ts`,
`src/utils/watcher.ts`

## What it is
Leaflet maps inside Obsidian notes: real-world tiles or a custom image as the map, markers, overlays, drawn shapes. A
code block declares the map; markers come from three sources (the block, notes' frontmatter, user clicks). The relevant
part for us is image maps + marker visibility rules, as prior art for a map panel nobody has planned yet.

## How it works
- **Map declared by block parameters** (`types/main.d.ts:23-80`): `image` (one or several layers), `marker` list,
  `markerFile`/`markerTag` (pull markers from notes), `filterTag`, `linksTo`, `lock`, bounds.
- **Marker shape** (`types/marker.d.ts:13-27`): `{id, type, loc, percent, link, layer, mutable, command, description,
  minZoom?, maxZoom?, tooltip?}`. `percent` places a marker relative to the image, so it survives an image resize.
- **Three marker origins, two stores:** block-declared markers are immutable and re-read on render
  (`renderer.ts:662-681`); frontmatter `location`/`mapmarkers` on notes become markers through a file watcher
  (`watcher.ts:61-77`, `renderer.ts:1100-1111`); user-placed markers are `mutable` and saved to plugin data, debounced
  (`main.ts:476-498`, `renderer.ts:653`).
- **Visibility is presentational only:** a marker shows inside its zoom band (`marker.ts:597-625`, re-evaluated on
  zoom, `:395-399`), and a filter control toggles marker *types* per viewer (`filter.ts:147`, `map.displaying`). There
  is no audience or reveal condition; everything declared is shown to whoever opens the note.
- Image overlays with their own bounds (`map.ts:658-662`); marker click opens the linked note (`marker.ts:107`).
- Couples to Initiative Tracker by importing its source (`src/initiative/initiative.ts:15`) — a cross-plugin source
  import, fragile.

## Overlap with Story Orchestrator
- We do better: we would gate reveal on state (`visible_when`) and audience; they have only zoom and a type filter.
- They do, we don't: any spatial view. `effects.background` is our only "place" signal; v2.7 36 lists `map` as an
  on-demand widget kind with no design.
- Philosophically opposite: user-placed mutable markers are a player write outside the boundary — refuse.

## Patterns (rubric table)
| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| image map + percent-positioned markers | data model / UI | widget | state-only | derivable | player-safe | OK | declarative | 3 | M | new plan seed (map panel) / v2.7 36 W `map` |
| marker reveal by state, not zoom | mechanic | widget, quest | state-only | derivable | spoiler risk (gate it) | OK | declarative | 4 | S | new plan seed |
| marker → "you are here" from a quality | mechanic | quality, schedule | state-only | derivable | player-safe | OK | declarative | 3 | S | new plan seed; v2.8 20 whereabouts (author view) |
| per-viewer type filter | UI | widget | state-only | per-viewer local only | player-safe | OK | needs code | 2 | S | new plan seed |
| user-placed mutable markers | anti-pattern | widget | — | unrollbackable (refuse) | — | — | — | 1 | — | no |

## Notes per pattern
**image map.** Shape for a seed plan: story `maps[]: {id, image, layers?: [{id, image, visible_when?}]}` and
`markers[]: {id, map, at: [x%, y%], label, icon (fixed list), visible_when?, link?: {quest | checkpoint}, here_when?}`.
The image is an authored asset in the story's assets (like `effects.background`), never fetched.

**reveal by state.** Their zoom band becomes a gate: a marker absent from the player projection until `visible_when`
holds (same rule as plan 36 quests: absent, not hidden DOM). Player view shows only revealed markers; author view shows
all with their gate. A marker linked to a hidden quest inherits the quest's visibility.

**"you are here".** `here_when` (or `bind: "quality:location"` with a value→marker map) puts a pin from the blackboard.
Character whereabouts (v2.8 20) may drive author-only pins; never player-visible while plan 20 keeps them private.

## Copy / Avoid
- Copy: relative (percent) coordinates, layered images, authored markers as a declarative list, marker→link.
- Avoid: viewer-placed markers persisted as state; visibility rules that are presentational only; cross-extension
  source imports; network tile layers (egress, not an authored asset).

## Licence note
Ambiguous: `package.json` says MIT but no LICENSE file exists. Patterns only; do not copy code without a licence file.

## Verdict
Relevance **low-medium** (no consumer plan yet). Take: **a map panel is a `map` widget whose markers are authored, gated
by `visible_when`, and positioned in image percent** — seed a plan only if authors ask for space.
