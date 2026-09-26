# v2.5 plan 09 — SP8 curator write tiers, protected spans, category digest — spike report

**Verdict: pending.** Conditions and procedures fixed here before any SP8 code or run (rule 1). The conditions are the plan's
table (`09-research-spikes.md` §SP8) and are **never retuned**. This section only fixes how each one is measured.

## What the spike builds (two install-wide flags, both default off, never flipped by this plan; the curator itself stays off by default)

**`spikes.sp8CuratorTiers` (W1–W3): per-entry tiers and protected spans, authored in the entry's own content with ST's comment macro.**

- A marker is `{{// so:auto}}`, `{{// so:protect}}` or `{{// so:end}}` (case-insensitive, spaces allowed after `//`). ST removes every
  `{{// …}}` from World Info content before the prompt: WI content goes through `substituteParams` when an entry activates
  (`public/scripts/world-info.js:5058`), the legacy engine strips `/\{\{\/\/([\s\S]*?)\}\}/` (`public/scripts/macros.js:659`) and the new
  engine registers `//` as a comment macro returning `''` (`public/scripts/macros/definitions/core-macros.js:282`). ST 7c3994196. So the
  markers cost nothing in the prompt and are authored in ST's own WI editor. `{{///}}` (the new engine's scoped comment) is never used.
- **Tier:** an entry whose content carries `{{// so:auto}}` is `auto`; every other entry is `review`. In accept mode `auto`, only ops on
  `auto` entries are accepted on the spot; every other op waits for the author exactly as in `review`. `review` and `off` are unchanged.
- **Protected span:** from a `{{// so:protect}}` to the next `{{// so:end}}`, markers included; an unclosed one protects to the end of
  the content. An op **touches** protected text when it is:
  - a `rewrite` whose new text does not contain every protected span of the current content verbatim, or that carries a marker the
    current content does not (per kind, by count);
  - a `patch` whose replaced region (the span `applyCuratorPatch` would replace) overlaps a protected span or any marker, or whose
    replacement carries any marker;
  - a `disable` of an entry that holds a protected span.
  `enable` never touches. An op that touches is **refused at plan time** (dropped with the reason, never shown as a card) **and at the
  write edge** (re-checked against the entry read at the write edge, `CuratorWriter.writeOp`; the op is marked `failed`). Invariant 6 is
  narrowed only: the scope, the allowlist and the gated-entry rule are untouched, and tiers and spans can only remove writes.

**`spikes.sp8CuratorDigest` (W4): a digest of a large book in the curator prompt.**

