# Tavernary Companion (Tavernary.org) — v2.4 review

meta: author MentallyQuill · repo https://github.com/MentallyQuill/TavernaryCompanion · commit `5515ed6` (2026-09-07) · 70 upvotes / 162 msgs · source available: **y** (shallow clone, `source/`; ~17.7k lines TS/TSX, Preact) · manifest `0.1.0-pre-alpha.1`, AGPL-3.0

## What it is
- Post is about the website Tavernary.org, a static GitHub Pages catalog of ST extensions, presets and frontends, plus "Kits": shareable, votable bundles of those.
- The repo is the **Companion** ST extension. It is an extension manager: it browses the public catalog JSON (`tavernary.org/catalog/tavernary-catalog-v8.json`) and installs, updates, removes and enables extensions through ST's own extension API. It also saves and switches Kits and shows the "TavernKeeper" scan evidence for each version.
- No chat, prompt, LLM, WI, macro or event involvement at all. Nothing in it touches story state. Relevance to SO comes only from host-integration and engineering patterns.

## How it works
- **Entry + lifecycle hooks.** `manifest.json:11-19` declares ST manifest `hooks` (`install/update/delete/clean/enable/disable/activate`). All seven map to exported functions (`src/extension/index.ts:3-29`) that call `bootstrapCompanion`/`disposeCompanion`. ST calls `activate` after the script tag loads (ST `public/scripts/extensions.js:637`), so boot is hook-driven rather than a top-level side effect. `bootstrap.ts:26-45` makes boot idempotent with an in-flight promise.
- **Host adapter.** A narrow adapter sits behind injected deps, the same shape as our stHost. `host/runtime-host.ts:48,67` dynamically imports `/script.js` (for `saveSettings`) and `/scripts/extensions.js` (for `extensionNames/extensionTypes/getExtensionManifest/installExtension/enableExtension/disableExtension`). `host/sillytavern-host.ts` wraps the REST endpoints: `/api/extensions/version` (`:87,236,311`), `/delete` (`:472`), `/discover` (`:526`) and `/update` (`:449`), plus fork-only `/capabilities` (`:123`), `/resolve` (`:166`), `/update-status` (`:368`) and `/update-to` (`:437`). A 404 on the fork-only ones degrades to "legacy capabilities" (`:135`, `:386`). The capability promise is cached and cleared on failure (`:69-78`). Every response is shape-checked and throws a typed `HostOperationError`; SHAs must match `/^[0-9a-f]{40}$/`, and server error text is sanitised to 500 chars (`:655`).
- **Act, then verify from the host.** `lifecycle/verified-install.ts:71-130` works in four steps:
  1. Install.
  2. Re-discover the inventory and require **exactly one** folder match under an NFKC-lowercased identity (`:77`, `:175-192`).
  3. Read the installed git SHA back.
  4. On a mismatch, uninstall the result and confirm it is gone (`cleanupMismatch`, `:133-173`). The cleanup outcome (`not-needed|succeeded|failed`) is carried on the error.
