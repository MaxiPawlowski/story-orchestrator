# Plan 01 — Judgment backend + director hybrid

## Objective

Put a judgment model (TypeSafe Jev) behind the runtime the way the memory LLM is: one transport,
one settings home, one self-test, one journal kind, one fallback discipline. Then prove it on the
one reply-path decision where the spike showed a quality win: speaker direction. The hybrid scored
24/26 against the LLM director's 22/26, and it ignored the OOC "pick Luke" hijack that the LLM
followed.

## Context

- Spike: `../../spikes/2026-09-19-typesafe-jev/README.md` §Director, §Performance, §Gains and
  costs. Harness: `scripts/spike/typesafe/`.
  - `lib/client.mts` is the reference for request validation, retry on 429/529, and the ledger
    record shape.
  - `experiments/director.mts:53–108` holds the exact questions: a role choice, then per-candidate
    `addressed` / `reason` nouls, then a `nobody` noul. The composite is `2·addr + reason + 0.25`
    for the lead, and silence applies when `allowSilence && nobody > 0.5 && max addr < 0.5`.
- **Gap the spike hid.** The winning hybrid puts a one-line **role** next to each name, taken from
  the spike's `data/worlds.json`. Production `RosterMember` is `{id, name?}` (`engine/schema.ts:141`);
  `story_role_<id>` resolves to the name (`runtime/macros.ts:27`). With names only, Jev scored 19/26,
  *below* the LLM director. So this plan adds an authored role, and it measures the names-only
  hybrid before anything relies on it (overview rule 2).
- Reuse:
  - `stHost/vectors.ts`: fetch to an ST server route with `getRequestHeaders()`, so CSRF passes.
  - `runtime/settingsStore.ts`: `GlobalSettings`, `sanitizeGlobalSettings`, and the off-by-default
    pattern of `defaultStagecraftSettings`.
  - The memory-model self-test in `src/index.tsx` (`#so-self-test`).
  - `runtime/talkControl.ts`: `computeDecision` → `runDirector` → `chooseFallback`, with the
    chat-scoped decision key.
  - `runtime/journal.ts`: `JournalRecordKind`.
  - The J8 fetch wrapper.
- Host facts, verified 2026-09-19 in ST source:

| Fact | Source |
|---|---|
| Plugins live in `<ST root>/plugins/<dir>/`. The loader tries `package.json` `main`, then `index.js` / `index.cjs` / `index.mjs`. It requires `info {id, name, description}` (strings) and `init(router)`, and `exit()` is optional | `src/plugin-loader.js:150–228`, `src/server-main.js:312` |
| `plugins/package.json` is `"type": "commonjs"`, so the plugin ships **its own** `package.json` with `"type": "module"` and `main: "index.mjs"` | `plugins/package.json` |
| Plugin id must match `/^[a-z0-9_-]+$/`. Routes mount at `/api/plugins/<id>` | `plugin-loader.js:167`, `:222` |
| Plugin routes mount **after** `setUserDataMiddleware` (`:164`), CSRF (`:202`) and `requireLoginMiddleware` (`:248`). `request.user.directories` exists, and the client must send `getRequestHeaders()` | `src/server-main.js` |
| `enableServerPlugins` is off in this install | `config.yaml:22` |
| The secrets store accepts any key (`SecretManager.writeSecret` creates the array). `readSecret(directories, key)` returns the active value. The client `writeSecret(key, value)` posts to `/api/secrets/write`, and a non-exportable key is never readable back unless `allowKeysExposure` is set | `src/endpoints/secrets.js:204`, `:268`, `:448`, `:511`, `:568`; `public/scripts/secrets.js:349` |

- Consumed: v2.1 plans 01–08. Regression floor: J5 (group direction) with the judge off **and**
  on, and J3.3 (player clean).

## Scope

In:
- ST server plugin (proxy).
- `stHost/judge.ts`.
- Pure `src/judge/`.
- Settings, panel and self-test.
- `so-judge` tooling, calibration fixtures, the `judge` journal kind.
- Authored `roster[].role`.
- Director hybrid.
- J11.

Non-goals:
- Any other consumer (plans 02–07).
- Changes to the LLM director prompt or the rules chooser, beyond the ordering below.
- A direct-from-browser path: keys stay server-side.

## Deliverables

### Server plugin

