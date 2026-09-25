# Plan 12 — Release and packaging

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on: overview V1 (v2.4 plan 09 closed). Independent of
plans 01/02/11 except where named: F1 is measured after plan 03's extractions; the harness plugin rows wait for plan 13's
Phase A; the uninstall inventory re-reads plan 01's normalisation ledger. Kind: build + gate. Verified against master
`e7626d7` on 2026-09-25. **Re-verify every path:line before building** (v2.4 rule 1). Δ marks drift from the research docs
(measured on `1b4e642`).

Sources: `research/prod-readiness-criteria.md` rows R, D, F1, P, U, A, Q2t, E3; `research/code-health-audit.md` H1–H3, M1,
M5, L5, §6–§7; overview §12 and every Codex addition (`research/review-codex-2026-09-25.md` PR-02..07, PR-14..18); plan 13
(`13-harness-routing.md` §H2, `server-plugin/story-orchestrator-harness`; the plugin is not on master).

## Goal

A SillyTavern user installs, runs, updates and uninstalls Story Orchestrator from a **release artifact** with no toolchain.
The artifact carries no debug surface and no dev leftovers, its data egress is disclosed from measured requests, and each of
the two optional server plugins (judge, harness) has a tested install route and a security gate. Two proofs, never one:
instrumented journeys on a **dev build**, and a black-box smoke journey on the **artifact** (Sol PR-02).

## Scope / out of scope

In scope: the packaging script and allowlist; dev/prod builds from one commit; debug surface and measurement code out of the
prod bundle; bundle budget and the Studio lazy chunk; `dist/` hygiene; one version everywhere; the served tree on the dev box
and in the artifact; user docs (install, first run, optional plugins, privacy, backup/restore, uninstall, troubleshooting,
support policy, i18n stance); both plugins' install routes and security gates; egress capture; licences/SBOM; update
mechanics; CI; a11y contrast; the `fetch` wrapper's interop check (E3).

Out of scope, with where each goes:

| Item | Goes to |
|---|---|
| S1–S8, T1–T4, E1/E2/E4, F2/F3, Q1t/Q3t (code-health guards) | plan 03 |
| Legacy removal, `schema: 1` stamp (the baseline an update is checked against) | plan 11 |
| Harness routing itself (role table, argv per CLI, floors, fallback policy) | plan 13; this plan ships and gates the plugin |
| Running the gates on the frozen candidate, the verdict | plan 10 (rows SM, FR, UN, JP, PS-J, PS-H, SV, EG, LI, BR, UP, E3) |
| Hosted judge routes (D10) | plan 06 (U2) |

## Verified current state (master `e7626d7`, 2026-09-25)

| Claim | Seen | Δ / note |
|---|---|---|
| ST loads the bundle | `manifest.json:6` `"js": "dist/index.js"`; `.gitignore:13` `/dist` | an installer clone has no bundle (H1) |
| Auto-update | `manifest.json:12` `auto_update: true`; `:11` `homePage: ""` | an update pulls sources, never rebuilds |
| ST installer takes a branch | `SillyTavern/src/endpoints/extensions.js:94,134-139` (`branch` → `clone({depth:1, branch})`) | a release branch is a viable U6 route |
| Versions | `package.json:3` 2.4.0, `manifest.json:9` 2.4.0, `dist/manifest.json` `extension.version` 2.4.0 (`dirty: true`); `CHANGELOG.md:7` top heading `## 2.3.0`; `git tag` empty | Δ research read 2.3.0 everywhere; now only the changelog lags (R4 still fails) |
| Declared minimum | `manifest.json:10` `1.18.0`; README "not played through" (`README.md:66`) | R5 open; overview V10: latest stable at release |
| Bundle | `dist/index.js` 1 831 826 B | Δ research 1 817 880 B |
| Stale `dist/` | `index.js.map` (Feb 18, 4.46 MB), `vendors-…cytoscape-dagre…js(.map)` (Nov 1 2025). `111.index.js` (Sep 24) is **not** stale: it is the current lazy dagre chunk (`index.js` calls `.e(111)`; `GraphPanel.tsx:159`); its mtime is old only because webpack does not rewrite unchanged output | `webpack.config.js:8-11` no `output.clean`, no `performance` block; `LiveReloadPlugin` in the prod plugin list (`:73`) |
| Debug surface | 22 distinct `storyOrchestrator*` names in `dist/index.js`, 13 `storyOrchestratorDebug*` (12 responses + `SelfTestResponses`) | unchanged; `storyOrchestratorJudge` is a UI channel (`src/index.tsx:187,216`) |
| UI link into plan docs | `src/components/settings/JudgeSettingsGroup.tsx:124` → `docs/plans/v2.3/recommended-config.md` | D4 open |
| Served tree | `curl` 2026-09-25, running ST: **200** for `.debug/2026-09-25T04-02-31-393Z_st-eval.json`, `docs/plans/v2.5/00-overview.md`, `dist/index.js.map`, `test/journeys/j1-first-contact.journey.json` | Δ `.debug/chromium-profile` gone (`0e1bbbe`, `scripts/debug/lib/connection.mts:18-26`); `.debug/` now 60 MB / 264 entries (was 245 MB). Default `SO_DEBUG_DIR` is still `<ext>/.debug` (`connection.mts:14`, test `connection.test.mts:29-31`) |
| Repo weight | 4 949 tracked files, pack 23.34 MiB | Δ 20.6 MiB |
| Install docs | `README.md:43` `npm ci && npm run build`; `:55` `npm run plugin:install` | developer-grade |
| Judge installer | `scripts/plugin-install.mjs` copies `package.json`+`index.mjs` (`:15`), `--check` (`:32-35`); `scripts/` is outside the allowlist | PR-03 |
| Judge plugin | forwards any non-empty `model` (`server-plugin/story-orchestrator-judge/index.mjs:151`); size check inside `validateRequest` (`:106`) runs after ST's global `bodyParser.json({limit:'500mb'})` (`SillyTavern/src/server-main.js:110`); env/dotenv key fallbacks (`:18,66-68`); `TYPESAFE_BASE_URL` redirect (`:26`); no rate/concurrency limit; routes `:160-161` | PR-05 |
| Server plugins in ST | off by default (`SillyTavern/default/config.yaml:394`, `src/plugin-loader.js:10`); auto-update applies to git plugin dirs only (`plugin-loader.js:11,238-250`) | a copied plugin never self-updates |
| Harness plugin | `server-plugin/` holds only `story-orchestrator-judge/` | plan 13 adds the second plugin |
| `test:plugin` | `package.json:33` runs the judge plugin's test only | must cover both plugins |
| CI | no `.github/` | Q2t open |
| a11y | `color-contrast` disabled for every story (`.storybook/preview.ts:25-29`) | A1 open |
| Clean-host gates | `scripts/release/clean-host.sh:19` default `typecheck,lint,test,build,release` (no storybook) | seeds §D |
| State export | `src/runtime/stateExport.ts:8-9`: clipboard, console fallback | not a backup (PR-14) |
| Library export/import | `src/studio/io.ts:4,6` (`exportDraft`/`importDraft`) | the round-trip route for BR |
| Transient vector collections | `src/runtime/consolidationMatches.ts:13` `so_consol_<ts>_<rand>`, purged in `finally` (`:40-42`) | a crash mid-pass leaves one (uninstall inventory) |
| `fetch` wrapper | `src/services/stHost/persistence.ts:92-149` (refuses an empty cross-chat save, re-wraps when displaced) | kept (V11); E3 live check owed |
| Vendored code | `vendor/smart-memory/` with its `LICENSE`; `README.md:154-158` (AGPL-3.0, Smart-Memory adaptation) | no notices file, no SBOM |

