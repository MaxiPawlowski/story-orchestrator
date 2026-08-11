# Plan 14 — Speaker Direction (group-chat talk control upgrade)

## Objective

Give checkpoints control over WHO talks next in a group chat. ST's native activation (NATURAL talkativeness rolls / LIST / MANUAL / POOLED) knows nothing about the story; the orchestrator knows the scene. Strict-when-declared: a checkpoint with a `talk_control` block takes over speaker selection for loud group generations; everything else (swipes, continues, quiet passes, impersonate, explicit `force_chid`) passes through untouched. Also restores v1 talk-control parity lost in v2 (`speakerId` targeting → `after_member`, per-reply `enabled`) and makes the no-op `talkControlInterceptor` stub real — closing the spec-v2 L165 divergence.

## Context

- Spec §Talk Control (rewritten by this plan), §Cast model.
- Host facts: 00-overview "Verified ST host facts" rows added by this plan (interceptor contract, wrapper events, `force_chid` in GENERATION_STARTED, `this_chid` stringification, dispatch order).
- v1 reference: `stories/*.yaml` `talk_control` blocks (`speakerId`, `enabled`, probability 0–100) — unread by v2 until now.

## Scope

In: per-checkpoint `talk_control` schema + validation; pure chooser/director prompt/parse (`src/talk/`); `TalkController` runtime + real interceptor + `GROUP_WRAPPER_FINISHED` reconcile; director LLM pass over the extraction client path; npc_replies `after_member`/`enabled`; Studio `TalkControlEditor` + `NpcRepliesEditor` fields + mutations + 3 diagnostics; per-chat "Speaker direction" settings toggle; drawer Scheduler decision panel; persisted decision audit ring.
Non-goals: multi-speaker directed turns (one directed speaker per turn; extras via npc_replies); talkativeness mutation (character-card-global — never touched); auto-mode redesign.

## Deliverables

- `src/engine/schema.ts`: `TalkControl`, `TalkControlSpeaker`, `TalkControlDirector`, `Checkpoint.talk_control?`, `NpcReplyEffect.after_member?/enabled?`; `validate.ts` `readTalkControl` (speakers as objects or bare member strings, weight > 0, director boolean|{instruction}).
- `src/talk/` (pure; `@talk` alias in tsconfig/webpack/jest/storybook, added to lint + tsconfig include): `rules.ts` (`buildCandidates` — speakers∩enabled roster, id/name tolerant, deduped; `narrowByMention` — ST-style case-insensitive word match; `chooseByRules` — no_repeat default on, lead-first, weighted with injectable RNG; `findCandidate`), `prompt.ts` (`renderDirectorPrompt`), `parse.ts` (`parseDirectorResponse` — `SPEAKER: <name|NONE>`, bare-word tolerant, `stripChannelNoise`d), `types.ts`.
- `src/runtime/talkControl.ts`: `TalkController` behind `TalkControlHost` seam (built in `runtime/index.ts`, SchedulerHost pattern). Interceptor routing (`intercept(abort, type)` — acts only on type `normal`, group chat, active talk_control, no captured `force_chid`), one decision per wrapper pass (**key pinned at pass start** — mid-pass chat growth must not re-key; found live, fixed same day), silence = veto all, reconcile once per decision via `/trigger await=true` (fires after `is_group_generating` clears — verified host order). `DIRECTOR_TIMEOUT_MS` 20s, `DIRECTOR_MAX_TOKENS` 96, window 8 messages.
- Director call: `callExtractionModel` → connection-profile message-array path, same memory profile as extraction; debug global `storyOrchestratorDebugDirectorResponse` for plumbing determinism.
- stHost: `getActiveCharacterId()` (characters.ts — parses `this_chid` numeric string), typed `GROUP_WRAPPER_STARTED/FINISHED` events, `SillyTavernContext.characterId`.
- Runtime: `extras.talk { enabled (default true), decisions[] }` persisted + sanitized on hydrate (ring cap 10); `getActiveTalkControl()`, `getTalkState()`, `setTalkDirectionEnabled()`, `recordTalkDecision()`, `getActiveCheckpointInfo()`; `getActiveSpeakerId`/`rosterIdForName` made public. `fireNpcReplies` gains `speakerAliases` param (afterSpeak `after_member` match) + `enabled === false` skip. **`src/index.tsx` post-startRuntime interceptor re-stub removed** (was silently overwriting the real interceptor).
- Studio: `TalkControlEditor.tsx` (+stories, 4 interaction tests), `NpcRepliesEditor` `after_member` select + `enabled` checkbox, `setCheckpointTalkControl` mutation, diagnostics `talk-member-unknown` / `talk-lead-outside-speakers` / `talk-silence-without-director`.
- Surface: settings "Group chat → Speaker direction" toggle; drawer Scheduler "Speaker direction" panel (chosen, source, latency, per decision).

## Validation gate

typecheck + lint + jest + build + `test-storybook:ci` + live real-LLM browser gate (below).

## Gate record — 2026-07-07, ACCEPTED

Commands (all green):

- `npm run typecheck` 0; `npm run lint` 0 (src/talk added to enumeration)
- `npm test` — 47 suites / 1427 tests (new: `src/talk/talk.test.ts` 20, `src/runtime/talkControl.test.ts` 16 incl. pass-key-pinning regression, `src/runtime/effectsApplier.test.ts` 4, engine talk_control validation 2, diagnostics seeded-story exact-once)
- `npm run build` 0
- `npm run test-storybook:ci` — 20 suites / 64 tests (new TalkControlEditor 4 + CheckpointEditor ToggleTalkControl; first run failed on ambiguous `getByLabelText` regex vs HelpTooltip aria-label — switched to exact labels)

