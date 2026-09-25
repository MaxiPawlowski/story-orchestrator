# Privacy report (v2.3 plan 11)

**Status: the inventory below is code-verified; the live half is NOT run.** Nothing in this file was
measured by capturing traffic in this phase — the backend was down (see §0 of the playbook). What it
does contain is the exact call-site inventory, the two places where content crosses a boundary a
reader should know about, the limits that are actually applied, and the specific captures that would
turn each claim into a measurement. Treat every §1–§4 row as "what the code sends", not "what was
observed leaving".

## 1. Three transports, and what each is

| # | transport | code | carries |
|---|---|---|---|
| **T1** | a SillyTavern **Connection Manager profile** (`extraction.profileId`, install-wide) | `stHost/connectionProfiles.ts sendConnectionProfileRequest` → `ConnectionManagerRequestService.sendRequest(...)` | **exactly one user message**: the rendered prompt. The extension attaches no chat array, no character, no persona, no history. ST then adds the profile's **preset and instruct template** (`includePreset/includeInstruct` are on), so what the provider receives is the prompt *plus the user's own configured furniture* |
| **T2** | the **judge plugin** (local ST server plugin → TypeSafe) | `stHost/judge.ts judgeTransport` → `POST /api/plugins/story-orchestrator-judge/systemone` → upstream `api.typesafe.ai` | `{state, questions, model}` and nothing else; the plugin adds only the resolved key. **All judge uses ship off** (`judge.enabled` + per-use flags, default false) |
| **T3** | **ST's own main generation** | `runtime/index.ts` (`/trigger await=true`) and `effectsApplier.fireReply` | ST's normal prompt (character card, persona, world info) **plus the injection blocks this extension installs** (`constants/injectionRegistry.ts`: pacing, memory facts, session details, short term, scene history, the speaker's private epistemic block, ledger, copilot nudge, scene tracker, continuity note) |

## 2. What never leaves, verified by inspection

| | |
|---|---|
| **The persona description** | never read. Only `getPlayerName()` enters a prompt (scene read, both director paths, the critic's cast list). `stHost/selectors.ts listPersonas` reads persona **names** for requirements checks |
| **Character card text** — description, personality, first message, example dialogue | never read. `stHost/characters.ts` reads only `character.name`. Card fields appear solely as *output* the wizard proposes and writes via `/api/characters/create` |
| **Other chats' messages** | no path reads another chat. Every window comes from `getContext().chat` via `extraction/chatWindow.ts getChatWindow`, which drops `is_system` entries and unfinished generations and keeps only `{speaker, text}` |
| **The TypeSafe key** | never reaches the page: written with ST's server-side `writeSecret`, resolved server-side from ST secrets → env → `~/.typesafe/api-key/.env`. No request body carries it |
| **Judge payloads beyond `{state, questions, model}`** | the transport sends that object and no attachment; the judge's own per-use question builders are the only source of `state` |

## 3. Two crossings a reader should know about

Neither is a defect; both are consequences of features that were asked for, and both should be in a
privacy claim rather than behind it.

1. **The epistemic pass sends the private map to the extraction profile** (`memory/contract.ts
   buildEpistemicPassPrompt`): the "do not repeat" block contains the **existing entries verbatim,
   including `[hiding]`** — i.e. who is hiding what from whom. It goes to the user's own configured
   model (T1), never to the judge: `memoryVerify`, the warden, the critic and the curator payloads
   contain no private block. The speaker's private block also rides T3, which is the feature.
   `PRIVATE_TAGS` filters *which tags render into the speaker's block* — it is a content selector,
   **not** a redaction of anything outbound, and the report says so because the name invites the
   opposite reading.
2. **The wizard's provisioning stage enumerates the install** (`copilot/prompts.ts renderStagePrompt`):
   to propose creating a card, a lorebook or a group, it sends **every character name, every lorebook
   name and every group name** on the installation, along with the full draft story JSON and the
   copilot conversation. That is a deliberate act of the authoring flow, on the author's own model,
   but it is install-wide furniture leaving the page.

Also crossing, by design: **roster names plus one-line roles and the player's name** to the judge on
`director`, `scene`, `critic` and `memoryVerify`, and the same names in the corresponding T1 prompts;
**lorebook entry text** (the story's `lore_select` allowlist only) to `lore`; the **curator's**
allowlisted entries to `curator-filter` only when the scope exceeds 12 entries; and **memory texts +
arcs + canon** to the extraction profile.

## 4. Limits that are applied, and the ones that are not

Applied: judge requests are **refused above 140 000 chars on both sides** (never truncated, so nothing
oversized is sent); `LORE_CONTENT_CHARS 600`, `LORE_CHUNK 64`, top-k ≤ 12; curator canon 1200 and entry
content 400; critic/warden **≤ 40 facts**; memory verify ≤ 64 lines per call; arc summary 5 scenes /
20 facts; canon 30 facts; canon-lite 8; typed read ≤ 250 labels; `MAX_DELTAS_PER_READ 24`; per-use
timeouts 1.5–5 s; `stHost/vectors.ts` hardcodes `source: "transformers"`, so embeddings are
**local** — memory entry texts go to ST's own `/api/vector/*`, not to a remote embedding provider.

**Not capped** (finding, and a v2.4 seed): the shared-read transcript, the window text handed to the
scene-summary/epistemic/ledger passes, the curator-filter entry content, and — the largest payload in
the extension — **`runMemorizeBacklog`, whose final pass reads messages `0 … chat.length-1`, the whole
chat history**, in one request to the extraction profile. `MAX_DELTAS_PER_READ` bounds the *response*;
nothing bounds the request on the T1 path.

## 5. What would make each claim a measurement

Ordered by what a privacy claim most needs. None of these has been run.

1. **T1 body**: capture the CMRS request and the upstream POST, proving the extension contributes one
   user message and showing what ST adds for `includePreset/includeInstruct` (J5's `st-payload`
   recorder does this today; the capture must be read, not just collected).
2. **T2 end-to-end**: capture the plugin POST *and* the plugin's own upstream body, proving
   `{state, questions, model}` and nothing else.
3. **Persona canary**: put a unique string in the persona description; run a boundary read, a scene
   read, a director decision and a critic pass; show it in no body (only the persona *name* may
   appear).
4. **Card canary**: the same for a card's description, `first_mes` and example dialogue.
5. **Cross-chat canary**: a canary in chat A's transcript with chat B open; run a cadence read,
   `memorize`, lore select and a copilot stage; show it never appears. Separately capture the
   provisioning body to show exactly what *does* cross (§3.2).
6. **Private block**: one capture showing `[hiding]` entries inside the epistemic-pass request, one
   showing the speaker block in the ST main prompt, and one each proving the verify/warden/critic
   bodies contain none of it. (J5.8 already measures the speaker block's **scope** in the captured
   payload — that half exists and is green; this adds the outbound-prompt half.)
7. **Memorize shape**: `memorize` on a long chat, showing the intermediate requests carry 8 messages
   each and the final one carries the whole history.
8. **Limits**: a lore request proving the 600-char clip and the 64-entry split; an over-140 k judge
   request proving the local refusal with no upstream POST.
9. **Vector path**: `/api/vector/insert` plus ST's embedding config, proving `transformers` (local).
10. **Key handling**: no page-originated body carrying the key; `/api/secrets/write` page→ST and the
    plugin's upstream `Authorization` header server→TypeSafe only.

## 6. Two corroborations this pass produced

- **`backgrounds` is calibration-only** (its only call site is the calibration dispatcher,
  `runtime/judge.ts`), which independently confirms the recommended-config finding that the flag has
  no consumer.
- **`sceneOoc` and `memoryRerank` appear in no call-site builder at all** — the same conclusion
  `recommended-config.md` reached by searching the settings keys.

## v2.4 addendum (plan 03 D5, 2026-09-24)

Added by v2.4 plan 03's wave-2 wiring; the v2.3 text above is left as it was measured. §4's
"**Not capped**" row changes as follows. The bound is `inputBudget = contextLimit − maxTokens − 10 %`,
the limit is the extraction profile's preset (`max_length` / `openai_max_context`) or the declared
default 8192, and counts use ST's main-API tokenizer (03-H11), so they are estimates.

| Payload (v2.3 §4 "not capped") | v2.4 | Where |
|---|---|---|
| Shared-read transcript (cadence P1, rollback/reconcile P0, manual `runNow`) | **Capped**: tail-fit to the budget, newest messages kept; the audit records `budget {contextLimit, inputBudget, tokens}` and `trimmedFrom` | `extraction/sharedRead.ts` `fitReadWindow` |
| `runMemorizeBacklog` windows (were 8 messages each) | **Capped**: packed to the budget per request (`chunkMessages`) | `extraction/backlogPlan.ts` |
| `runMemorizeBacklog` final pass (was the whole chat, `0 … length-1`) | **Capped**: tail-fit; earlier messages reach memory only through the windows | same as the shared read |
| Scene-summary window | **Capped**: the whole scene is read, but map -> reduce, every request within the budget | `memory/sceneSummary.ts` |
| Short-term compaction window | **Capped**: previous summary + the newest messages that fit | `memory/sceneSummary.ts` `fitShortTerm` |
| Epistemic / ledger pass window | Unchanged (the detecting window; bounded by the cadence window, not by tokens) | plan 03 §Risks, deliberate scope cut |
| Curator-filter entry content | Unchanged | not in plan 03 |

Manual heavy passes (Memorize chat, `/so-mem backlog`, `/cp memorize`, author `/cp expand` and "Generate
the road ahead") now state "N requests, about T tokens to <profile>" and send nothing on cancel when
N > 3 or T > 50 % of the limit. §5 item 7 ("memorize shape") is still the measurement that would make
this a claim rather than a code reading; it is plan 03 live gate 3 and has not run.

## v2.4 addendum (plan 07 part 2, T22/T23, 2026-09-25)

Captured live 2026-09-25 (bundle `d7008c958844`, see below). The two new warden families are built behind their own
default-off keys. Both ride **T2** (the judge plugin → TypeSafe), in the warden's one
call per character reply (`src/judge/warden.ts buildWardenRequests`, `WARDEN_ARM = "combined"`).

| New crossing | Key (default) | What leaves, beyond what the warden sent before | Code |
|---|---|---|---|
| **Agency check** (T22) | `judge.uses.agencyCheck` (off) | the player's **latest message** (`state.player_message`, the newest `is_user` line before the reply, cleaned by the same window hygiene) and the **persona name** (`state.player`, `getPlayerName()`), beside the reply. Before, the warden sent only the reply and the established facts (§3 above) | `stagecraftCoordinator.readPlayerLine`, `warden.ts agencyPart` |
| **House rules** (T23) | `judge.uses.houseRules` (off) | the story's **authored rule text** (`state.house_rules`, ≤ 8 rules, ≤ 240 chars each), the same class as `lore_select`'s authored entry text. No preset, no card, no persona text (C13) | `warden.ts rulesPart`, `continuity.ts wardenFamilies` |

With both on, the facts, the player line, the persona name and the rules share one request (the combined
shape the Phase A regression family measures). The persona **description** still never leaves (§2); only
the name, as the director and scene read already send.

**Per host:** one host, TypeSafe (D10: hosted routes and local Jev-likes are v2.5). TypeSafe's published
terms were not read in this pass.

**Live capture (2026-09-25).** A page fetch recorder captured every plugin body during a J8.12 run with the
continuity warden, `agencyCheck` and `houseRules` all on
(`test/journeys/records/v2.4-plan07/part2-live-d7008c958844/privacy-capture-judge-requests.json`). What it shows:

- Each body is exactly `{state, questions, model}`.
- `state` holds:
  - `established_facts`, present only once facts exist;
  - `reply {speaker, text}`;
  - `player`, the persona **name**;
  - `player_message`, the player's latest line;
  - `house_rules {rule_i}`.
- The questions are `fact:<i>`, `agency` and `rule:<i>`, all in one request.
- No persona description, card, preset, or other chat line was sent.

The inventory above is therefore now a measurement.

## v2.4 plan 08 addendum (2026-09-25)

| What | Where it goes | Where |
|---|---|---|
| Other extensions' injected prompt blocks (`extensionPrompts` entries not prefixed `story_`) | Read for the author-view next-turn preview only: key, position, depth, role, a first line (≤ 120 chars) and a token count. **Never persisted, never captured, never sent anywhere**; rendered only in author view (the player sweep forbids `[data-so="next-turn-foreign"]`). A token count on this install is a local tokenize request to the main API backend, the same one ST makes for its own counter | `stHost/promptInspector.ts readExtensionPromptBlocks`, `runtime/nextTurn.ts buildForeignRows`, `runtime/promptCost.ts` |
| Per-task model routing (`extraction.profiles`) | Each pass family's prompt goes to the Connection Manager profile the author chose for that family (T1 above, one transport per chosen profile). An unset family keeps the memory model; a chosen profile that no longer exists refuses rather than falling back | `runtime/passProfiles.ts`, `extraction/client.ts` router |