- **Ownership.** `inventory/inventory-reconciler.ts:22-90` classifies host extensions as `managed` (installed and recorded by Companion), `external` (present but not installed by it) or `unknown` (ambiguous or not in the catalog). Adding an external extension to a Kit does not transfer ownership (README). It also refuses to manage itself (`lifecycle/self-protection.ts:14-20`).
- **Persistence.** Everything lives in `extensionSettings.tavernaryCompanion` (`state/profile-store.ts:4`), through a serialized promise queue (`:31-66`), with a `formatVersion` migration (`state/state-migrations.ts:14-49`). A **newer formatVersion is refused with a throw** rather than defaulted over (`:18-19`). An update writes the new state, calls `saveSettings`, and puts the previous value back if that throws (`profile-store.ts:36-51`). Multi-step Kit operations keep a write-ahead **journal** in the same store (`kits/kit-operation-journal.ts:7-47`). The journal records the phase, current project, completed projects and completed mutations, so an interrupted operation can be recovered after a reload.
- **Concurrency.** `lifecycle/operation-lock.ts:29-50` allows a single-flight exclusive operation, with a phase the UI subscribes to. A second operation throws rather than queueing.
- **UI.** A launcher is anchored at `#extensions_details` (`bootstrap.ts:69`). Content renders inside ST's native `Popup` (`POPUP_TYPE.DISPLAY`) with an opt-in backdrop dismissal (`runtime-host.ts:113-135`). A first-install trust disclosure explains that a scan is evidence, not a guarantee. The version chooser offers "Latest scanned" or "Latest from creator".
- **Testing.** Vitest units and integration run against `tests/helpers/fake-host.ts`, plus axe a11y units. Playwright `toHaveScreenshot` baselines cover 5 viewports (`tests/e2e/responsive-conformance.spec.ts:5-16`). A **real-ST acceptance spec** is env-gated and refuses its destructive steps outside a dedicated ST user account, `companion-acceptance-v1` (`tests/e2e/real-sillytavern.spec.ts:5,26-41`). That spec also checks `isTopmostAtCenter` before clicking (`:48`).
- **Mutations / swipes / LLM calls:** none. There is no chat involvement.

## Overlap with Story Orchestrator
- **Host seam:** same idea as our `STAPI.ts` + `stHost/*` (injected deps, typed errors, shape checks). Ours is stricter: it returns a `WriteResult` rather than throwing (`src/utils/writeResult.ts`, guarded by `stHost/typedResults.test.ts`).
- **Capability probes with degradation:** we have the same pattern (`src/services/stHost/capabilities.ts:68`, where `error` is not cached). Theirs clears the cached rejection (`sillytavern-host.ts:69-78`), which is equivalent. Nothing new here.
- **Write-ahead journal + reconcile:** our owned-effect ledger does the same job for host effects, with a pending row before the call, reconcile on hydrate and a compare-and-set restore (`src/runtime/effectLedger.ts:72,112`). It is at least as strong as their Kit journal.
- **Ownership vs presence:** our wizard's created-asset ledger (`src/runtime/wizardSessions.ts:28`) plus "a requirement is not ownership" (baseline invariant 8) covers the same ground as their managed/external split.
- **Hit-test before click:** we have `ui: {action: "hit-test"}`, which also names the cause. Theirs is only a boolean.
- **Where they are ahead:**
  - They refuse a newer state format. We do not; see idea 1.
  - They use manifest lifecycle hooks. We use none; see idea 2.
  - They declare a minimum host version in the manifest. We do not; see idea 3.
  - After creating an asset they read the created identity back from the host. Our provisioning returns the requested name; see idea 4.
  - Their destructive e2e runs in a dedicated ST user account; see idea 5.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Refuse, never overwrite, a chat blob from a NEWER build (downgrade guard) | pattern | host / persistence | absent | 4 | S |
| 2 | Manifest lifecycle hooks: `disable`/`delete` release owned host effects; `clean` removes SO's install-wide data | host-integration | host / runtime | absent | 3 | M |
| 3 | Declare `minimum_client_version` in `manifest.json` | host-integration | host | absent | 3 | S |
| 4 | Provisioning reads the created card/group back from the host (exactly-one match) and records the STORED identity | enhancement | wizard | partial | 3 | S |
| 5 | Run journeys and destructive live gates in a dedicated ST user account | testing | harness | absent | 3 | M |
| 6 | Anti-pattern: "put back on thrown save" around `saveSettings` (it never throws) | anti-pattern | host | present (as a known trap) | 2 | S |