## Design

### R — the release artifact (R1–R6)

| Item | Design | Check |
|---|---|---|
| Two builds, one commit | `npm run build` = **prod** (flag off) → `dist/` + `dist/manifest.json` with `flavor: "prod"`. `npm run build:dev` = dev (flag on: debug globals, runtime handle, live suite) → `dist-dev/` + `dist-dev/manifest.json` with `flavor: "dev"` (a webpack `output.path` per flavour; `manifest.mjs` gains `--out <dir>`, today the fixed `OUT`). Source sha is identical for both. ST's `manifest.json:6` (`dist/index.js`) is unchanged; the dev flavour reaches ST only through `npm run stage --flavor dev`, which copies `dist-dev/*` into the staged `dist/`. `dist-dev/` is gitignored and never in the artifact | `test:release`: each assertion names the flavour it reads (D1, the `livereload` grep, F1, R4 and R6 read `dist/`; the D1 control and the source-sha equality read both); it refuses a `dist/manifest.json` whose `flavor` is not `prod` (negative control: a planted dev manifest in `dist/` fails) and fails if `dist-dev/manifest.json` is missing when it checks that both share `source.sha256` |
| Packaging | new `scripts/release/package.mjs`: clean prod build → stage the allowlist into `release/story-orchestrator-<version>/` → `release-manifest.json` (every file + sha256, bundle/source sha, commit, tag, both plugin versions) → zip. Refuses a dirty tree | `test:release` lists the staged tree against the allowlist (R3); negative control: a planted `docs/x.md` fails it |
| Allowlist (R3) | `scripts/release/artifact-allowlist.json`: `manifest.json`, every non-`.map` file named in `dist/manifest.json`'s emitted-file list (R6; `package.mjs` stages the `dist/` part from that list, and `test:release` fails if any chunk id referenced by the bundle has no staged file), `dist/manifest.json`, `LICENSE`, `README.md`, `CHANGELOG.md`, `THIRD-PARTY-NOTICES.md`, `examples/**`, `server-plugin/story-orchestrator-judge/{index.mjs,package.json}`, `server-plugin/story-orchestrator-harness/{index.mjs,package.json}`, `install-plugins.mjs` (if U6/JP pick it). **Never:** `docs/`, `test/`, `scripts/`, `src/`, `.claude/`, `.debug/`, `dist-dev/`, `vendor/`, `stories/`, `*.map`, `*.test.*`, `opencode.json`, `.mcp.json` | as above |
| Distribution (R1/R2) | **U6 owed.** Route A: `release` branch whose tree is exactly the staged artifact (works with ST's "Install extension" + `branch`, and `auto_update`); each release is one new commit on `release` whose parent is the previous release tip (fast-forward only; never orphan, amend or force-push — ST updates a depth-1 clone with `git pull`, `SillyTavern/src/endpoints/extensions.js:134-138,~200`); `package.mjs` (or the release step that commits the staged tree) refuses when the new commit is not a descendant of `origin/release`; negative control: a commit rebuilt from an orphan is refused. Route B: GitHub release zip only (`auto_update: false`, manual replace). Route C: both | R1: install through the chosen route on a fresh ST clone at the claimed tag, then the smoke journey (SM). R2: see UP |
| One version (R4) | `package.json` = `manifest.json` = `dist/manifest.json` `extension.version` = top `CHANGELOG.md` heading = tag `v2.5.0` = `release-manifest.json`. The acceptance candidate (plan 10 Freeze) is built with `package.json`/`manifest.json` at the final `2.5.0`, and the `v2.5.0` tag goes on that exact commit, so the attested `bundle.sha256`/`source.sha256` are the released ones; a rebuild at another version is a new candidate | `test:release`: version-field equality (without the tag) on every build; tag equality only in release mode (HEAD carries a `v*` tag, or `test:release --release`, which `package.mjs` and CI on tags pass); negative controls: a changelog heading one behind fails; `--release` on an untagged HEAD fails |
| Host support (R5) | `minimum_client_version` = the oldest ST version that ran the **full** acceptance (plan 10 CH + live matrix). V10: the latest stable ST at release. README states the policy ("latest ST release, re-verified per release") | README text + plan 10 CH record per claimed version |
| Clean `dist/` (R6) | `output.clean: true` (each flavour cleans only its own dir); prod `devtool: false`; `manifest.mjs` lists every emitted file with sha256 and stops recording `host.root` (the build machine's absolute path; `host.version`, `host.commit` and ST-relative `host.files` stay; `extension.revision.dirty` stays, `false` on a shipped build because `package.mjs` refuses a dirty tree) | `test:release`: every file in `dist/` is named in `dist/manifest.json` and vice versa; a planted stale `.map` fails; no string value in the staged tree's `dist/manifest.json` or `release-manifest.json` is an absolute path (`/^[A-Za-z]:[\\/]|^\//`), negative control: a planted `host.root` fails |
| `LiveReloadPlugin` | dev build only | prod bundle grep: 0 `livereload` |

### SM — the artifact smoke journey (Sol PR-02)

`scripts/release/artifact-smoke.mts`: Playwright through ordinary ST UI and observable state only (DOM, network, chat and
data files). It never calls a `storyOrchestrator*` global. On a fresh ST clone at the claimed tag:
1. install the artifact by the U6 route; reload; the settings panel mounts (`#story-orchestrator-settings`);
2. first run as in FR below, then select a memory profile through the control Repair reveals;
   2b. provision what `sun-ruins` requires through ordinary ST UI only: import the four cards (`examples/sun-ruins/*.png`,
   Characters → Import), import `Xentar Checkpoints.json` as a lorebook and select it globally (World Info), create a group
   with DM Narrator/Arin/Ponticius/Luke, and open that group's chat. Before the turn, assert the chat is a group chat with
   those four members, that the Repair entry (`#so-entry-repair`) shows no `[data-so="repair-step"]` for cast or lore, and
   that there is no needs-setup `#so-hud-pipeline` chip (or turn on Author view and read the requirements panel as ready);
3. import `examples/sun-ruins` through the panel, select it, send one real turn (`#send_but`) in that group chat, observe a
   committed boundary (the HUD checkpoint chip, and `story_orchestrator` in the saved chat file);
   3b. open the Studio (`#so-open-studio`) and show the graph; assert every `dist/*.index.js` request answers 200 and the
   console has no ChunkLoadError or "Failed to load cytoscape-dagre" warning;
4. Restart story (confirm popup), observe the reset in the chat file;
5. assert the names in `Object.keys(globalThis)` starting `storyOrchestrator` ⊆ the D2 allowlist, and `talkControlInterceptor`
   present;
6. archive the zip sha256, `release-manifest.json`, and the **served** `dist/index.js` sha256 (fetched from the page) =
   `dist/manifest.json` `bundle.sha256`.

Cleanup deletes the group, the chat, the cards and the lorebook this run created, the same way FR/UN inventory them; the
run fails if any are left behind. Records: `test/journeys/records/v2.5-plan12/SM/run<k>/`. ×2. Its own assertions get
node:test with a fake page.

### D — debug surface out of the prod bundle (D1–D4)

| Row | Design | Check (negative control) |
|---|---|---|
| D1 | the 13 `storyOrchestratorDebug*` reads move behind `if (__SO_DEV__)` (webpack `DefinePlugin`); terser drops the branch in prod | `test:release` greps the prod bundle: 0 `storyOrchestratorDebug`; control: a dev bundle has them |
| D2 | prod exposes only `talkControlInterceptor` (`manifest.json:13`) plus at most one documented read-only handle (V11). `storyOrchestratorJudge` stops being a UI channel (`index.tsx:187,216`): the panel gets the runtime by import | bundle grep against an allowlist; `npm run test:debug` green on a **dev** build |
| D3 | `liveSuite`, `*Calibration`, `selfTestCases`, `createCandidate`, and every plan-09 spike module not built under an approved build plan, load only through a dev-only dynamic import | TS-API import-graph guard from `src/index.tsx` in jest (the `architecture.test.ts` style); control: a planted static import fails |
| D4 | `JudgeSettingsGroup.tsx:124` links to the README's recommended-configuration section (shipped) instead of `docs/plans` | grep guard: 0 `docs/plans` in `src/**/*.tsx` hrefs |

### F1 — bundle budget

Main entry ≤ **1 250 000 bytes** (decimal MB, the stricter reading of "1.25 MB"; predeclared, never retuned), with
`StudioModal` + cytoscape + dagre behind `import()` as one lazy chunk. webpack `performance: {hints: "error",
maxEntrypointSize: 1250000, maxAssetSize: 1250000}` → 0 warnings, and an overrun fails the build. Measured **after** plan 03.
Check: `test:release` reads `dist/manifest.json` `bundle.bytes`; the lazy chunk loads when the Studio opens (SM step 3b,
network log).

### P — privacy, secrets, served tree (P1–P3)

**P3 served tree (PR-04).** The pass rule is a 404 for every sensitive path on the dev install **and** on the artifact install.
A repo inside `public/` cannot meet it for `docs/` and `test/` (both 200 today), so:
- **Decision on evidence (reversible, see Q1):** the repo moves out of the ST tree (`C:\dev\story-orchestrator`). A new
  `npm run stage` copies the allowlist plus the chosen build (dev or prod) into
  `<ST_ROOT>/public/scripts/extensions/third-party/story-orchestrator`. The harness already takes `ST_ROOT`
  (`scripts/debug/st-lanes.mts:26`, `scripts/plugin-install.mjs` `--st-root`). Every script that assumes five levels up,
  changed in the same step: `scripts/release/manifest.mjs:46` (`ST_PUBLIC`), `scripts/debug/st-lanes.mts:26,29` (`ST_ROOT`,
  `LANES_ROOT`), `scripts/debug/lib/connection.mts:21,25` (browser profile, so-lanes), `scripts/plugin-install.mjs:23`,
  `scripts/debug/eventNames.test.mts:11`, `scripts/debug/st-search.mts:31` (fallback), `.storybook/main.ts:5` (`ST_PUBLIC`
  webfonts). Once the repo sits outside the ST tree, each requires `ST_ROOT`/`ST_PUBLIC` explicitly and errors when it is
  unset or invalid instead of deriving it (otherwise the lanes root lands at `<drive>\so-lanes`). `eventNames.test.mts:38-39`
  changes from `t.skip` to a failure when `events.js` is missing. `manifest.test.mjs:49-53` stays the build-evidence guard,
  with a negative control: a build run with a bogus `ST_PUBLIC` must fail `test:release`.
- The default `SO_DEBUG_DIR` becomes `<so-lanes>/0/debug`, beside the browser profile (`connection.mts:18-26`). The existing
  `.debug/` contents (60 MB) are **moved** there, not deleted.
- Check `SV`: a probe list of representative paths (a `.debug` run log, a journal, a payload capture, a run header, a browser
  profile file, `dist/*.map`, `docs/plans/**`, `test/journeys/records/**`, `.claude/**`) fetched on the dev install and on the
  artifact install. Pass: 404 for each, and the artifact tree equals its allowlist. Record: `v2.5-plan12/SV/`.

**P1 disclosure from measured egress (PR-16).** The README privacy section is written **from** the EG record, not before it.

| Role | Destination | What leaves | Default | Off switch |
|---|---|---|---|---|
| Main generation (ST's own) | the user's main API | the prompt ST builds, plus our blocks: guidance, memory tiers, private epistemic, nudge, continuity note | on (story selected) | clear the story |
| Memory passes (extraction, scene, short-term, canon, arcs, epistemic/ledger, memorize) | the memory Connection Manager profile | transcript windows, current qualities, memory rows | on with a profile | extraction toggle / no profile |
| Curator, wizard, expansion, critic, director (LLM route) | their ST profile | story graph, lorebook entries in `stagecraft.lorebooks`, roster, recent transcript | per setting | per setting |
| Judge (plugin) | `https://api.typesafe.ai/v1/systemone`, or `TYPESAFE_BASE_URL` | `{state, questions, model}` only (v2.4 JM privacy row) | off, every use | `judge.enabled` |
| Harness routes (plugin, plan 13), per role `read`, `synthesis`, `authoring`, `director`, `curator` (`src/extraction/passRole.ts:1-11`) | per CLI: Claude Code → Anthropic, Codex → OpenAI, opencode → the provider its model id names (e.g. `openai/…`) | the role's `system` + prompt on stdin: `read` = transcript window, qualities, checkpoint **and private epistemic/ledger knowledge**; `synthesis` = memory rows + windows; `authoring` = story draft + author text; `director` = roster + recent turns; `curator` = scoped lorebook entries + recent turns. Whatever the CLI adds (its own prompt, telemetry) is recorded per CLI version by plan 13 P0-7 (hosts contacted, telemetry) | off: every role "Same as memory model" (plan 13 H6) | per-role route back to a profile |
| Local storage | ST data dir | chat metadata, install-wide settings, library, wizard sessions, mirror lorebooks, transient `so_consol_*` vectors; CLI-side session files if the CLI writes them | — | uninstall (UN) |

Check `EG` (on the artifact install, a lane copy): page-side recorder on `fetch` for `/api/backends/`, `/api/plugins/*`;
server-side, `TYPESAFE_BASE_URL` pointed at a local recording stub for one run and at the real host for another. Pass:
judge off → 0 plugin `systemone` requests and 0 stub hits over a full J3-shaped session; judge on → stub bodies have only
the documented keys, same count as the page saw; harness off → 0 spawns (plugin spawn counter and an OS process scan for
`claude`/`codex`/`opencode`); harness on → spawns only for routed roles, stdin = the role prompt, and contacted hosts ⊆ the
P0-7 record for that CLI version. Logs and support exports:
the stated redaction/retention rule (dev `.debug` never in the artifact; the journal export names what it contains).

**P2 judge key scope — U7 owed.** Options: (a) with `enableUserAccounts: true`, read ST secrets per user only, and ignore the
env/dotenv fallbacks; (b) keep them and document them as install-wide. The check follows the decision: a two-user test on a
real ST route (PS-J step 4), plus the README sentence.

### Server plugins: install routes and security gates

**JP — judge plugin on an artifact install (PR-03).** Ship the installer at the artifact root as `install-plugins.mjs`: the
`scripts/plugin-install.mjs` that plan 13 H2 extends to take a plugin name (node only, no npm; ST already needs node).
It copies `server-plugin/<name>` into `<ST>/plugins/<name>`, has `--check` and a new `--uninstall`, and prints the
`enableServerPlugins: true` + restart step. Today it derives the extension root as its own parent dir (`scripts/..`); at the
artifact root that must become its own dir, and the ST-root guard (`src/plugin-loader.js` present) stays. The documented manual route (copy the folder) is tested too. Check on a fresh ST
clone with the artifact: enable plugins, restart, `GET /api/plugins/story-orchestrator-judge/status` → `configured` after
the panel writes the key, one opt-in call through a judge use, plugin version in the release manifest. Updates: a copied
plugin never self-updates (`plugin-loader.js:238-250` is git only), so the README says "re-run the installer" and
`--check` reports drift.

**PS-J — judge plugin security gate (PR-05).** U7 first.

| # | Rule | Check |
|---|---|---|
| 1 | permitted model list (`DEFAULT_MODEL` + any plan 06 adds); any other `model` → 400, no upstream call | stub upstream counts 0 |
| 2 | body bounded **before** parse: the page posts `text/plain`, the route mounts its own `express.text({limit})` sized to `MAX_REQUEST_CHARS`. A JSON-typed or urlencoded body is parsed by ST's global 500 MB parser before the route sees it (host limit, `server-main.js:110-111`); the route refuses it after that parse; only `text/plain` is bounded before parse. The route requires a custom request header (e.g. `X-SO-Plugin: 1`, sent by stHost), which makes any cross-origin call a preflighted one that ST's default CORS (`origin 'null'`, `methods ['OPTIONS']`) rejects, and refuses a request whose `Sec-Fetch-Site` is present and not `same-origin`, or whose `Origin` is present and not the ST host; this guard is independent of ST CSRF and of accounts (with accounts off every caller is `DEFAULT_USER` with `admin: true`) | 5 MB text body → 413 with no parse of it; control: a normal call passes |
| 3 | per-user concurrency and rate (keyed by `request.user.profile.handle`): proposal ≤ 2 in flight, ≤ 60/min; excess → 429 without an upstream call | 20 parallel calls from one user: upstream ≤ 2 concurrent, the rest 429 |
| 4 | two users, two keys (lane with `enableUserAccounts: true`) | user A's calls carry A's key only (stub records the bearer hash); B with no key → 409, never A's key |
| 5 | host auth + CSRF | no CSRF token → 403; logged-out → refused |
| 6 | same-origin guard of its own (row 2), on a lane with `disableCsrfProtection: true` and accounts off | a cross-origin `text/plain` POST without the header, and one with a foreign `Origin` → 403 with 0 upstream calls; control: a same-origin call from the page passes |

Numbers in rows 2–3 are proposals, fixed in this doc before the gate runs (Q4).

**Harness plugin (plan 13 §H2) — ships, installs and uninstalls like the judge plugin.** In the allowlist; installed by the
same `install-plugins.mjs`. Routes `GET /status`, `POST /complete`, `POST /cancel`. The CLIs are **never** installed or
logged in by us: the README names each CLI, its login command and its vendor. `/status` reports per harness: installed,
version, path, logged-in probe, models; this plan adds a spawn counter (EG, H4).

**PS-H — harness plugin security gate.** Plan 13 §H2 rules 1–11 are the design; this gate proves them on a real ST route.
Each rule: a node:test on the plugin plus one live probe on a lane copy (after plan 13 Phase 0 H-N1/P0-2 pass).

| # | Rule | Check (negative control) |
|---|---|---|
| 1 | no shell: `spawn(absPath, argv, {shell: false})`, `absPath` resolved once at init; a `.cmd`/`.ps1` shim refused unless its real entry is resolved | a prompt, system or model string carrying `;`, `&&`, `$(…)`, `` ` `` runs nothing extra (process scan); control: a `shell: true` build fails the test |
| 2 | fixed argv per harness; the request picks a harness id and an **allowlisted model** (plan 13 rule 8), never argv; the prompt goes on stdin only, `system` by file (plan 13 rule 2) | an unlisted model → refused, 0 spawns; a prompt of 40 000 chars spawns with argv length unchanged; a `system` of 40 000 chars containing `;`, `&&`, `$(…)`, backticks, a leading `--` and newlines spawns with argv and the env block byte-identical to a 10-char `system` (checked for each harness, including opencode's env); `system` > `MAX_SYSTEM_CHARS` → refused, 0 spawns |
| 3 | tools off (plan 13 rule 3 flag sets, incl. Codex `--ignore-user-config`) | a prompt asking to write `canary.txt`, read `~/.ssh/known_hosts`, run `whoami`, fetch a URL: no file created in cwd or home, 0 tool events, no child beyond the CLI tree; no MCP child process appears in the harness process tree during a live `/complete` |
| 4 | empty temp cwd per call (`mkdtemp`), removed after | cwd listing before spawn = ∅; after the call the dir is gone; 0 leftovers after 50 calls |
| 5 | no user context leakage: neither a cwd nor a **user-level** `CLAUDE.md` / `AGENTS.md` / opencode config reaches the model (live re-proof on the ST route; plan 13 P0-2 already covers user level) | plant `CANARY-7` instructions in a **throwaway config home per CLI**, never in the real home: `CLAUDE_CONFIG_DIR` for Claude, `CODEX_HOME` for Codex, opencode's global-config path via `XDG_CONFIG_HOME` or its isolated config dir (plan 13 rule 3; fact owed per CLI). Copy only the login material into that home and remove it after the run. Precondition: a first probe shows the CLI, **without** the isolation flags, echoes the canary from that home (this doubles as the control). Then 0 replies contain it, and input tokens are equal ±5 with and without. The run must not write under the real `~/.claude`, `~/.codex` or opencode config: before/after sha256 of those files, any change is a fail |
| 6 | env allowlist (plan 13 rule 5): ST's own environment is not passed | a canary env var set on the ST process is absent from the child (a shim CLI prints its env) |
| 7 | concurrency per harness ≤ 2, queue ≤ 8, one in flight per ST user per harness per role, a second call for the same role queues (plan 13 rule 7) | 20 parallel requests: ≤ 2 live processes per harness at any 100 ms sample; only queue overflow answers `refused` |
| 8 | body bounded **before** parse, as PS-J 2 (plan 13 rule 7 bounds the prompt after parse; the gate needs both); a JSON-typed or urlencoded body is parsed by ST's global 500 MB parser first (host limit) and refused after that parse; custom header + same-origin guard as PS-J 2 | 5 MB text body → 413 without a parse of it; on a lane with `disableCsrfProtection: true` and accounts off, a cross-origin `text/plain` POST without the header, and one with a foreign `Origin` → 403 and 0 spawns; control: a same-origin call from the page passes |
| 9 | deadline + **kill tree** (`taskkill /T /F`, POSIX process group); `/cancel` and request close kill too | a shim that sleeps and forks: 0 descendants 1 s after the deadline, after `/cancel`, and after the page aborts |
| 10 | who may call: `request.user.profile.admin` only by default (plan 13 rule 9; `request.user` is `{profile, directories}`) | (a) default single-user install (accounts off, `DEFAULT_USER.admin` true): the call is allowed; (b) a non-admin account user on a multi-user lane → 403, 0 spawns. Both cases guard against a check that reads undefined |
| 11 | auth + CSRF as PS-J 5 | as PS-J |
| 12 | nothing logged but `{harness, model, ms, usage, kind}` (plan 13 rule 11) | a canary in the prompt and in the reply never appears in ST's console log or the plugin's |

**Uninstall inventory for the harness plugin:** `<ST>/plugins/story-orchestrator-harness/`; any leftover temp cwd; the
per-role route settings in `extensionSettings["story-orchestrator"]`; CLI-side session files each call may create (the
location per CLI version is recorded by plan 13 P0-7, files written outside the temp cwd; the README tells the user where
they are, we never delete a CLI's files).

### U — user docs (U1, U2), first run, uninstall, backup/restore, update

The README becomes the user document; developer content moves to `docs/DEVELOPING.md` (not shipped). A review rubric is
committed before review (PR-18): each walkthrough step names its control id and the recorded screenshot it matches.

| Section | Content |
|---|---|
| Install | the U6 route, no npm; optional plugins via `install-plugins.mjs`; supported ST versions + policy (R5) |
| First run | from the FR record's screens |
| Privacy | the P1 table, from EG |
| Backup / restore | from BR |
| Uninstall | two modes, from UN |
| Troubleshooting | backend down (pipeline "memory model not answering; reads held", `src/extraction/scheduler.ts:320`), stale bundle after update (hard reload), profile missing (Repair), plugin 404 (`enableServerPlugins`), harness: CLI missing / not logged in / quota |
| Language | English-only UI and prompts in 2.5 (A2, V11) |
| Licence | AGPL-3.0, source offer at the release tag, `THIRD-PARTY-NOTICES.md` |

**FR — first run is tested (PR-06).** Fresh ST at the claimed tag, artifact installed, no memory profile, no plugin. Pass:
Repair names the memory-model step first (`runtime/repair.ts` worst-first) and its reveal lands on a working control; the
drawer pipeline reads not-configured; the network log shows 0 `/api/backends/` calls from our passes before configuration
(only ST's own generation when the player sends); after selecting a profile the next turns commit boundaries and a read
runs. The published walkthrough matches the recorded screens. ×2, `v2.5-plan12/FR/`.

**UN — uninstall is tested (PR-07).** `scripts/release/inventory.mjs` scans a data root server-side and lists what we own:

| Asset | Where | Keep-data mode | Remove-owned mode |
|---|---|---|---|
| Mirror lorebooks | `worlds/Story Orchestrator - <title> - <chatId>.json` (+ `so-owner` marker) | kept, listed | deleted |
| Gated entries' rest state | library books normalised by plan 01 (ledger) | kept, listed | restored from the ledger (plan 01 E) |
| Wizard cards, groups, lorebooks | wizard ledger `createdLorebooks`/`applied` | kept (authored) | deleted only after a per-item confirm |
| Library, wizard sessions, settings, `schema` | `settings.json` `extensionSettings["story-orchestrator"]` | kept | removed |
| Chat state | `chat_metadata.story_orchestrator`, chat lorebook binding, `note_prompt`/`note_role`, `custom_background` lock | kept | removed per chat |
| Transition notes, NPC replies | chat messages | kept (chat content) | kept; listed |
| Judge key | `secrets.json` `typesafe_api_key` (presence only, never the value) | kept | removed |
| Transient vectors | `so_consol_*` collections | purged | purged |
| Server plugins | `plugins/story-orchestrator-{judge,harness}` | removed by `--uninstall` | removed |
| Harness residue | temp cwds; CLI session files | temp purged; CLI files listed | same |

Remove-owned mode is an author-view action "Remove Story Orchestrator data…" with a confirm listing each item (it must run
while the code is loaded: ST's "Delete extension" only removes the folder). Check: create (story, mirror book, wizard card,
judge key, one harness call) → inventory → uninstall (each mode) → inventory. Pass: the diff equals the mode's column; a
planted **foreign** book, card and chat are byte-identical. ×2, `v2.5-plan12/UN/`.

**BR — backup/restore (PR-14).** Supported: library stories (Studio export → import round-trip, `studio/io.ts:4,6`, byte-equal
after canonicalisation), settings and wizard sessions (documented copy of the `settings.json` key, restore test on a lane),
chat state (ST's own chat backups, documented as ST's). The clipboard export (`stateExport.ts:8-9`) is described as an
author's debug copy, **not** a backup. Check: round-trip every library story on the artifact; restore settings on a fresh
lane and read them back.

**UP — update mechanics (PR-15).** Two deliberately versioned candidates (`2.5.0-rc.1`, `2.5.0-rc.2`) through the U6 route on a
clean ST. The rcs are update-mechanics fixtures only, never the attested candidate, and are exempt from the release-mode tag
check. rc.2 is committed as a child of rc.1 by the same release step, and the update goes through ST's own update control
(the `/api/extensions/update` path), not a manual re-clone. `clean-host.sh`'s version parse keeps pre-release suffixes
(e.g. `sed -E 's/.*"version": *"([^"]+)".*/\1/'`; today `sed 's/[^0-9.]//g'` turns `2.5.0-rc.1` into `2.5.0.1`). Pass: after the update the served `dist/index.js` sha = rc.2's `bundle.sha256`; settings, library and chat state
survive (same schema) or, if rc.2 bumps the blob, the rule-9 notice + confirmed Restart appears; plugins report drift via
`--check`. v2.5 is the first baseline: no attestation claims an upgrade from a previous public release. Post-release policy:
real migrations (overview V10 Q5), gated from the next version on.

**U2 changelog.** 2.4.0 and 2.5.0 entries, user-facing; bound by R4.

### A — accessibility and language (A1, A2)

A1: `color-contrast` back on (`.storybook/preview.ts:25-29`); a per-story exemption carries a reason; every component has a
story, `SettingsPanel` included (after plan 03 splits `index.tsx`); `test-storybook:ci` 0 violations. The live touch/keyboard
pass is plan 10 row TK. A2: README statement (V11).

### Q2t — CI

`.github/workflows/ci.yml` on push to master and on tags: `typecheck`, `typecheck:test`, `lint`, `test`, `build`, `build:dev`,
`test:release`, `test:plugin` (both plugins), `test:debug`, `debug:typecheck`, `test-storybook:ci`. Also `clean-host.sh`'s
default gates gain `storybook`, `typecheck:test`, `test:debug`, `test:plugin` (seeds §D). Check: a green run on the release
commit, cited in the attestation. Needs the GitHub remote U6 names.

### E3 — the `fetch` wrapper beside other wrappers

Kept (V11). Live check on a lane copy with **two** third-party extensions that wrap `fetch` (picked from
`C:\dev\st-extensions-research` by grep for `fetch =`, named in the record), in both install orders. Pass: every chat save
read back, our refusal still fires on the empty cross-chat write (v2.4 plan 02 fixture), no double report in the save
evidence, the peers' wrappers still see their requests. ×2, `v2.5-plan12/E3/`.

### LI — licences and SBOM (PR-17)

`THIRD-PARTY-NOTICES.md` is generated from the production webpack stats module list (the package of every bundled module,
including loader runtimes such as style-loader/css-loader and webpack's own runtime), not from `npm sbom --omit=dev`; the npm
SBOM (`--sbom-format cyclonedx`) may be attached as a secondary artifact only. Each shipped package's licence id and notice,
plus the vendored Smart-Memory (AGPL-3.0, `vendor/smart-memory/LICENSE`). The unused `yaml` runtime dependency
(`package.json:10`) is removed, or the check fails because a declared runtime dependency is absent from the stats. Every file
under `examples/**` (4 card PNGs, `Xentar Checkpoints.json`, the story) carries its provenance (author or source) and licence
in `THIRD-PARTY-NOTICES.md` or `examples/README.md`; the check fails when an allowlisted `examples/` file has no entry. Check in
`test:release`: every package in the prod stats appears in the notices with a licence on the allowed list (MIT, ISC,
BSD-2/3, Apache-2.0, AGPL-3.0-compatible); the README source-offer URL names the exact release tag; `npm audit --omit=dev`
high/critical = 0 (T4 shares it). Controls: a planted dependency without a notice fails; a planted devDependency whose code
is bundled must also fail when it has no notice.

## Checks (all archived under `test/journeys/records/v2.5-plan12/<id>/`; plan 10 re-runs them on the candidate)

| Id | Rows | Where | Runs |
|---|---|---|---|
| R-t | R3, R4 (version fields), R6, D1, D2, D4, F1, LI | `npm run test:release` (+ negative controls in the same file) | every build |
| R-t rel | R4 (tag equality), Route A fast-forward | `npm run test:release --release` | release mode (tagged HEAD, `package.mjs`, CI on tags) |
| D3-g | D3 | jest import-graph guard | every build |
| SM | R1, D2 | artifact smoke, fresh ST at the claimed tag | ×2 |
| FR | U1 first run | artifact, fresh ST | ×2 |
| UN | U1 uninstall | artifact, lane copy | ×2 |
| BR | U1 backup | artifact, lane copy | ×2 |
| UP | R2 | two rcs, clean ST | ×2 |
| SV | P3 | dev install + artifact install | ×2 |
| EG | P1 | artifact, lane copy, stub + real host | ×2 |
| JP | judge install | artifact, fresh ST | ×2 |
| PS-J | P2 + PR-05 | node:test + lane (`enableUserAccounts`) | ×2 live |
| PS-H | plan 13 plugin | node:test + lane | ×2 live |
| E3 | E3 | lane copy + two wrappers | ×2 |
| CI | Q2t | GitHub Actions | release commit |
| A1 | A1 | `test-storybook:ci` | every build |

Every new guard lands with a planted offender that fails it (prod-readiness "How this lands").

## Order of work

1. Dev/prod flag + D1–D4 guards (no behaviour change for users). 2. `output.clean`, manifest lists every file (R6).
3. Repo move + `npm run stage` + `SO_DEBUG_DIR` default + `.debug` move (P3; harness scripts in the same change).
4. Packaging script + allowlist + version assertion (R3/R4); changelog 2.4.0 (U2). 5. `install-plugins.mjs` + PS-J.
6. Lazy Studio chunk + budget (F1, after plan 03). 7. Licences (LI), CI (Q2t), contrast (A1).
8. PS-H + harness inventory (after plan 13 Phase A). 9. Remove-owned action + inventory script (UN).
10. README rewrite from the FR/EG/UN/BR records. 11. SM, FR, UN, BR, UP, SV, EG, JP, E3 live ×2. 12. Gate record.

Gates per CLAUDE.md: build/release tooling → `typecheck && lint && test && build && test:release`; the runtime/UI items
(D1–D3, remove-owned action, Studio chunk) → plus the live gate.

## Decisions owed (listed, not decided)

- **U6 Distribution:** `release` branch with the staged tree committed (ST installer + `auto_update`), GitHub release zips
  only, or both. Decides R1/R2, `manifest.json` `homePage`/`auto_update`, where CI runs, and UP's route.
- **U7 Judge key scope:** drop the env/dotenv fallbacks in multi-user installs, or document them as install-wide. Blocks PS-J 4
  and the P2 README sentence.

## Risks

- **The repo move (P3)** touches every debug script that derives `ST_ROOT`, lane seeding and the plugin installer (the list
  is in P3: `manifest.mjs:46`, `st-lanes.mts:26,29`, `connection.mts:21,25`, `plugin-install.mjs:23`,
  `eventNames.test.mts:11`, `st-search.mts:31`, `.storybook/main.ts:5`); a missed one fails loudly (wrong root) or, worse,
  stages into the wrong ST. The stage step refuses a target without
  `src/plugin-loader.js`, the same guard `plugin-install.mjs` uses.
- **Two builds** can drift: a dev-only code path that changes behaviour makes the instrumented journeys measure something the
  artifact does not ship. D1 keeps the flag to reading overrides and exposing handles; SM, FR and TK run on prod.
- **CLI behaviour is vendor-owned.** Flags, telemetry and local session files change per CLI version; PS-H and EG record
  the CLI versions measured, and the README says re-verified per release.
- **ST's global JSON parser** (500 MB) runs before any plugin route for `application/json`; the text-route design must be
  verified on the claimed ST version (it depends on ST's middleware order).
- **CI needs a remote** (U6); until then Q2t cannot be green.

## Unresolved questions

- Q1 Move the repo out of `public/` and stage installs (the only design that 404s `docs/`/`test/` on the dev box), or keep it
  in place and have the user sign off the dev-box half of P3, a critical row (so PARTIAL)?
- Q2 Ship `install-plugins.mjs` in the artifact, or document the manual copy only?
- Q3 An in-panel "Remove Story Orchestrator data…" action (author view, confirm with the item list), or a documented manual
  procedure for remove-owned mode?
- Q4 Judge plugin limits ≤ 2 in flight / ≤ 60 per min per user (the harness takes plan 13's: ≤ 2 per harness, queue 8, one
  per user per harness). Accept or set others before PS-J runs?
- Q5 Should wizard-created cards and groups be removed in remove-owned mode (per-item confirm), or always kept as authored
  content?
- ~~Q6~~ Resolved 2026-09-25: plan 13 §H2 rule 7 now takes PS-J 2's `text/plain` + `express.text({limit})` bound before parse, then the prompt bound after it.
  Agree that the gate needs both?
- U6, U7 above.