Live real-LLM gate (gemma4-mtp textgen, headed shared session, profile `Story Orchestrator Memory Local`, group "Arin, DM Narrator" 4 members, sandbox chat, test story cp1 `talk_control {director: true, allow_silence: true, no_repeat: true}` + after_member/enabled npc_replies):

- (a) "Arin, what do you make of this place?" → Arin replied; decision `source=mention, 0 ms` (no director call). PASS
- (b) ambiguous "what should we do next?" → director chose Luke (1375 ms), Luke replied. PASS
- (g) `after_member: Luke` scripted Ponticius line fired exactly once, only after Luke spoke (not after Arin/DM); `enabled: false` reply never fired. PASS
- (c) silence: real director kept choosing sensible speakers (Ponticius/DM Narrator — good judgment, wouldn't say NONE even with authored instruction); silence ENFORCEMENT (veto-all, no reconcile, `chosenName: null` audited, chat ends on user message) validated with `storyOrchestratorDebugDirectorResponse='SPEAKER: NONE'` — plumbing determinism only, real director path itself proven by 5+ live decisions. PASS
- (d) explicit `/trigger Ponticius` → Ponticius replied, decision count unchanged (force_chid respected). PASS
- (e) MANUAL strategy (`activation_strategy=2`) + ambiguous send → ST drafted nobody; reconcile `/trigger`ed the director's pick (Ponticius, 3272 ms), exactly one reply. PASS
- (f) cp2 without `talk_control` → ST NATURAL replied natively, no decision recorded. PASS
- (h) extraction coexistence: cadence reads ran throughout; manual `runExtractionNow()` real pass → audit + 1 accepted delta. PASS
- Hydration: page reload → 8 decisions + profile survived (`extras.talk` sanitize path). PASS
- Drawer Scheduler "Speaker direction" panel renders full history (screenshot `.debug/screenshots/2026-07-07T16-39-20-976Z_so-ui-state.png`); settings toggle present.
- Cleanup: story removed, chat meta wiped, `/delchat`, group `disabled_members` restored to `[Luke.png, Ponticius.png]`, strategy NATURAL, `editGroup` persisted.

Live finding fixed same day: multi-member NATURAL pass re-keyed the decision when the chosen member's reply landed mid-pass (extra director call at msg 2, double-speak risk) → decision key now pinned per wrapper pass (`PassState.key`), regression test added, re-validated live (exactly one decision per turn, 8→9).

Deviations / notes:

- Live swipe/continue regeneration not exercised end-to-end (sandbox had no multi-swipe message); covered by the type gate (`intercept` acts only on `normal`; `QUIET_WRAPPER_TYPES`) unit tests + verified host fact that swipes arrive as type `swipe` (group-chats.js:1062).
- Director choice is NOT constrained by `no_repeat` (it may re-pick the previous speaker when the scene warrants); `no_repeat` binds the deterministic rules pick only. Deliberate — the director sees the window.
- `allow_silence` is director-only (rules never choose silence) — surfaced as the `talk-silence-without-director` diagnostic.
- Drawer tab labels render vertically squished in the live ST theme — pre-existing (also visible pre-change), untouched by this plan. FIXED same day in the post-plan UI audit round (see §UI audit round below).

## UI audit round — 2026-07-07 (post-acceptance)

Sonnet subagent full-UI e2e inspection (settings panel, drawer icon + all 5 tabs, HUD, Studio all 6 tabs, mobile 390x844) → 5 findings, all fixed:

1. [broken] Drawer buttons squished to 1-char-per-line vertical columns — root cause OUR `src/styles.css` `#drawer-manager { overflow-wrap: anywhere; white-space: normal }` (both inherited) × ST core `.menu_button { width: min-content }` (style.css:3818) → min-content resolved per character. Fix: targeted `#drawer-manager .menu_button, #story-orchestrator-settings .menu_button { white-space: nowrap; overflow-wrap: normal; width: auto }`.
2. [ugly] Settings "Import and Load"/"Open Studio" word-wrapped columns (same `.menu_button` min-content, no inherited anywhere) — covered by the same rule.
3. [nit] Blackboard source column `extractor locked` → `extractor (locked)` (DrawerTabs.tsx).
4. [nit] "NPC replies" Studio section lacked a HelpTooltip (sibling "Talk control" has one) — `Section` gained optional `help` prop.
5. [nit] Copilot "Run stage" button bare `st-button` → `primary`.

Gates: typecheck 0, lint 0, jest 47/1428, build 0, `test-storybook:ci` 20/64. Live (headed, post-rebuild reload): tabs 77/91/71/82/68×28px horizontal; Memory-tab buttons 117/34/39/66×28; settings buttons 130×28 + 100×28 single-line; screenshot `.debug/screenshots/ui-fix-verify.png` (captured via raw CDP `Page.captureScreenshot` — Playwright screenshots hang on this ST instance's stuck `Noto Sans` font faces, pre-existing host issue). Everything else verified clean by the audit: drawer icon pixel-identical to native ST icons, HUD flush with send form, Studio modal sizing/scroll, mobile viewport, all empty states.
