# Plan 04 — Remaining builds

**Status: DRAFT 2026-09-30, awaiting user approval.** Each item keeps its source plan's conditions, and nothing is
built before its measurement where the source plan requires one.

## Items

| # | Item | Source | State | Blocked on | Effort |
|---|---|---|---|---|---|
| H | **Harness routing: build H1–H4 + Phase A** | v2.5 plan 13 | Phase 0 only (opencode PASS P0-2/P0-3/H-N1; P0-7 FAIL on hosts; P0-4/P0-5 unresolved; Claude/Codex NOT RUN) | user: `claude`/`codex` login refresh; B1–B5 (Q8/Q9/Q1–Q3) | L |
| L7 | Lore contradiction: runtime + R4–R6 | v2.5 plan 08 | Phase A only | v2.6 02 D7 data | L |
| J3 | House rules: judge-on arm ×2; J6a player intent (B8 order) | v2.5 plan 06 | on arm failed 4/4 (timeouts); J6a not started | `f972e24d` proven (v2.6 01); B7, B8, B9 | M |
| C1r | NPC reply residual: a non-streaming reply or late headers land in the switched-to chat | v2.5 plan 02 | not covered | fixture first; the stop is built only if the reply is shown landing | M |
| C3/C4 | `/cp activate` applies only the target's effects (old scenario and scene entry stay); C4's pass rule vs shared genre text | plan 14 | open, design call | user design call | M |
| C12/C13 | onEnter replies bury the gating reply (caps SP1/SP2); guidance secrets reach every drafted member | lab findings | documented | design call; informed by v2.6 03 SP1/SP2/SP9 | M |
| A4/A5 | CC `promptManager` buckets; the "which route answered" routed half | v2.5 plan 07 | A4 never run; A5 waits on H4 | H | M |
| A1 | Per-message inspector: the author-view click-through from a timeline chip (overview W18) | v2.5 plan 07 | not built | 08's composer | M |
| S | **Sprite / VN stage**: plan doc, gates, a settings home, capability probe | uncommitted work | code on disk, no doc | overview step 0 | M |
| B17 | `loreExclusive` author-only; wizard keeps `exclusive` | v2.5 plan 08 | bug open | B17 | S |
| G | Group→story binding UI | plan 17 | none | — | S |
| T4 | React 19 types, eslint 9, `npm audit` | v2.5 plan 03 | blocked on shared `node_modules` | A6 | M |
| SP7.b | Chance gates into prod, first of the `.b` builds (overview W17) | v2.6 03 | — | SP7 D4/D4b | S |
| SP*.b | Every other spike whose Adolion worth review says include | v2.6 03 | — | v2.6 03 | per spike |
| TL | Inline timeline | v2.6 08 | own plan | — | — |

## Order

1. S, B17 and G: small, and needed before v2.6 09 exercises them.
2. J3 and C1r, once v2.6 01 has proven their prerequisite fixes.
3. H in parallel as soon as the logins are refreshed. Phase A is long lane time, so batch it with v2.6 01's batch B.
4. L7 after v2.6 02's data; A1 after 08's composer.
5. The `.b` builds as v2.6 03 emits them.

## Gate

Each item gets its source plan's code gate, plus ×1 live here. Its ×2 is in plan 10.

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Who designs C3/C4/C12/C13? | **The build agent writes a design section in this plan** with options, evidence and a recommendation. The user reviews it in the file-by-file pass. Nothing is built before that review. | The user owns the design calls, but a blank question costs them more than reviewing a concrete proposal. |
| One surface or two for "what happened at this message"? | Moved to the overview as **Q6**. | It is a user decision. |

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Who designs C3/C4/C12/C13? | **The build agent writes a design section in this plan**: options, evidence and a recommendation. The user reviews it in the file-by-file pass. Nothing is built before that review. | The user owns the design calls, but a blank question costs them more than reviewing a concrete proposal. |
| One surface or two for "what happened at this message"? | **Two surfaces over one data source** (overview W18). The timeline is the in-chat view; A1 is its author-view click-through. | User. |

## Unresolved questions

None.