`server-plugin/story-orchestrator-judge/{package.json, index.mjs}`, in this repo. `npm run
plugin:install` copies it into `<ST root>/plugins/story-orchestrator-judge`. Derive the ST root
(five levels up from the extension); never hard-code it. The plugin exports `info {id:
"story-orchestrator-judge", name, description}`, `init(router)` and `exit()`.

Routes:
- `GET /status` → `{configured, model, pluginVersion}`. Never the key.
- `POST /systemone` `{state, questions, model?}` forwards to
  `https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer <key>`.
  - Validation is the spike client's: choice 2–255 options, score 2–10 levels, noul criteria only
    `true`/`false`, request ≤ 140k chars.
  - Upstream 401/422/429/529 pass through with the upstream body.
  - A 10 s upstream timeout returns 504. 429/529 get one retry with backoff.

Key resolution, in order:
1. The ST secret `typesafe_api_key`, via `readSecret(request.user.directories, …)`, imported from
   `../../src/endpoints/secrets.js`.
2. The env var `TYPESAFE_API_KEY`.
3. `~/.typesafe/api-key/.env` (dev; it's where the spike reads).

A missing key returns `409 {configured: false}`, never a 500.

### Host seam: `src/services/stHost/judge.ts`

- `judgeStatus()`.
- `judgeAsk(request, {timeoutMs})`, with an AbortController.
- `writeJudgeSecret(value)`, through ST's client `writeSecret`. Vendor its type in `hostTypes.ts`
  with its file:line.

A 404 on `/status` means the plugin is not installed. The seam then returns `JudgeUnavailable`,
caches that for the session, and re-probes when settings change.

### Pure core: `src/judge/` (alias `@judge`)

Register the alias in `tsconfig` paths + `include`, the webpack alias and the `lint` script.
`architecture.test.ts` gains two guards: no host import under `src/judge/`, and no `@judge` import
under `src/engine/`.

- `types.ts`: the question/answer union, mirroring the API. `JudgeCallRecord {use, model,
  latencyMs, stateChars, questionCount, answers, fallback?}`.
- `questions.ts`: `choice()`, `noul()`, `score()`, `withNoMatch()`, and backticked state
  references.
- `client.ts`: `askJudge(transport, request, {use, timeoutMs})` validates, hashes the request for a
  per-session cache, and returns the answers plus the record. The transport is injected, so it is
  testable.
- `policy.ts`: every threshold in one object. This plan adds `DIRECTOR_ROLE_CONFIDENCE = 0.6`,
  `DIRECTOR_LEAD_BONUS = 0.25`, `DIRECTOR_SILENCE = {nobody: 0.5, maxAddressed: 0.5}` and
  `DIRECTOR_TIMEOUT_MS = 1500`. Plans 02–07 add theirs here.
- `director.ts`:
  - `buildDirectorQuestions(input)` is the spike's hybrid as one fan-out call: a role choice over
    candidates (option descriptions are the roles; "nobody" joins when `allowSilence`), plus a
    per-candidate `addressed` / `reason` noul and a `nobody` noul.
  - `decideDirector(answers, input)`: use the role choice when its confidence is
    ≥ `DIRECTOR_ROLE_CONFIDENCE`. Otherwise use the composite. Otherwise return `null`.
  - The **state has the spike's measured shape** (`director.mts:85–89`): `{scene: {name, goal,
    author_guidance?}, player: <persona name>, transcript: [{speaker, text}]}`, where
    `author_guidance` carries the authored `director.instruction`.
  - Question and criteria text is taken verbatim from `director.mts:53–65`. A state or wording
    change is a new question under overview rule 2: re-measure it on the director fixtures before
    shipping it.

### Authored roles

Format 2 gets `roster[].role?: string`: one line on what the member does in the story (for
example, "the guild quartermaster who pays for the relic").

| Where | Change |
|---|---|
| `engine/schema.ts`, `validate.ts` | Trimmed, ≤ 160 chars, warning over the limit |
| Studio **Roster** tab | A field |
| `mutations.ts` / copilot ops | `addRosterMember` / `updateRosterMember` carry `role` |
| Wizard | The card step proposes a role line alongside the card it creates. It is written by the local memory LLM and reviewed on the provisioning card. No card text is ever sent to the judge; only the reviewed role line is |
| `storyDiff.ts` | A role edit is **compatible** (hot-swap) |
| Diagnostics | `talk-judge-needs-role`: a warning on a checkpoint whose `talk_control` has candidates without a role, shown only when the story is otherwise judge-eligible |

### Names-only measurement (before build)

Extend `experiments/director.mts` with a names-only hybrid variant: the choice with no role lines,
and a composite with `who = name`. Record it in the Gate record.

- If the names-only hybrid is ≥ 22/26 (parity with the LLM director), the judge director runs on
  every story.
- Otherwise the judge director runs only when every candidate in the pool has a role, and stories
  without roles keep today's chain.

**Measured 2026-09-19** (`run.mts --only director`, `jev-1.13.0`; the original requests replayed
from cache, and the names-only composite was a new request): names-only composite **17/26**,
names-only hybrid **21/26**. That is below the 22/26 floor and below the LLM director (22/26). So
**the judge director requires a role on every candidate in the pool**; otherwise the turn takes
today's chain, and the call ring records `fallback: "no-roles"`.

### Settings (`GlobalSettings.judge`)

`{enabled: false, model: "jev-1.13.0", timeoutMs: 1500, uses: {…every flag in overview rule 4,
all false}}`, sanitized. No per-chat overrides.
- This plan lands the **whole** `uses` map and its sanitizer, so later plans only wire a consumer to
  an existing flag.
- A flag whose consumer is not built yet is hidden in the panel, not shown disabled.
- **Nothing ever defaults to `true`**, now or after acceptance (overview rule 4, user decision
  2026-09-19). The sanitizer test asserts that `defaultGlobalSettings().judge` has every usage off.

The panel group **"Judgment model"** in `src/index.tsx` holds:
- A status line: plugin reachable / key set / model.
- `#so-judge-key`, which writes through `writeJudgeSecret` and clears itself. The value is never
  displayed or stored client-side.
