# TokenSavingPlugin — 2026-10-21 harvest

meta: https://github.com/cloudfox-open/TokenSavingPlugin · `pre-refresh-2026-10-21` (`9768b26`) .. `04e4555` (2026-10-15; 10 commits =
delete-all + re-upload, still labelled v1.0.3) · MIT · read: full diff, `index.js` 364–1590 (core loop, compression, FCC, hide),
2035–2550 (prefix measurement, adaptive m), README, CHANGELOG, manifest; skipped settings.html/style.css (UI only), i18n zh strings ·
prior: `docs/plans/v2.8/extension-research-2026-10-14/tokensavingplugin.md` · our plan: `docs/plans/v2.8/63-stepped-history-window.md`
· triage rows 61 H3/H3b/H3c, R56

## What it is / what changed

Same extension, same version number, `index.js` 2001 -> 2801 lines. New since the prior review:
- **Prefix measurement**: on `CHAT_COMPLETION_PROMPT_READY` / `GENERATE_AFTER_COMBINE_PROMPTS` / `CHAT_COMPLETION_SETTINGS_READY` it
  counts every prompt part that does not match a visible chat message as "prefix" (`index.js:2071-2160`), and deducts it from the window
  budget (`computeAdaptiveM`, `:2415-2482`). The old version deducted only an output reserve.
- **Editable fill target** (default 88 %) replaces the fixed coefficient (`:369`, `:1678`); per-tier presets (`:371-404`).
- Single-call block cap 32768 -> 49152 (`:45`).
- README rewritten: no longer claims the Feynman self-check, still claims "FCC append-only and never modified".
Core loop, FCC fold, `is_system` hiding, per-avatar storage and fire-and-forget triggers are unchanged.

## Do the claims hold now?

| Claim (post / README) | Code at `04e4555` | Verdict |
|---|---|---|
| Feynman self-check, fallback to original on info loss | removed (`:4-6`, CHANGELOG 1.0.3); only fallback is unhide on failure (`:1192-1196`) | false (README dropped it; post still says it) |
| FCC append-only, never modified | `foldFCC` LLM-rewrites the whole FCC when it passes `fccBudget` (`:1172-1176`), then a head-cut (`:1179-1181`); budget 525 vs summary 210 (`:414-420`), so the 3rd step folds | false, unchanged |
| Triple protection (prompt validation, hard truncation, budget folding) | block-size check (`:1040-1052`), `truncateToTokens` (`:1179`, `:1290`), `foldFCC` | true as literal mechanisms |
| Compression sends only "instruction + text", no card/WI/history (`:1418-1427` comment, CHANGELOG) | `generateQuietPrompt` is `Generate('quiet')` (ST `script.js:3084-3108`); `skipWIAN` not set, so system prompt, card, WI, AN and the last n kept rounds all ride along | false |
| 45 % -> 90 % cache hit | provider dashboard table, no A/B in repo; mechanism is the n+m -> n hysteresis, unchanged | plausible, unproven; same reason as before |
| Input lock prevents concurrent sends | disables `#send_textarea`/`#send_but` (`:939-949`); `MESSAGE_SENDING` handler `:524` still dead (no such event type) | partial; GENERATION_AFTER_COMMANDS trigger (`:510-515`) still starts a compression *after* the generation it races has started |

Net: the rewrite makes no new claim true. The only real change for us is that the window size now accounts for the non-history prompt.

## How it works (new parts only)

- Prefix = sum of request parts whose normalised text is not a visible `ctx.chat` message (or starts with its first 80 chars)
  (`:2083-2112`); fallback `total - history` on a string prompt (`:2114-2122`). Accepted only if > 50 tok and >= 50 % of the static
  estimate (`:2127`); kept 30 min (`:2187`). Quiet requests are not filtered: the compression call itself (whose instruction holds the
  whole text being compressed, which was just hidden) is measured as "prefix", so m shrinks until the next loud request overwrites it.
  In-chat depth injections also count as "prefix" though they are not a cache prefix.
