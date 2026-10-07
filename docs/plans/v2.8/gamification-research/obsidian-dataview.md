# obsidian-dataview — v2.8 27 review (tier 2)
meta: https://github.com/blacksmithgu/obsidian-dataview · clone `C:\dev\st-extensions-research\gamification\obsidian-dataview\source` @ `5ad0994` (2025-04-08) ·
★ 9,379 · downloads 5.09M · licence MIT (`LICENSE.txt`, "Copyright (c) 2021 Michael Brenan"); no game content ·
files read: `src/data-model/value.ts`, `src/query/query.ts`, `src/expression/{field,context,binaryop,functions}.ts`,
`src/api/inline-api.ts`, `src/settings.ts`, `src/ui/{render,refreshable-view}.ts`, `src/data-import/inline-field.ts`

## What it is
A read-only query layer over an Obsidian vault. Notes carry typed fields (frontmatter, or inline `key:: value`); an
index rebuilds from the files; a code block holds a query (DQL) that renders a list/table/task list/calendar. A second,
separate language (DataviewJS) runs arbitrary JavaScript. The split between the two is the useful lesson for us.

## How it works
- **Typed values:** a closed literal union (bool, number, string, date, duration, link, array, object, widget, null)
  `src/data-model/value.ts:8-35`; fields come from frontmatter or inline `[key:: value]` (`inline-field.ts:116-122`).
- **Query = header + source + ordered operations** (`query.ts:115-121`): header is one of four closed view types
  (`query.ts:6`, `:43-72`); operations are WHERE/SORT/LIMIT/FLATTEN/GROUP/EXTRACT (`query.ts:75-110`).
- **Expression AST** is closed (literal, variable, list, object, binary op, function call, lambda, index, negation;
  `field.ts:11-81`), evaluated by a tree-walker returning `Result<Literal, string>`, never throwing to the page
  (`context.ts:57-102`). Null propagates through arithmetic instead of erroring (`binaryop.ts:132-136`).
- **Function whitelist:** ~70 named builtins with typed variants (`functions.ts:34` FunctionBuilder), including a
  seeded `hash(seed, text, variant)` (`functions.ts:728-736`) and `regexmatch`/`regexreplace` over author strings
  (`functions.ts:567-583`) — a ReDoS door in author content.
- **The escape hatch is gated:** DataviewJS compiles block text with `new Function` (`inline-api.ts:350`) and inline
  JS uses `eval` (`inline-api.ts:413-415`); both are **off by default** (`settings.ts:103-105`), DQL is on.
- **Read-only, recomputed:** views re-render when the index revision moves (`refreshable-view.ts:33`, 2.5 s poll,
  `settings.ts:46-47`); render recursion capped at depth 4 (`settings.ts:50`, `render.ts:86`). Values render through
  Obsidian's markdown renderer (`render.ts:22`, `:92-107`), so a field value can carry markup into the view.
- Visibility: none. Every field of every note is queryable by every block — no public/private notion at all.

## Overlap with Story Orchestrator
- We do better: per-key `public` declaration and a validator; their model has no audience, which is exactly our
  spoiler risk if `bind` were a query.
- They do, we don't: one closed AST + whitelist + `Result` evaluation; a declared view-type header.
- Philosophically opposite: they let the reader query anything; plan 36's `bind` must be a *reference*, not a query.

## Patterns (rubric table)
| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| bind as path reference, not query | authoring format | widget | state-only | derivable | player-safe | OK | declarative | 5 | S | v2.7 36 W (`bind`) |
| closed view-type header (`kind`) + closed options | authoring format | widget | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 36 W |
| evaluate to `Result`, never throw; null propagates | mechanic | gate, widget | state-only | derivable | player-safe | OK | needs code | 3 | S | v2.7 36 W validator |
| author JS / eval behind an opt-in flag | anti-pattern | widget | — | — | spoiler risk | OK | needs code | 1 | — | no |
| regex functions over author strings | anti-pattern | gate | state-only | derivable | — | OK | declarative | 1 | — | no |
| values rendered as markdown | anti-pattern | widget, journal | — | — | spoiler risk | OK | — | 1 | — | no |

## Notes per pattern
**bind as reference.** Their power (WHERE over every field, GROUP, FLATTEN) is what makes leakage unprovable. For plan
36 keep `bind` a closed, statically resolvable reference the validator can check against `display.public`:
`bind: "quality:<key>" | {qualities: [..]} | {group: "<display.group>"} | "quests" | "path" | "arcs"`. No operators,
no functions, no filters, no sort expressions. Ordering and filtering are widget `options` with enumerated values
(`options: {order: "authored" | "label", show: "all" | "nonzero"}`). Then the property test in W only has to check
that every resolved key is public.

**closed header.** Their four view types map onto our shipped `kind` list; reject unknown kinds at parse, exactly as
DQL rejects an unknown header. Per-kind options are a closed schema per kind, not a free bag.

**Result evaluation.** If any gate-like expression ends up in widgets (`visible_when`), reuse `engine/gates.ts`
semantics, not a new evaluator; a failed evaluation hides the widget for players and shows the error in author view.

## Copy / Avoid
- Copy: closed AST, function whitelist idea, `Result` instead of throws, view-type header, refresh on revision bump
  (ours: snapshot subscription), recursion cap.
- Avoid: any query/filter language in author content; regex in author expressions; an "enable JS" toggle; rendering
  author values as markdown/HTML (render text nodes only); querying keys that were not declared public.

## Licence note
MIT. Compatible with AGPL-3.0 if ever reused (keep the notice). We take patterns only; no code copied.

## Verdict
Relevance **medium-high** for plan 36. Take: **`bind` is a validator-resolvable reference to declared public keys, never
a query** — Dataview shows what the query road leads to (an off-by-default JS escape hatch and no audience model).
