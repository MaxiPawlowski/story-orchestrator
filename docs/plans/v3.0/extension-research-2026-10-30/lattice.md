# Lattice — 2026-10-30 harvest
meta: https://github.com/MentallyQuill/Lattice · `pre-refresh-2026-10-30` (`c0a994b`, 0.27.5, 2026-10-16) .. `aa50cc6` (0.30.3, 2026-10-28), 116 commits,
824 files, +46.9k/-14.0k · **MIT** (code reusable with notice) · SECURITY.md verdict **CAUTION** (server plugin `lattice-files` + setup ZIP).
Read: release notes 0.28.0-0.30.3, specs/plans dated 10-25..10-28 (automatic revised swipes, automatic scene context, Hermione external view,
schema recovery, chat progress meter, failure policy), `docs/reasoning-controls.md`, `src/workflow/operations/{model-json,model-retry}.js`,
`src/workflow/request-failure.js`, `src/workflow/reasoning.js` (skim), `src/ui/chat-progress.js`, diffs of `host.js`, `native-actor-context.js`,
`random-outcomes.js`, `native-story-state.js`, `prose-cleanup.js`, `reference-draft.js`, `progression.js`. Skipped: file storage / recovery / server
chooser stack (~60 % of the diff, needs the plugin or `/api/files`), Svelte UI, tests, example data, `chunk.js` beyond the header.
Prior review: `docs/plans/v2.8/extension-research-2026-10-21/lattice.md` (P1-P8; triaged as V04/V05/V13/E04/E05/G04/G05/G08/G09/G10 in
`docs/plans/v2.9/01-triage-sol.md`). `L/` = `C:/dev/st-extensions-research/lattice/source/` (read via `git show HEAD:`).

## What it is / what changed
Same node-graph workshop. The refresh is mostly plumbing: node-owned files, automatic file destinations and initialization, a recovery history,
workflow-library autosave, the optional `lattice-files` server plugin and its setup ZIP. Player-relevant changes: per-node retries with one
schema correction (0.28.1), local model-JSON syntax repair (0.29.1), per-node reasoning controls (0.29.0), a global failure policy, an opt-in
"automatically apply revised reply" and "automatically accept story changes" (both default off), a chat-side progress meter, and the author's
own live workflow moving from post-generation revision to two pre-generation calls (assessment + development) with an outward-only narrator.
Prior P1-P8 mechanics (windows/anchors, prose cleanup, outcome tables, progression caps, occurrence semantics) are unchanged apart from
file-handling arguments and import version strings (`git diff` of those files is +33/-29, all plumbing). No triage row changes verdict.

## How it works (new mechanisms)
- **Post-generation revision abandoned in their own play.** 10-25: auto revised swipes, keep branch 3 calls, revision branch 4 calls, new swipe
  selected (`L/docs/superpowers/plans/2026-10-25-automatic-revised-swipes.md`). Next day the live workflow drops it: "Post-generation
  review/revision stays removed", "Exactly two auxiliary model calls; no post-generation revision" (`L/docs/superpowers/specs/2026-10-26-automatic-scene-context-design.md`,
  plan `2026-10-26-automatic-scene-context.md` §Global constraints). Their reason is cost and latency, not measured prose quality ("These checks
  establish routing and persistence, not the prose quality").
- **Retrospective capsule vs future plan.** Assessment returns a scene record (purpose, activity, active topic, **open / answered / deferred**
  threads, background pressures, uncertainty) separately from next-turn planning fields; only the retrospective part is persisted. The stated intent:
  "stop answered or deferred topics from repeatedly taking over the story", and keep the scene's purpose apart from its current topic (same spec §Intent/§Design).
- **Source-bound derived documents.** `bindToChat`: a derived doc stores a host-computed fingerprint of the covered chat prefix (hashes, not text,
  excluding the reply being generated). Append keeps it valid; edit/swipe/delete of a covered message resets it to its initial template and it
  rebuilds from what is still available, older detail stays unknown (plan Task 2, verification record).
- **Outward-only narration** (`L/docs/superpowers/specs/2026-10-26-hermione-external-view-design.md`). The NPC's fictional inner state (emotions,
  competing wants, pressures, unspoken matters, uncertainties) is persisted but has **no wire into generation guidance**. A second call returns a
  schema-constrained portrayal object (narration mode, outward contribution, dialogue direction, observable behaviour, pacing); extra rationale fields
  are refused before generation; a zero-call formatter turns only that object into guidance. Rule text: no NPC thought reports, no motive
  explanations, no emotional labels as omniscient truth, no gestures decoded by the narrator; "No emotion owes the player a visible tell"; only a
  current explicit OOC request authorizes an interior passage, and that permission does not persist. Their own caveat: tests prove routing, not
  that prose never discloses the interior.