- Trigger is still round-count: `totalRounds > n + m` with `m = floor(fill × (getMaxPromptTokens − prefix) / (2 × avg_last_60_msgs)) − n`
  (`:2459-2463`), tokens estimated at chars/1.5 (`:2311`). README admits 90 % "observed to just overflow": the average lags long replies.

## Patterns for SO

### P1. Stepped window — no change to the verdict (61 H3, plan 63)
The rewrite keeps the same n+m -> n hysteresis; its gain still comes from that, not the FCC. Plan 63's stateless token-mass cut
(`scripts/debug/lib/historyWindow.mts`, 63 §Recommendation B) is strictly better than their averaged round count: it cannot overshoot
on a run of long replies and recomputes after reopen/edit. **Plan 63 should not change.** A/B arms (H1) and recall (H6/H6r) remain
the deciding evidence.

### P2. Overhead from the last real request, not an estimate — pattern · plan 63 budget · our state: partial · value 2 · effort S
What: their one new idea — window budget = context − measured non-history prompt of the last loud request.
Their evidence: `index.js:2071-2160`, `:2445-2452`. Their implementation is fragile (text matching, quiet calls not excluded).
Our state: plan 63 B budget = `readPromptBudget()` minus overhead estimated by `promptCost.ts` (chars/4 fallback,
`src/runtime/promptCost.ts:1-8`). `promptBuckets` gives ST's itemised `chatHistory` vs total, but only on Chat Completion
(`src/runtime/promptBuckets.ts:85`, `notChatCompletion`); Artemis is Text Completion, so the play path has no measured overhead. The
harness already derives overhead from the fits arm (`scripts/debug/so-trim-arms.mts:268`).
Fit: if B is built, take overhead from the previous loud request of this chat: llama-server `prompt_n + cache_n` (exact, server
tokenizer; H1 already records it) minus counted kept-history rows, falling back to `promptCost`. Exclude quiet/impersonate and
side-model calls explicitly (their bug). Add to 63 as a note under B "Budget", not a new floor; H9 (horizon) already catches a wrong
overhead. Invariants: none; read-only.

### P3. Retention ladder + hooks — unchanged (61 H3c, 63 option C, deferred)
Prompt text identical in substance (`:276-301`). Nothing new.

## Player-experience lens

What the player would feel from this repo's idea is only latency on long play (faster first token once the history overflows 32K),
which is exactly plan 63 H1/H2. No prose, voice or character-distinctness mechanism here.

## For per-character polish

Nothing relevant: no post-processing of replies, no voice/style config. The compressor is per character avatar (`:1494-1517`), not per
roster member, and summarises, never rewrites a reply.

## Host facts

- `generateQuietPrompt({quietPrompt})` runs the full `Generate('quiet')` (`script.js:3084-3108`): card, WI (unless `skipWIAN`), AN and
  sent history are included. A "standalone" summary call through it is not standalone. SO's side calls go through routed profiles /
  `modelCall*`, not this, so no SO impact.
- `GENERATE_AFTER_COMBINE_PROMPTS` (`script.js:4031`, `:5243`) and `CHAT_COMPLETION_PROMPT_READY` (`script.js:4037`,
  `openai.js:1619`) also fire for quiet generations; a listener measuring "the player's prompt" must filter by type itself.
- Still true from the prior review: `hideChatMessageRange` is a real chat write (`chats.js`), `MESSAGE_SENDING` is not an event type.
No SO bug found.

## Not worth taking (new or still)

- Text-matching history detection (`isHistory`, `:2087-2099`): breaks on macros, names prefixes, edits; we have row identities on the
  interceptor copies.
- Round-count trigger from a 60-message average: overshoots; plan 63 uses token mass.
- `CHAT_CHANGED` -> `restoreHiddenMessages()` (`:495-500`) re-hides the stored index range in *any* chat of the same character (FCC
  keyed by avatar, `:1494-1509`): a live-chat write into the wrong chat. Anti-pattern; our state is per chat and index-free by design.
- Group chats: `characterId` undefined -> `saveFCC` no-ops after messages are already hidden (`:1511-1517`, `:1131`); unchanged.
- Global `openai_max_context` widening during compression (`:657-680`): unchanged install write.