**1. Downgrade guard for the per-chat blob.**
- **What:** a blob whose `version` is greater than the current one should be left untouched and treated as "unreadable by this build". The player sees one line, author detail goes to the journal, and automatic writes are refused, the same treatment V5 already gives a foreign-stamped blob.
- **Theirs:** `state/state-migrations.ts:18-19` throws `UnsupportedProfileStateError` for `formatVersion > 1` instead of falling back to defaults.
- **Ours:** `src/runtime/persistence.ts:49-55` accepts only `version === 4`, migrates `3`, and sends everything else to `migrateMetadataBlob`. That function returns `null` for anything that is not `version === 2` (`src/runtime/persistenceMigration.ts:23`).
- **Failure:** `getMetadataBlob` then assigns a fresh empty v4 blob over the stored one (`persistence.ts:73-75`). The next `saveMetadata` persists that loss. So a user who tries v2.4 (a v5 blob) and rolls back to 2.3.0 loses every opened chat's story state.
- **Why it matters now:** a pinned-commit install makes that rollback realistic (Companion ships "Latest scanned" vs "Latest from creator"), as does a plain `git checkout`.
- **Fit:** invariant 13 (a blob version bump needs a migration) is incomplete without the reverse direction. The foreign-blob path is already the right mechanism: read as detached and refuse writes.
- **Same question elsewhere:** the library (`storyLibrary.ts:64-69` filters with `isStoryRecord` and can write back) and the wizard sessions should get the same check. Verify before claiming a loss there.

**2. Lifecycle hooks.**
- **What:**
  - `disable`/`delete` should call `stopRuntime()`, release the story's gated WI set, and restore owned effects through the effect ledger's restore plan (AN, `disabled_members` cast mirror, background).
  - `clean` should remove `extensionSettings["story-orchestrator"]` (settings, `v2Stories`, `wizardSessions`) after a confirm. It could also offer to delete the per-chat `Story Orchestrator - <title> - <chatId>` mirror books.
- **Theirs:** `manifest.json:11-19`, `src/extension/index.ts`. ST: hooks are `import(url)`-ed and called with a **5 s timeout race**, and errors are logged, not thrown (`extensions.js:406-467`). `disable` runs before `saveSettings` + reload (`:491-500`). `clean` is followed by a forced `saveSettings` + reload (`:1447-1452`).
- **Ours:**
  - `manifest.json` has no `hooks`.
  - `stopRuntime()` exists (`src/runtime/index.ts:214`), but nothing in `src` calls it.
  - Nothing releases host state on disable. Checkpoint WI flags in global lorebooks, disabled group members and the AN stay as the last checkpoint left them, which is a cross-chat leak by the very reasoning behind invariant 14.
- **Build cost:** the hook needs named exports from `dist/index.js`. ST loads it as `type="module"` (`extensions.js:826`), but our webpack build is not a module library (`webpack.config.js:8-11`). That means `output.library: {type: "module"}` + `experiments.outputModule`.
- **Fit:** writes still go through stHost with `WriteResult` and a RunToken. They must fit in 5 s and must not assume a chat is open. The reachable scope is limited too: it is only the open chat's ledger, so other chats reconcile on their next hydrate.

**3. `minimum_client_version`.**
- **What:** declare the oldest host version that passed the gates. The clean-host run on ST 1.18.0 (`docs/release/2.3.0/clean-host-older/`) makes that `"1.18.0"`.
- **Theirs:** `manifest.json:9`. ST enforces it at load and shows a named load error: "Requires ST client version X" (`extensions.js:580-590, 658-660`).
- **Ours:** `manifest.json` lacks the field. The README "Tested on" table is documentation only, so an older host loads SO and fails somewhere deep. This complements the capability probes (invariant 2) and does not replace them.
- **Fit:** zero invariant conflict. It is a release-tooling check, and `test:release` could assert that the field agrees with the README table.

**4. Verify-after-create in provisioning.**
- **Problem:** `createCharacterCard` returns `{avatar, name: body.ch_name}`, the **requested** name (`src/services/stHost/provisioning.ts:65-67`). Our gotchas record that ST can store a different name or avatar: illegal characters stripped, `1`/`2` suffixes. So the created-asset ledger and the `setRequirements`/`addRosterMember` follow-ups can name something that does not exist.
- **Their pattern:** after acting, re-list the host inventory. Require exactly one match under a normalised identity (`verified-install.ts:77,175-192`). Record what the host reports, and carry a typed cleanup outcome when it disagrees.
- **For us:** after `getCharacters()`, find the card by the returned avatar. Record `characters[i].name`; if nothing or more than one card matches, answer `{ok:false, reason}`. Do the same for `createGroup` using the returned id.
- **Fit:** invariant 8 is untouched (still create-only). It strengthens "the requirements panel goes green from evidence".