- **Local JSON syntax repair** (`L/src/workflow/operations/model-json.js:5-57`, `decodeModelJson` `:60-80`). After strict parse fails: drop
  trailing commas, comments outside strings, convert single-quoted strings, escape raw control chars in strings. Never completes a document,
  never infers values, never extracts a fragment from prose, never accepts two documents; size-bounded (100k units / 256 KB); one BOM and one
  whole-document fence stripped; reports `MODEL_JSON_REPAIRED` with `actualCalls: 0`; schema validation still runs after.
- **Retry budget with one correction** (`L/src/workflow/operations/model-retry.js:95-125`). `maxRetries` 0-5 (default 0) shared by transient
  failures (408/429/5xx, network codes; 500 ms then 1 s, honours `retryAfterMs` up to 30 s) and **at most one** JSON/schema correction. The
  correction is a fixed instruction (`:3-6`) plus feedback built only from a closed vocabulary: path + keyword + a message that must match a
  whitelisted pattern (`Expected at most N characters; got M.`), else the canned text (`:30-50`); the rejected completion is never echoed and
  findings never go into a system message. Second invalid completion = terminal. Truncated/unverified completions never retry.
- **Failure normalization** (`L/src/workflow/request-failure.js`): walks `cause` chains (depth 6) reading own data properties only (no getters),
  maps status, status text and network messages to retryable/terminal; provider text never leaves it.
- **Failure policy** (0.29.0 notes): global, captured per run: fall back to ST (default) | stop all generation | continue where possible (optional
  inputs dropped, required ones block consumers; failed branches cannot publish writes; a completed native reply never triggers a fallback generation).
- **Reasoning per model node** (`L/docs/reasoning-controls.md`, `L/src/workflow/reasoning.js`): provider/model/adapter rule table; applied to the
  native reply through `CHAT_COMPLETION_SETTINGS_READY` (`L/src/workflow/host.js:985, 1472`); default **None** (thinking off where optional).
- **Diagnostic history**: failure metadata kept locally by default; response text only behind a separate opt-in; never used as model input.
- **Chat progress meter** (`L/src/ui/chat-progress.js`): pixel row + percent beside the launcher, hidden at idle, 99 % cap while running, fades
  3 s after any terminal state, ignores a previous run's late events, `role=status` text "N of M stages finished, K skipped".
- **Groups are unsupported**: unified workflows refuse any chat with a `groupId` (`L/src/workflow/host.js:906`). Everything per-actor in Lattice
  is one-on-one; SO's group draft path has no Lattice counterpart.

## Patterns for SO

### P1. Outward-only narrator rule + no raw interior to the narrator — pattern · narrator prose / inner voice (54) · partial · value 3 · effort S
What: the narrator writes what the player can observe; NPC interiors reach prose only through speech and choices; "no emotion owes a visible tell".
Their evidence: Hermione external-view spec (above); raw state never wired to guidance.
Our state: the drafted member's own aims say "act on them in character; never announce them" (`src/memory/innerRender.ts:91`), good. The
**narrator** gets the cast's raw `hiding/intends/knows` rows under "use this to foreshadow; reveal nothing a character conceals unless the scene
reveals it" (`src/memory/innerRender.ts:94-96`). No rule forbids narrator thought reports, motive explanations or decoded gestures for NPCs;
`PLAYER_MIND_CLAUSE` covers only the player (`src/engine/agency.ts:26`).
Fit: one static clause appended to the narrator header and the shared steering line (stable text, so prefix-cache safe, plan 13). Does not touch
thinking or inner voice: the beat stays private to its member; this only stops the narrator voicing it. Prompt layout is quality-rated (architecture
§Local text backend): ship behind a blind rating on recorded turns, count interior-report sentences before/after as the cheap floor. Their
portrayal-object projection (second call) is not worth it; our narrator block is already filtered per scope.