- `#so-judge-enabled` (master), then one checkbox per built usage, `#so-judge-use-<kebab-key>`.
  This plan builds `#so-judge-use-director`.
  - Each usage row carries a one-line description plus what that usage sends (from its plan's
    "Leaves the machine" table).
  - A usage whose dependency is off is disabled, with the reason inline.
- `#so-judge-self-test` ("Test judgment model"): runs the calibration set of every **enabled**
  usage in the page, and shows accuracy + p50 latency per usage.
- One privacy sentence: what leaves the machine (overview §Cost and privacy envelope).

When `enabled` but unavailable, `pipeline.detail` says so (author-grade); `pipeline.text` does not.

### Call ring (overview rule 1)

- New per-chat slice `extras.judge {calls: JudgeCallRecord[]}`, cap 300. It stores compact records
  only: `{at, boundary, messageId, use, model, latencyMs, stateChars, questionCount, fallback?,
  p}`, where `p` holds the probabilities the policy used, not the whole answer.
  - Sanitizer default `[]` in `runtime/extras.ts`, so older chats hydrate unchanged (v2.1 rule 6).
  - A mutation rollback drops records past the rollback point.
- `buildSessionJournal` derives a `judge` event per record at read time, the same way it derives
  audits and talk decisions. `JournalRecordKind` and `extras.journal` (cap 200, player ⚑ flags)
  are **not** touched.
- `TalkDecisionSource` gains `"judge"`, and `TalkDecisionAudit` gains `judge?: {confidence, p,
  fallback?}`. The drawer's talk-decision rows (author view) show the source as today.

### Director consumer

`runtime/talkControl.ts`: `TalkControlHost` gains `judgeDirector?`. With `judge.uses.director` on,
`computeDecision` runs in this order:
1. Candidates, unchanged.
2. **Judge**, over the full candidate pool plus the window, within `DIRECTOR_TIMEOUT_MS`. The
   mention rule no longer short-circuits. The spike showed it is wrong whenever a name is mentioned
   but not addressed; it stays as step 3's first rung.
3. On `null`, timeout or error: today's chain exactly (mention → LLM director if authored → rules).
   With the flag off, the code path is byte-for-byte today's.

`no_repeat` keeps binding only the rules pick. `allow_silence` gates the "nobody" option. The
chat-scoped decision key and the wrapper-finished reconcile are untouched. The judge runs whenever
the flag is on and `talk_control` is active, whether or not the checkpoint authored `director`: the
flag is the opt-in.

### Tooling

`scripts/debug/so-judge.mts status | ask <json-file> | calibrate [--use director] [--min 0.85]
[--record]`:
- `calibrate` runs `test/fixtures/judge/<use>.json` through the real plugin, from the page, so the
  whole path is under test. It prints per-case rows and accuracy.
- `--record` writes `test/goldens/judge/<use>.json` for jest.