**5. Isolated ST user account for live gates.**
- **What:** run journeys and scenario corpora in a dedicated ST account, as their `companion-acceptance-v1` does (`real-sillytavern.spec.ts:5,26-41`). Their destructive steps skip outside that account.
- **Why:** each account has its own `data/<handle>/` (characters, worlds, chats, settings), so SO's install-wide store, library, lorebook selection and wizard ledger could not leak into the user's real profile.
- **Ours:** there is no account concept in the harness (no `/api/users` hits under `scripts/debug`), and this install runs `enableUserAccounts: false` (`C:/dev/SillyTavern-MainBranch/config.yaml:68`).
- **Cost of not having it:** our rules carry a long list of shared-install scars. Examples: snapshot/restore ate cadence, the library and lorebook selection; a corpus run emptied a user chat; J11 deleted a peer's card; `so-run-header diff` exists largely to catch these.
- **Fit:** it is a harness-only change, but it flips a host config, which is the user's call. It would reduce, not remove, the need for header diffs, because the Connection Manager profiles are per account and need re-seeding.

**6. Anti-pattern: rollback-on-throw around `saveSettings`.**
- **Their code:** `profile-store.ts:36-51` puts the previous settings back only if `await saveSettings()` throws.
- **Why that cannot work:** ST's `saveSettings` catches its own fetch failure and shows a toast (`script.js:8096-8114`). It also silently re-schedules a debounced save when `!settingsReady` (`:8052-8055`). So their put-back is unreachable: it is the same class as our `saveMetadata` gotcha, one store over.
- **Ours:** we know this trap for chat saves (`saveEvidence`), but install-wide writes (`storyLibrary.ts:69,110,119`, `wizardSessions.ts:44,49`, `settingsStore.ts:135,161`) use `saveSettingsDebounced` with **no** evidence. A library save lost to a server error is silent. That is low-probability but it is the S12 library-loss shape.
- **Recommendation:** do not copy their try/catch. If anything, observe `/api/settings/save` the way `stHost/persistence.ts` observes `/api/chats/save`. Value is low unless a real incident shows up.

## Patterns to copy / anti-patterns to avoid
- **Copy:**
  - **Refuse a newer format** (idea 1).
  - **Exactly-one-match identity after acting**, rather than trusting the request (idea 4).
  - A **typed cleanup outcome** on a failed act (`not-needed|succeeded|failed`, `verified-install.ts:5`), because a leak should be reported by the operation that caused it. Our `so-assets` does this for the harness; product provisioning does not.
  - A **dedicated test account**, with destructive steps that skip themselves elsewhere (idea 5).
  - **Self-protection**: a manager that cannot act on itself (`self-protection.ts`). The analogue for us is the harness never deleting its own marker-less assets, which we already have.
- **Already ours, no change:** capability probes with degradation, write-ahead journal + reconcile, ownership ledger, hit-test before click, a responsive viewport sweep.
  - Their screenshot baselines (`toHaveScreenshot` at 5 viewports) are weaker than our DOM-geometry `so-responsive` for overflow findings. They would add value only for visual regressions, and SO's surfaces are not styled enough to justify baseline churn.
- **Avoid:**
  - A put-back guarded by `catch` around a host save that never rejects (idea 6).
  - A single-flight lock that **throws** on a second operation (`operation-lock.ts:33`). It is fine for explicit user operations. It would be wrong for anything on SO's boundary path, where work must be registered or queued (invariants 3 and 22), never rejected.
  - Relying on **fork-only host endpoints** (`/api/extensions/update-to`, `installExtension(..., commitSha)`). They do not exist in upstream ST 1.19. Their 404 fallback saves them; any seam we add must verify in `src/endpoints/*` first (invariant 2).