- Applies only when the curator's scope holds **≥ 40** entries (`DIGEST_MIN_ENTRIES`); below that the prompt is byte-identical to today.
- **Full** (content, keys, state, exactly today's rendering) for at most **16** entries (`DIGEST_FULL_LIMIT`): those whose title — the
  text before ` - ` when there is one, else the whole title — or any key of ≥ 3 characters occurs as a whole word, case-insensitive, in the
  checkpoint name + objective + canon + open threads; ranked by the number of distinct terms that hit, then list order.
- Every other entry is listed **title-only** (`#ref "title"` and `[currently off]`), grouped under an index by the title's initial letter,
  with one rule line: those may only be switched on or off. A `rewrite` or `patch` naming a title-only entry is refused at plan time.
- The spike modules (`src/stagecraft/curatorTiers.ts`, `src/stagecraft/curatorDigest.ts`) load only through a dynamic `import()` behind
  their flag and are on plan 12 D3's list with a planted static import as the negative control. The W4 live harness is dev-only
  (`liveSuite`, `__SO_DEV__`).

## Conditions and how each is measured

| # | Condition | Pass (plan, verbatim) | Procedure (fixed before the run) | Kind |
|---|---|---|---|---|
| W1 | Protected spans | jest + mutant: an op touching a protected span is refused at plan time **and** at the write edge | Entry `The Crown` = `The realm is at peace. {{// so:protect}}The king died in the winter of 402.{{// so:end}} His heir is young.` plus an unclosed-span entry. **Ten violations**: v1 rewrite dropping the span; v2 rewrite changing one word inside it; v3 patch whose region starts before and ends inside the span; v4 patch starting inside and ending after; v5 patch covering the whole span; v6 patch covering only the `{{// so:end}}` marker; v7 `disable` of `The Crown`; v8 rewrite that adds `{{// so:auto}}` to a review entry; v9 patch whose replacement carries `{{// so:protect}}`; v10 patch after an unclosed `{{// so:protect}}`. **Four controls**: c1 `enable`; c2 patch outside the span; c3 rewrite keeping the span verbatim; c4 rewrite of an entry with no marker. Plan time: each case as a real curator reply through `StagecraftCoordinator.runCuratorPass` with the flag on — pass iff 10/10 violations are dropped with the protected-text reason and 4/4 controls become cards. Write edge: each case as an accepted record injected past the plan (the author's edited card, or a replay) and written by `applyAccepted` — pass iff 10/10 end `failed` with the file unchanged and 4/4 controls are written. Flag-off control: the same ten are accepted today. **Mutants** (each must turn a W1 test red, recorded in `test/findings/mutations/v25-09-sp8.txt`): M1 no plan-time check; M2 no write-edge check; M3 overlap test made strict at the span's first character; M4 an unclosed span treated as closed. | jest, once |
| W2 | Tier routing | in `auto`, only `auto`-tier entries apply without review; others wait, 100 % | Eight entries, four carrying `{{// so:auto}}`, none protected; one curator reply proposing one op per entry (two of each kind: enable, disable, rewrite, patch), accept mode `auto`, flag on, through `runCuratorPass` then `applyAccepted`. Pass iff 4/4 auto-tier ops are `accepted` and then `applied`, and 4/4 review-tier ops stay `pending` and are not written (100 % both ways). Controls: flag off in `auto` → 8/8 accepted (today); flag on in `review` → 8/8 pending. | jest, once |
| W3 | Live safety | ≥ 20 real `curator` proposals over a book with protected spans: 0 span violations applied; share of proposals refused ≤ 0.25 (route recorded, rule 5) | `test/scenarios/live-v25-09-sp8-w3-safety.json` (helpers `test/fixtures/interop/v25-09-sp8.js`, generator `scripts/spike/v25-09/sp8-fixtures.mjs`) on a lane, sandbox group chat, real LLM. A marker-named book `SO-V25-09 Protected` (12 entries: 6 with a protected span, 3 `auto`, 3 plain) on the story's `stagecraft.lorebooks`; curator on, accept mode `auto`, `sp8CuratorTiers` on (all put back in the last step). 24 rounds of: one real turn (`send_generate`) whose line overtakes some of the book's facts, protected and not; one curator pass; accept every card still pending (the author says yes to everything); one boundary apply. **Proposal** = one op the model proposed that named an entry in scope (plan records + plan-time refusals; lines the parser drops for other reasons are not proposals). **Refused** = proposals refused for touching protected text, at plan time or at the write edge. **Violation** = an applied op whose entry, read back from the book, no longer holds every protected span it held before, checked by the fixture's own span parser (independent of `src/`), plus a final read-back of every seeded span. Pass iff proposals ≥ 20, violations = 0 and refused / proposals ≤ 0.25, in **both** runs of the series. Fewer than 20 proposals = "measured nothing": re-run with more rounds, stated here (rule 1). Route: the `curator` role's profile, logged by the arm step and in the run header. | live ×2 |
| W4 | Digest | on an Adolion-sized book (≥ 150 entries): prompt chars ≤ 40 % of the full list, and the role-calibration floors above still met | (a) jest `src/stagecraft/curatorDigest.spike.test.ts`: a 264-entry book synthesised from the size profile of the install's `Adolion World` (`test/fixtures/spikes/v25-09/adolion-world-profile.json`: per-entry title/content/key lengths and initial, no text; sha256 `90195cea…`), padded under each of the 20 curator calibration cases (`test/fixtures/role-calibration/curator.json`) with the case's own entries first. Ratio = digest prompt chars / today's prompt chars over the same entries (`buildWiCuratorPrompt`). Pass iff the **maximum** ratio over the 20 cases ≤ 0.40. (b) live: `so-role-calibration.mts run --role curator --digest-pad "Adolion World"` — the same 20 cases, each padded with the lane's real `Adolion World` (read only), prompted through the digest, parsed against every entry, refused per the title-only rule, and scored by today's `scoreCurator` rules and floors (validity ≥ 0.9, opShape ≥ 0.85, decision ≥ 0.7, `roleCalibration.ts:207`). Pass iff every floor is met in **both** runs; the run also records the real book's ratio beside (a). | jest once + live ×2 |

A PASS of W1–W3 unlocks tiers and spans; W4 is judged separately and unlocks the digest (plan).