Fixtures promoted from the spike: `director.json` = D01–D26 with roles, plus a Spanish slice of ≥ 6
new cases.

`so-scenario` gains `expect: {talkDecision: {source}}` and a `judgeCalls` counter on the existing
fetch wrapper (`/api/plugins/story-orchestrator-judge/`).

### J11 judgment-backend

`test/journeys/j11-judgment-backend.journey.json`, added to `test-plan.md` with its checks and a
spoiler-sweep row:

| Check | What |
|---|---|
| J11.1 | Plugin status. `not-runnable`, with the reason, when `enableServerPlugins` is off |
| J11.2 | Judge off → group turn → source ∈ {mention, director, rules, fallback}, `judgeCalls = 0` |
| J11.3 | Judge on + director use → group turn → source `judge`, latency < 1500 ms, the `extras.judge` record carries the model id, and `extras.journal` gained no row |
| J11.4 | `timeoutMs = 1` → today's chain decides, the record has `fallback: "timeout"`, play unaffected |
| J11.5 | `assert-player-clean` finds nothing judge-related in player mode |
| J11.6 | Settings survive reload. The key never appears in `extensionSettings`, `chat_metadata` or any `.debug` artifact |

Exports: `askJudge` + the question helpers + `policy.ts`, the fallback discipline (overview rule 1),
`so-judge`, the calibration fixture/golden layout, `roster[].role`, J11.

## Implementation notes

- The judge host is built in `runtime/index.ts`, next to `callDirector`, as a small
  `runtime/judge.ts`: settings read, availability cache, the call-ring write, transport. It is
  injected into `TalkController`. The `extras.judge` slice is reached through injected
  accessors, the coordinator pattern, so `runtimeManager.ts` gains at most the slice wiring,
  paid for elsewhere (v2.1 rule 3).
- The mention rule matches any word of a candidate's name (`talk/rules.ts` `narrowByMention`).
  With the lead fix of 2026-09-19, a lead named "Adolion Narrator" is picked by any line saying
  "narrator". With the judge on, the mention no longer short-circuits, which removes that
  exposure.
- Take the questions and composite from `experiments/director.mts` verbatim; do not re-derive them.
  Golden answers keep jest deterministic, and `calibrate` is the live check.
- The plugin is plain Node ESM with no dependencies. Importing `src/endpoints/secrets.js` couples
  it to ST's internals. If a future ST moves that file, the env/`.env` rungs keep the plugin
  working; `/status` reports which rung supplied the key (`keySource`, never the key).
- `enableServerPlugins: true` was approved by the user on 2026-09-19. This plan flips it in ST's
  `config.yaml` when it installs the plugin. Before the restart that makes it take effect, message
  the other sessions sharing the ST install, because a restart drops their page and any running
  journey. The Gate record states that it was on.

## Leaves the machine

| Question | Data sent |
|---|---|
| Director | Last 8 chat messages with speaker names; candidate names + roles; story title; checkpoint name, objective, guidance; authored director instruction |

## Validation gate

Harness:
- `npm run typecheck && npm run lint && npm test && npm run build`.
- `architecture.test.ts` with the two new guards.
- Jest over `test/goldens/judge/director.json`.
- Storybook for the Roster role field and the settings group.

Live (fresh-start, headed, real memory LLM for the fallback chain):
- **J11 twice**.
- `so-judge calibrate --use director --min 0.85`. The spike hybrid scored 0.92; the floor absorbs
  the measured repeat-flip rate of 5/118.
- J5 with the judge off and on, both clean.
- J2 (the Roster role authored through the Studio).
- J3.3 player sweep.

If the plugin cannot be enabled on the machine, the gate is not green, and the handover says so.

## Persona tags

| Element | Tag |
|---|---|
| Settings group, self-test | `both` |
| Roster role field, `talk-judge-needs-role` diagnostic | `author` |
| Talk-decision source rows | `author` (existing panel) |

## Delegated decisions

- Whether `plugin:install` symlinks or copies. Copying is safer on Windows.
- Cache TTL for identical requests within a session. The spike used a content hash with no expiry.
- Exact status wording in `pipeline.detail`.
- Role text limit (160 proposed).

## Unresolved questions

- Should stories imported without roles get a one-time "suggest roles" pass? It would use the
  local memory LLM over each card, with the author reviewing per member. Proposed: yes, as a
  wizard "Fix with wizard" item, not automatically.