## ST host facts learned
All verified in `C:/dev/SillyTavern-MainBranch` (1.19.0, `7c3994196`).
- **Manifest `hooks`** can be `install|update|delete|clean|enable|disable|activate`, each naming an exported function of the manifest `js`.
  - ST `import()`s the same URL as the script tag, so it gets the same module instance. It calls the hook, races it against a **5000 ms timeout**, and **logs errors without rethrowing**: `public/scripts/extensions.js:406-467`. Their use: `manifest.json:11-19`.
  - `activate` fires after the script loads (`:634-638`).
  - `enable`/`disable` hooks run **before** the settings save + reload (`:473-500`).
  - `clean` is followed by a forced `saveSettings()` + reload after 1 s (`:1447-1452`). `delete` optionally runs `clean` first (`:1561-1568`).
  - `install` runs after a successful install (`:1771`), and `update` after an update (`:1389`).
- **Extension scripts load as `type="module"`** (`extensions.js:826`). To export hook functions, SO's bundle would need module output.
- **`minimum_client_version`** is compared with `versionCompare` at load. On failure the extension is not activated, and a named error goes to `extensionLoadErrors` (the `#extensions_details` button turns `warning`): `extensions.js:580-590, 658-660, 665`. Their use: `manifest.json:9`.
- **`saveSettings` never rejects.** It catches fetch/HTTP errors and toasts (`public/script.js:8096-8114`). It also silently defers to `saveSettingsDebounced` when `!settingsReady` (`:8052-8055`). `getContext()` exposes only `saveSettingsDebounced` (`st-context.js:35,132`), which is why they import `/script.js` (`runtime-host.ts:48`).
  - **Consistent with, not contradicting,** our `saveMetadata` gotcha. It extends that gotcha to install-wide settings.
- **Upstream `installExtension(url, global, branch = '')` has 3 parameters** (`extensions.js:1698`). The `commitSha` they pass (`runtime-host.ts:83`) is ignored upstream.
  - `/api/extensions/{capabilities,resolve,update-status,update-to}` are **not** routes in upstream `src/endpoints/extensions.js`, which has only install/update/branches/switch/move/version/delete/discover (`:92-480`). Their 404 fallback covers this (`sillytavern-host.ts:135,386`).
- **Third-party installs raise a confirm popup** unless the account-storage key `extensionInstallationWarningShown` is set (`extensions.js:1713-1738`). A scripted install stalls on it; their e2e clicks "Yes, install it" (`real-sillytavern.spec.ts:44-49`).
- **`POST /api/extensions/version` runs `git fetch origin` on every call** (`src/endpoints/extensions.js:423`). A non-git folder gets blank `currentCommitHash`/`remoteUrl` and `isUpToDate: true` (`:417`). It is fine for a one-off bug-report read, but never poll it.
- **`#extensions_details`** is the extension-manager button (`bootstrap.ts:69`, `runtime-host.ts:93`). This is a DOM anchor, not an API.
- **`Popup`/`POPUP_TYPE.DISPLAY`** are on the context, and `onOpen` receives the popup with its `dlg` (`runtime-host.ts:119-134`).

No fact here contradicts our gotchas.

## Verdict
Relevance **low**. This is a catalog and extension-lifecycle manager with no story, prompt or chat mechanics, so there is nothing for the engine, memory, extraction or stagecraft.

The one thing worth taking is **idea 1, the downgrade guard**. It is a real, cheap data-loss fix: a v5 blob read by 2.3.0 is replaced by an empty v4 blob (`persistence.ts:49-55` → `persistenceMigration.ts:23` → `persistence.ts:73-75`), and pinned-version installs of the kind Companion promotes make downgrades ordinary.

Ideas 2-3 are cheap host-integration hygiene: lifecycle hooks and `minimum_client_version`. Idea 4 closes an open gotcha. The listing itself ("submit SO to Tavernary") is a distribution decision, not a v2.4 item.