### P2. "Deferred" and "answered" as thread states the prompt stops pushing — feature · memory arcs / talk pacing (19) · absent · value 3 · effort S-M
What: a topic the player answered, or explicitly put off ("later", "not now"), stops being re-raised every turn; it stays recorded and can return.
Their evidence: scene-capsule `open/answered/deferred` threads, intent "stop answered or deferred topics from repeatedly taking over".
Our state: arcs are `open | resolved` only (`src/memory/arcs.ts:22-28`), open arcs injected up to 8 (`ARC_OPEN_INJECT_LIMIT`, `:9`); 06 resurfaces
dormant threads; no player-deferral state. Repetition is handled by the warden at prompt time, not per thread.
Fit: a read line `[deferred] <arc>` matched like `[resolved]` (Jaccard, `arcs.ts:34-50`) sets `status: "deferred"`, `deferredAt`; injection skips
deferred arcs until N boundaries pass or the player's own line touches the arc again (re-open). Rollback: same message-keyed drop as resolve. Needs a
commit-guard style evidence check (player span, not an NPC saying "later"). Fits plan 19 (talk pacing) as the thread half of "don't push".

### P3. Local JSON syntax repair before refusing — pattern · model parsing · absent · value 2 · effort S
What: repair only trailing commas, comments, single quotes, raw control chars; then the full validator. Their evidence: `model-json.js:5-80`.
Our state: `normalizeJsonText` strips fences only (`src/utils/json.ts:1-7`); the living director slices first `{` to last `}` and returns `null` on
any parse error (`src/generation/living/parse.ts:37-43`), which costs a whole retry attempt (`src/generation/living/direct.ts:52-60`).
Fit: a pure `repairJson` in `src/utils/json.ts` used by `generation/parse.ts`, `living/parse.ts`, `copilot/parse.ts`; record a `repaired` flag in
the model-call row. MIT: port with notice or rewrite. Saves a director/critic attempt on the remote route; check first how often refusals are
`parse` stage (`refusalOf("parse", …)`) in recorded runs before building.

### P4. Retry feedback from a closed vocabulary — pattern · director / wizard retries · partial · value 2 · effort S
What: the corrective retry says which field failed using whitelisted message shapes, never model- or chat-derived strings, never the rejected text.
Their evidence: `model-retry.js:3-50`.
Our state: director retry echoes the issue list verbatim, "Your previous answer was refused: … Fix exactly that." (`src/generation/living/prompt.ts:99, 166`);
some issues embed model-produced strings (`'${entry.key}' already exists`, `src/generation/living/plan.ts:92`) and critic issues are free model text
(`direct.ts:74-78`). Not a privacy leak (same model, same call family) but an unbounded echo. Fit: cap each issue (length, count 16 like theirs) and
quote model strings as data; test idea: a critic issue containing an instruction does not change the next prompt's header.

### P5. Evidence for v3.0 17 (polish) — host-fact-ish / decision input · polish · planned: v3.0 17 · value 2 · effort —
Their author built conditional post-generation revision with auto new swipe (10-25) and removed it from the live workflow the next day in favour of
pre-generation steering with a fixed two-call budget. Anecdote, no rating. It supports 17's current stance (polish off unless the owner's flags ask for it)
and v2.9 02 prevention-first. Add to 17 §Inputs as one line; no build.

### P6. Progress chip that disappears — pattern · UI rework (29) HUD · partial · value 1 · effort S
Their meter: hidden at idle, 99 % cap, 3 s fade after terminal state, stale-run guard, status text with counts. Ours: `#so-hud-pipeline` chip with
`aria-busy` and a text title (`src/components/drawer/HudStrip.tsx:61-71`). Only take "hide after settle with a short fade" and the stale-run guard
if 29's HUD pass wants less standing chrome; the percent bar does not fit our pipeline (no fixed stage count).

## Already present / covered (no action)
- Source-bound derived context invalidated by a covered-prefix edit: our derived artifacts record `inputs/range` and roll back by message
  (`memory/derived.ts`, `reverseMemoryState`); chapter/canon input hashes. Present.
- Branch-state inheritance: SO classifies a branch by `main_chat` + integrity and adopts only on "Continue from here" (`src/runtime/chatIdentity.ts:73-78`). Present.
- Failure normalization, 429/Retry-After: `classifyHostFailure` + `ModelFailureKind` (`src/services/stHost/modelReply.ts:8, 81-95`), judge busy
  statuses (`stHost/judge.ts:42`), harness 429 (`stHost/harness.ts:233`). Present.
- Metadata-only diagnostic log: `ModelCallRecord` holds no prompt or response text (`src/runtime/modelCallLog.ts:8-22`). Present.
- Failure policy: side passes never block the reply by design (judge never blocks, extraction off-path). Present.
- Reasoning applied at `CHAT_COMPLETION_SETTINGS_READY`: our sampler overlay subscribes there last (`src/services/stHost/samplerOverlay.ts:35`). Present.
- Outcome tables (G04), slow-burn caps (G05), occurrence semantics (E04), holder reminders (G08), windows/anchors (V04): mechanics unchanged; triage rows stand.

## Host facts
- ST CM non-streaming errors carry no status: `ChatCompletionService.sendRequest` throws `Error(json.error?.message || 'Response not OK')`
  (`C:/dev/SillyTavern-MainBranch/public/scripts/custom-request.js:470-475`), and `response.json()` on a non-JSON body (proxy 502 HTML) throws a
  `SyntaxError` before that; streaming throws `Got response status N` (`:155-160`, `:496-501`). So any status-based retry over CM must parse the
  message; our quota regex on the message (`src/services/stHost/profileToolBridge.ts:32`) is the only workable shape. A 502 HTML page lands as a
  SyntaxError: worth one fixture asserting it classifies as `transport`, not `config` (not checked here; `classifyHostFailure` wraps causes, `modelReply.ts:88-95`).
- Lattice reports some host adapters reduce errors to the exact status text ("Bad Gateway"), hence its `STATUS_TEXT` map (`L/src/workflow/request-failure.js:4-10`). Not verified in ST source.
- "Hiding reasoning text does not disable reasoning computation" (`L/docs/reasoning-controls.md`): ST's show-thoughts toggle is display only. Matches our
  budget overlay being the only real off switch (llama.cpp).
- Lattice + SO side by side: Lattice refuses group chats (`host.js:906`), so in SO's group-only stories Lattice's unified workflow never runs; no interaction risk.

## Not worth taking
- File storage stack, recovery history, server folder chooser, setup ZIP: needs the `lattice-files` plugin or ST file APIs; unsafe (see Security) and no SO need.
- Per-node reasoning selector with default None: owner wants thinking on; per-role reasoning for DeepSeek side passes would be an owner question, not a default.
- Global failure policy "stop all generation": SO side passes must never stop a reply.
- Automatic revised swipe: new-swipe apply loses `extra.reasoning` (already rejected in v2.9 03 option D).
- Text Chunk (passage splitting with overlap): our chapter seals and compaction cover it; no player-facing gain.
- Portrayal-object second call (P1's heavy form): an extra call per turn for what a static rule mostly gets.
- "Generate from story" file initialization: wizard provisioning already owns story creation; a model-filled state doc at first use conflicts with authored truth.

## Security notes
- Verdict stays **CAUTION**. The new `server-plugin/` (`lattice-files`: arbitrary UTF-8 file read/write ≤256 KB; admin = whole disk via `browse.mjs`)
  and `assets/lattice-file-setup.zip` (launchers that run `node tools/server-setup/setup.mjs`, copy the plugin, can flip `enableServerPlugins`)
  are unsafe to install: any page script with the CSRF token could read `secrets.json`. Nothing proposed above needs them.
- Default storage writes real files through ST's `/api/files/upload|delete` and reads `/user/files/` and `/api/chats/get` (same origin). Not used by any idea here.
- Dev/test tooling references `/api/secrets/*` and `/api/users/me` in request allowlists and logs into a throwaway test ST as `default-user`
  (per SECURITY.md); not shipped browser code.
- Agent-addressed text in the repo (not acted on): plan headers say "> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development …"
  (`L/docs/superpowers/plans/2026-10-26-automatic-scene-context.md:3`, same in other plans). Docs also name the author's local paths and a `restore.py`
  command; ignored. No `AGENTS.md`/`CLAUDE.md` in the tree; `.gitignore` adds `.codex-remote-attachments/`.
- Nothing from the clone was executed, built or imported; reads were `git show`/`git diff` only. MIT: code ports need the notice (THIRD-PARTY-NOTICES), as for V04.
