# Documentation review

Reviewed all 44 Markdown files in scope, including all 33 guide pages, and compared the generated author pages with their source. Source checks were limited to relevant UI, settings, commands and feature behavior. No files were edited; no live model or browser session was run.

## Executive summary

- **Player: 5/10.** The guide explains the basic concept, but installation-to-play instructions and the player interface description disagree with the current workspace. Following the instructions requires guessing.
- **Author: 4/10.** There is extensive field coverage, but no complete first-story walkthrough. The generated reference assumes familiarity with the schema, runtime and development history.
- **Owner returning after weeks away: 4/10.** The setup path is more current than the surrounding documentation. Settings locations, scope, costs and some feature descriptions contradict one another.
- **The main problem is conflicting instructions.** Old settings sections, the new workspace, old Studio navigation and current feature controls coexist without explaining their relationship.
- **Cost and latency statements need correction.** Some pages promise a read after every reply; the default cadence is three. “Never while you wait” overlooks a documented and implemented three-second inner-voice wait.
- **Public author documentation contains private campaign material and internal evidence references.** These should be replaced with independent examples. This report deliberately does not reproduce that material.
- **Mechanical navigation checks pass, but usability does not.** No broken internal guide links or anchors were found, and all guide pages appear in navigation. However, nine links from player/setup pages lead to author pages hidden in the in-app reader. The only guide image is an unlabeled sketch.

## Findings by severity

### P0 — blocks a documented reader journey

#### P0-1. The primary player instructions describe the previous interface

**Locations:** [quick-start.md:47](../../../docs/guide/quick-start.md:47), [setup/README.md:17](../../../docs/guide/setup/README.md:17), [drawer-and-hud.md:23](../../../docs/guide/player/drawer-and-hud.md:23).

> “The panel starts with four tasks”  
> “In player mode it has two tabs.”

The extension slot now presents **Open Story Orchestrator**. The route icon opens the workspace, whose player page places memory inside **What the story remembers**. The documented Overview/Memory tab arrangement is no longer the primary player surface. See [index.tsx:272](../../../src/index.tsx:272), [index.tsx:330](../../../src/index.tsx:330) and [Workspace.tsx:55](../../../src/components/workspace/Workspace.tsx:55).

This breaks both “load my first story” and “find/edit a memory” when followed literally.

**Fix:** Replace the navigation instructions together, using complete paths:

- **Extensions → Story Orchestrator → Open Story Orchestrator → Orchestrator → Library → Start → Import a story**
- **This story → Play → What the story remembers**
- **This story → Features** for behavior; **Orchestrator → Connections** for models.

Rewrite the drawer page around the current workspace. Update the tour’s linked documentation in the same pass.

### P1 — serious

#### P1-1. Installation examples are not usable shell instructions

**Locations:** [quick-start.md:15](../../../docs/guide/quick-start.md:15), [setup/README.md:40](../../../docs/guide/setup/README.md:40), [contributing.md:11](../../../docs/dev/contributing.md:11).

> `echo <your SillyTavern folder> > .st-root`

In a Bash block, angle brackets are shell syntax. Paths containing spaces or Windows backslashes introduce further problems. The contributor sequence also supplies `--st-root` to staging only, although the preceding build needs the root.

**Fix:** Provide separate, concrete PowerShell and Bash examples, explicitly telling readers to replace the example path. For example:

```powershell
Set-Content -Path .st-root -Value 'C:\path\to\SillyTavern'
npm ci
npm run build
npm run stage
```

State the supported Node/npm versions, working directory and expected installation result. Keep one canonical installation procedure and link to it elsewhere.

#### P1-2. “Build a story step by step” does not build a story

**Locations:** [step-by-step.md:11](../../../docs/guide/author/step-by-step.md:11), [step-by-step.md:20](../../../docs/guide/author/step-by-step.md:20), [story.md:37](../../../docs/guide/author/fields/story.md:37).

> “List the handful of facts that decide where the story goes”  
> “Connect the beats with transitions.”

These are design tasks, not an executable tutorial. Readers receive no exact entries, complete JSON, import checkpoint or expected result. Even the required top-level `"format": 2` is missing from the story-basics field list; the parser requires it at [validate.ts:26](../../../src/engine/validate.ts:26).

**Fix:** Walk through one small, independent story with two scenes, one quality and one transition. Supply:

1. A complete importable file.
2. Equivalent current Studio steps.
3. A sample player message and reply.
4. The expected read, pending update and scene change.
5. One deliberately broken gate and its repair.

Label reference snippets as fragments and state where each belongs.

#### P1-3. Generated field pages contain exceptionally large instruction blocks

**Locations:** [lore-and-memory.md:28](../../../docs/guide/author/fields/lore-and-memory.md:28), [game-layer.md:70](../../../docs/guide/author/fields/game-layer.md:70), [characters.md:81](../../../docs/guide/author/fields/characters.md:81).

> “A curator book of 40 entries or more is read as a digest…”

The respective **What it does** bullets contain approximately **611, 587 and 535 whitespace-delimited words**. These mix setup, defaults, implementation limits, privacy, rollback, UI locations and exceptional behavior. Bullet formatting does not make them scannable.

**Fix:** Split each topic into **Use this when**, **Minimal example**, **Fields and defaults**, **During play**, and **Troubleshooting**. Move implementation details and measurement history out of the instructional path. Make these changes in [story-guide.md:368](../../../docs/authoring/story-guide.md:368) and regenerate.

#### P1-4. Private campaign content appears in public instructional examples

**Locations:** [story.md:94](../../../docs/guide/author/fields/story.md:94), [tracking.md:35](../../../docs/guide/author/fields/tracking.md:35), [tracking.md:37](../../../docs/guide/author/fields/tracking.md:37), [scenes.md:76](../../../docs/guide/author/fields/scenes.md:76).

> “Seen live:”  
> “the campaign”

Examples and explanations expose campaign-specific names, events and outcomes. Besides the privacy problem, readers cannot access the cited private material to understand or verify the advice.

**Fix:** Replace these with a small, explicitly fictional documentation setting. Preserve the technical lesson; move campaign evidence into the private evidence repository. Review the source guide as well as generated output.

#### P1-5. Read frequency and cost contradict one another

**Locations:** [memory-model.md:77](../../../docs/guide/setup/memory-model.md:77), [memory-model.md:89](../../../docs/guide/setup/memory-model.md:89), [setup-path.md:31](../../../docs/guide/setup/setup-path.md:31).

> “Reads normally run every reply”  
> “One read per reply”  
> “One memory model call every 3 replies”

The default is `cadence: 3`, with additional reads triggered by events. See [settingsModel.ts:195](../../../src/runtime/settingsModel.ts:195) and [scheduler.ts:422](../../../src/extraction/scheduler.ts:422).

Readers cannot estimate spending or decide whether delayed progress is normal.

**Suggested rewrite:**

> By default, the main story read runs every three character replies. Scene changes, authored cues and recovery work can request additional reads. Its results normally take effect after a later reply finishes.

Separate this from the costs of summaries, private intent, authoring and judge calls.

#### P1-6. The documentation understates reply latency

**Locations:** [setup-path.md:110](../../../docs/guide/setup/setup-path.md:110), [settings-reference.md:69](../../../docs/guide/setup/settings-reference.md:69), [troubleshooting.md:67](../../../docs/guide/player/troubleshooting.md:67).

> “never while you wait for a reply”

A missing private intent can be prepared at draft time, with a wait of up to **3,000 ms**. See [innerBeatHost.ts:25](../../../src/runtime/innerBeatHost.ts:25) and [innerBeatHost.ts:48](../../../src/runtime/innerBeatHost.ts:48). The author reference acknowledges this at [characters.md:54](../../../docs/guide/author/fields/characters.md:54).

**Suggested rewrite:**

> Private intent is usually prepared in the background. If the selected speaker has no fresh intent, preparing one can add up to three seconds before their reply.

Give a single latency explanation covering speaker selection, lore selection, private intent and local GPU contention. This requires correcting the description, not changing defaults.

#### P1-7. The settings reference omits a fourth scope: this device

**Locations:** [settings-reference.md:4](../../../docs/guide/setup/settings-reference.md:4), [setup-path.md:91](../../../docs/guide/setup/setup-path.md:91).

> “Settings apply to this whole install unless the control says ‘this chat’.”

Current display and animation preferences can be stored per browser and account. See [DevicePreferences.tsx:20](../../../src/components/workspace/DevicePreferences.tsx:20) and [deviceSettings.ts:6](../../../src/runtime/deviceSettings.ts:6).

The reference also retains old **Playing**, **Memory** and **Images** locations despite its claim to list where every control is.

**Fix:** Add a short scope guide:

| Scope | Purpose |
|---|---|
| Install | Model connections and feature defaults |
| Story | Author’s feature policies |
| Chat | Overrides for this run |
| Device | Display and animation preferences in this browser/account |

Add a scope column and current workspace location to the generated reference. Explain reset behavior with one worked example.

#### P1-8. Valid links become dead ends in the in-app reader

**Locations:** [settings-reference.md:63](../../../docs/guide/setup/settings-reference.md:63), [settings-reference.md:79](../../../docs/guide/setup/settings-reference.md:79), [guide/README.md:54](../../../docs/guide/README.md:54).

> “More”  
> “Author pages show there only in Author view.”

Nine links from player/setup pages target hidden author pages. The reader accepts navigation but cannot find the target among visible pages; it renders its missing-page state. See [search.ts:17](../../../src/guide/search.ts:17), [GuideReader.tsx:46](../../../src/guide/GuideReader.tsx:46) and [GuideReader.tsx:130](../../../src/guide/GuideReader.tsx:130).

**Fix:** Give operational topics such as speaker direction and lore switching player/setup explanations. Reading authoring documentation should also be independent of revealing the current story’s internals. Until that changes, gated links need an explicit explanation and usable alternative.

#### P1-9. Reloading is recommended while story changes remain unsaved

**Location:** [troubleshooting.md:44](../../../docs/guide/player/troubleshooting.md:44).

> “If it stays, check that SillyTavern’s server is running and reload the page.”

The save-health code deliberately retains pending state until a save lands; the notice can represent a known failed save. See [saveHealth.ts:17](../../../src/runtime/saveHealth.ts:17).

Reloading before persistence is restored can discard the changes the reader is trying to preserve.

**Fix:** Put recovery before reload:

> Keep this page open while restoring the server connection. Confirm that a subsequent save succeeds and the notice clears before reloading.

Document the supported way to retry or trigger that save. If recovery cannot be confirmed, explain how to preserve evidence before restarting.

#### P1-10. Troubleshooting lacks a usable decision path for “nothing happens”

**Locations:** [troubleshooting.md:9](../../../docs/guide/player/troubleshooting.md:9), [troubleshooting.md:19](../../../docs/guide/player/troubleshooting.md:19).

> “Check your model is running”  
> “write it happening in the chat”

The page does not adequately distinguish:

- No character reply.
- Replies arrive, but story reads fail.
- A read succeeded and updates are waiting.
- A scene remains active because its condition is unmet.
- A separate model role is unavailable.
- The request exceeds the server’s context.

Role outages and context mismatches have explicit checks at [checksSetup.ts:173](../../../src/runtime/checksSetup.ts:173) and [checksSetup.ts:192](../../../src/runtime/checksSetup.ts:192).

**Fix:** Lead with a symptom decision table containing **what to inspect**, **normal waiting behavior**, **next action** and **success signal**. Explain Repair’s one-at-a-time ordering and how to restore dismissed warnings. Keep author gate debugging as a separate escalation.

#### P1-11. The judge guide’s use table and measurement summary are incomplete

**Locations:** [judge.md:37](../../../docs/guide/setup/judge.md:37), [judge.md:60](../../../docs/guide/setup/judge.md:60).

> “Every use was measured…”

The table lists **18 uses**, while [settings.ts:7](../../../src/judge/settings.ts:7) declares **27**. Missing table entries include voice checking, divergence, canon verification/drafting, picture cues, adversity, idle/tone checks and repetition. Some receive scattered prose under the author reference’s House rules section.

The blanket measurement statement conflicts with qualifications elsewhere on the same page.

**Fix:** Generate the full use table from the registry. Include prerequisites, payload, timing, additional calls, fallback and current measurement status. Distinguish **enabled**, **configured**, **measured** and **currently usable**.

#### P1-12. Branching documentation contradicts the implemented controls and trigger

**Locations:** [moving-on.md:78](../../../docs/guide/author/fields/moving-on.md:78), [settings-reference.md:90](../../../docs/guide/setup/settings-reference.md:90).

> “There is no per-story switch yet.”  
> “you refused them twice”

A per-story `branching` policy exists at [featurePolicy.ts:31](../../../src/engine/featurePolicy.ts:31). The current divergence path uses judged committed actions; refusal recovery alone no longer triggers a branch. See [livingCoordinator.ts:260](../../../src/runtime/coordinators/livingCoordinator.ts:260). The longer explanation on the same reference page already says this.

**Fix:** Replace both descriptions with one consistent explanation:

> Adaptive branches can be controlled in Defaults, the story’s feature policies, or this chat’s Features. Branching responds to committed actions that fit none of the prepared routes. Asking questions or refusing a route does not by itself create a branch.

#### P1-13. The detailed lore reference gives obsolete capability advice

**Locations:** [lorebook-mechanics.md:323](../../../docs/guide/author/lorebook-mechanics.md:323), [lorebook-mechanics.md:345](../../../docs/guide/author/lorebook-mechanics.md:345), [story.md:96](../../../docs/guide/author/fields/story.md:96).

> “no create op in play”  
> “Lore-select ignores keys entirely”

Creation exists at [curatorWriter.ts:123](../../../src/runtime/curatorWriter.ts:123). The mechanics page itself describes keyword-based candidate exclusions at line 301, contradicting “ignores keys entirely.”

The requirements field description also omits story-scoped loading from its list of ways a required book becomes available; [requirementsRead.ts:38](../../../src/runtime/requirementsRead.ts:38) supports it.

**Fix:** Update the capability summary and requirements explanation. Explicitly say that listing/importing a story’s book normally lets Story Orchestrator load it for that story’s chats; selecting it globally is unnecessary.

#### P1-14. Several player features have only author implementation instructions

**Locations:** [playing.md:105](../../../docs/guide/player/playing.md:105), [drawer-and-hud.md:76](../../../docs/guide/player/drawer-and-hud.md:76), [lore-and-memory.md:143](../../../docs/guide/author/fields/lore-and-memory.md:143).

> “Finished stories”

There is no adequate player walkthrough for finished runs, carrying a run into a sequel/replay, People and Places, relationship labels, character promises or saving a living run as a story. Their registry documentation targets often point directly to author fields; see [carryFeatures.ts:13](../../../src/features/carryFeatures.ts:13) and [lifeFeatures.ts:27](../../../src/features/lifeFeatures.ts:27).

**Fix:** Add player instructions explaining where these appear, what choices mean, why a run might be absent and what Restart preserves. Keep schema details in the author reference.

#### P1-15. The recommended GPU setup is incomplete

**Locations:** [setup-path.md:81](../../../docs/guide/setup/setup-path.md:81), [gpu-sharing.md:25](../../../docs/guide/setup/gpu-sharing.md:25).

> `"adapter": "observe"` “to start”

The recommended adapter requires a model ID, upstream address and ComfyUI address. The parser rejects incomplete configuration at [config.mjs:38](../../../server-plugin/story-orchestrator-gpu/config.mjs:38). Yet the only full user-guide example is for `supervise`.

**Fix:** Provide a complete `observe` example and state its Unsloth API requirement. Explain which adapter fits an existing bare llama-server, where the reply profile points, and what successful status looks like.

### P2 — polish, consistency and reference quality

#### P2-1. Terminology changes too often, and internal provenance interrupts instruction

**Locations:** [author/README.md:7](../../../docs/guide/author/README.md:7), [how-a-story-plays.md:5](../../../docs/guide/author/how-a-story-plays.md:5), [good-practices.md:9](../../../docs/guide/author/good-practices.md:9), [characters.md:188](../../../docs/guide/author/fields/characters.md:188).

> “T4-2-1”  
> “plan 29 workflow bundles”  
> “Their GPU quality and timing are owed.”

The same concepts appear as scene/beat/checkpoint/turning point, bar/strip/HUD, and memory/reading/extraction model. Test IDs, branch names and implementation symbols add another vocabulary.

**Fix:** Define one reader term and one schema alias: “scene (`checkpoint` in JSON),” “condition (`gate`),” “tracked value (`quality`).” Define a boundary once as “a character reply finishing.” Move test provenance to contributor evidence. Replace “owed” with a specific user-visible limitation.

#### P2-2. Defaults and status labels mix stored values with effective behavior

**Locations:** [README.md:126](../../../README.md:126), [settings-reference.md:118](../../../docs/guide/setup/settings-reference.md:118), [setup-path.md:85](../../../docs/guide/setup/setup-path.md:85).

> “Off by default”  
> “Automatic”

The sprite stage is described both ways. Its raw stored default is false, but feature resolution treats an untouched install as automatic. See [featureResolve.ts:50](../../../src/runtime/featureResolve.ts:50).

**Fix:** Document the effective default as **Automatic: shows when the story directs the stage**. Keep raw persistence values out of the user-facing default column. Also distinguish “experimental” from “disabled.”

#### P2-3. Examples are numerous fragments, but few demonstrate an outcome

**Locations:** [tracking.md:22](../../../docs/guide/author/fields/tracking.md:22), [game-layer.md:97](../../../docs/guide/author/fields/game-layer.md:97), [setup/README.md:21](../../../docs/guide/setup/README.md:21).

> “Sketch of the settings panel”

There are useful fragments, but almost no paired **configuration → chat → visible result** examples. The only guide image is a 533-byte abstract sketch of rows, with no readable labels.

**Fix:** Add annotated current desktop and phone captures for Library/import, Play/Repair, feature scope and one Studio edit. Add worked examples for a scene transition, a public check and a curator review.

#### P2-4. The README becomes a 99-row catalog before explaining practical choices

**Location:** [README.md:48](../../../README.md:48).

> “Features”

The long generated table gives many features equal prominence, including advanced visual tooling. It is difficult to learn what is required, what incurs work and what to configure next.

**Fix:** Keep a short capability overview in the README. Link to the full catalog. Put requirements, first play, optional services and support ahead of exhaustive enumeration.

#### P2-5. Developer documentation describes removed builds and old defaults

**Locations:** [architecture.md:244](../../../docs/dev/architecture.md:244), [architecture.md:251](../../../docs/dev/architecture.md:251), [architecture.md:363](../../../docs/dev/architecture.md:363), [contributing.md:38](../../../docs/dev/contributing.md:38).

> “except `houseRules`”  
> “features beyond sealing stay off”  
> “`build:dev` writes the dev bundle”

These disagree with current defaults and available commands. Gates also run according to dependencies and concurrency, rather than the documented sequential “both builds” chain. See [gates.mjs:9](../../../scripts/release/gates.mjs:9).

**Fix:** Describe the current architecture first; keep historical additions in history. Remove unavailable commands and update defaults. The maintenance document is also an unlinked historical run record rather than a useful maintenance procedure: [companion-plugin-maintenance.md:19](../../../docs/dev/companion-plugin-maintenance.md:19).

#### P2-6. Companion-plugin pages are inconsistent entry points

**Locations:** [judge plugin README.md:12](../../../server-plugin/story-orchestrator-judge/README.md:12), [media plugin README.md:3](../../../server-plugin/story-orchestrator-media/README.md:3), [harness.md:85](../../../docs/guide/setup/harness.md:85).

> “Author services → Judge”  
> “Details… `server-plugin/.../README.md`”

The judge installation path is stale. Some pages link back to setup; others use plain repository paths that are not navigable links. Installation prerequisites are repeated unevenly.

**Fix:** Give every plugin README the same small opening: purpose, who needs it, install/enable/restart, configuration, success check and a linked user guide. Keep transport internals below that.

## Reader-journey assessment

| Journey | Where the reader gets stuck | Needed correction |
|---|---|---|
| Install → first play | Shell placeholder; old panel description; no current workspace screenshot; success described only as “the story follows” | One canonical installation procedure and a complete current first-play path with an observable success |
| First authored story | Design checklist assumes schema knowledge; no complete minimal file; outdated Studio map | A worked story, exact Studio entries and validation/play results |
| Turn a feature on/off and understand cost | Old locations; install/story/chat/device scopes scattered; cadence and latency disagree | Current feature-control guide, scope example and consistent call/latency descriptions |
| Diagnose nothing happening / Repair | Reply backend, background model, pending changes and unmet gates are insufficiently separated | Symptom decision tree and explicit recovery/success signals |

## Accuracy spot-checks

“Verified” means supported by the inspected implementation, not validated in a live session.

| Documentation claim | Verdict | Source check |
|---|---|---|
| Stories require a group chat — [playing.md:5](../../../docs/guide/player/playing.md:5) | **Verified** | [noGroup.ts:1](../../../src/runtime/noGroup.ts:1) |
| A one-character story also requires a narrator — [guide/README.md:7](../../../docs/guide/README.md:7) | **Wrong as a requirement** | Group creation accepts a nonempty cast; a narrator is optional: [makeGroup.ts:38](../../../src/runtime/makeGroup.ts:38), [provisioning.ts:126](../../../src/wizard/provisioning.ts:126) |
| The main read normally runs every reply — [memory-model.md:77](../../../docs/guide/setup/memory-model.md:77) | **Wrong** | Default cadence is three: [settingsModel.ts:195](../../../src/runtime/settingsModel.ts:195) |
| Default stability lag is zero — [settings-reference.md:47](../../../docs/guide/setup/settings-reference.md:47) | **Verified** | [settingsModel.ts:195](../../../src/runtime/settingsModel.ts:195) |
| Thinking budgets are Low 128, Medium 400, High uncapped — [memory-model.md:22](../../../docs/guide/setup/memory-model.md:22) | **Verified** | [replyEffort.ts:10](../../../src/runtime/replyEffort.ts:10), [replyEffort.ts:81](../../../src/runtime/replyEffort.ts:81) |
| Inner voice never runs while waiting for a reply — [setup-path.md:110](../../../docs/guide/setup/setup-path.md:110) | **Wrong** | Draft-time preparation can wait three seconds: [innerBeatHost.ts:48](../../../src/runtime/innerBeatHost.ts:48) |
| Several voices defaults to at most three — [settings-reference.md:75](../../../docs/guide/setup/settings-reference.md:75) | **Verified** | [schema.ts:192](../../../src/engine/schema.ts:192), [settingsModel.ts:223](../../../src/runtime/settingsModel.ts:223) |
| Curator is enabled, with review as default — [settings-reference.md:86](../../../docs/guide/setup/settings-reference.md:86) | **Verified** | [settingsModel.ts:210](../../../src/runtime/settingsModel.ts:210) |
| Every judge use defaults on — [judge.md:35](../../../docs/guide/setup/judge.md:35) | **Verified** | [settings.ts:87](../../../src/judge/settings.ts:87) |
| The local judge has no measured uses — [models.md:39](../../../docs/guide/setup/models.md:39) | **Wrong** | Memory pairs has a passed local calibration: [readiness.ts:152](../../../src/judge/readiness.ts:152) |
| Sprite stage defaults off — [settings-reference.md:118](../../../docs/guide/setup/settings-reference.md:118) | **Misleading** | Stored false; effective untouched-install policy is Automatic: [featureResolve.ts:50](../../../src/runtime/featureResolve.ts:50) |
| Install master-off wins; chat overrides precede story/default — [story.md:22](../../../docs/guide/author/fields/story.md:22) | **Verified** | [featureResolve.ts:66](../../../src/runtime/featureResolve.ts:66) |
| No per-story branching switch exists — [moving-on.md:78](../../../docs/guide/author/fields/moving-on.md:78) | **Wrong** | [featurePolicy.ts:31](../../../src/engine/featurePolicy.ts:31) |
| Two refusals alone can trigger an adaptive branch — [settings-reference.md:90](../../../docs/guide/setup/settings-reference.md:90) | **Wrong** | Current path requires judged divergence: [livingCoordinator.ts:260](../../../src/runtime/coordinators/livingCoordinator.ts:260) |
| Curator has no creation operation in play — [lorebook-mechanics.md:323](../../../docs/guide/author/lorebook-mechanics.md:323) | **Wrong** | [curatorWriter.ts:123](../../../src/runtime/curatorWriter.ts:123) |
| `/story guide [page]` opens the guide — [playing.md:138](../../../docs/guide/player/playing.md:138) | **Verified** | [slashCommands.ts:175](../../../src/runtime/slashCommands.ts:175) |
| `/cp` does nothing outside Author view — [macros-and-commands.md:43](../../../docs/guide/author/macros-and-commands.md:43) | **Verified** | [slashCommands.ts:58](../../../src/runtime/slashCommands.ts:58) |
| `/so-mem pin <n> on\|off` manages numbered memories — [macros-and-commands.md:35](../../../docs/guide/author/macros-and-commands.md:35) | **Verified** | Numbers resolve from the last list: [slashCommands.ts:40](../../../src/runtime/slashCommands.ts:40), [slashCommands.ts:117](../../../src/runtime/slashCommands.ts:117) |
| Chronicle export copies Markdown — [playing.md:133](../../../docs/guide/player/playing.md:133) | **Verified** | Clipboard with fallback: [chapterKit.ts:48](../../../src/runtime/chapterKit.ts:48) |
| `story_past_checkpoints` contains visited anchor names — [macros-and-commands.md:12](../../../docs/guide/author/macros-and-commands.md:12) | **Wrong** | Implementation includes visited, inactive checkpoints without an anchor filter: [macros.ts:11](../../../src/runtime/macros.ts:11), [snapshotBuilder.ts:462](../../../src/runtime/snapshotBuilder.ts:462) |
| Welcome-back threshold is eight hours — [playing.md:120](../../../docs/guide/player/playing.md:120) | **Verified** | [awayRecap.ts:3](../../../src/runtime/awayRecap.ts:3) |
| Feature selectors use `so-feature-<feature>-<control>` — [setup-path.md:94](../../../docs/guide/setup/setup-path.md:94) | **Verified** | [FeaturePolicyFields.tsx:38](../../../src/components/workspace/FeaturePolicyFields.tsx:38) |
| `plugin:install` and `plugins:install` both work — [setup-path.md:65](../../../docs/guide/setup/setup-path.md:65) | **Verified** | Both map to the same script: [package.json:34](../../../package.json:34) |
| `build:dev` produces `dist-dev/` — [architecture.md:363](../../../docs/dev/architecture.md:363) | **Wrong** | No such package script exists; current build is [package.json:13](../../../package.json:13) |
| Every floor/measurement used the described setup — [models.md:49](../../../docs/guide/setup/models.md:49) | **Unclear** | Historical measurement provenance cannot be established from implementation; the guide provides no directly usable evidence link for this blanket claim |

## Completeness gaps

These features are not wholly absent from the documentation; the gap is between being named and being usable.

| Existing capability | Documentation gap |
|---|---|
| Group story binding — [registry.ts:111](../../../src/features/registry.ts:111) | No clear player procedure for **New chats in … start with**, clearing it, or distinguishing it from this chat’s selected story |
| Device preferences — [deviceSettings.ts:6](../../../src/runtime/deviceSettings.ts:6) | No proper setup/reference explanation of browser/account storage and reset |
| Finished runs and carry — [carryFeatures.ts:6](../../../src/features/carryFeatures.ts:6) | Player choices and unavailable-run explanations live mainly in schema reference |
| People/Places, labels and promises — [gameFeatures.ts:43](../../../src/features/gameFeatures.ts:43), [lifeFeatures.ts:30](../../../src/features/lifeFeatures.ts:30) | Missing player-oriented reading and navigation instructions |
| Memory conflict/reconciliation controls — [MemoryTab.tsx:137](../../../src/components/drawer/tabs/MemoryTab.tsx:137) | No sufficient walkthrough distinguishing pinning, editing, locking and resolving a conflict |
| Experiments — [settingsModel.ts:107](../../../src/runtime/settingsModel.ts:107) | Registry points to the settings reference, but that page does not explain all experiment switches or their effects |
| Story policies for promises, witness and rumors — [featurePolicy.ts:26](../../../src/engine/featurePolicy.ts:26) | Missing from the supposedly enumerated Controls list at [story.md:23](../../../docs/guide/author/fields/story.md:23) |
| Additional judge uses — [settings.ts:7](../../../src/judge/settings.ts:7) | Missing or scattered payload, cost and fallback explanations |
| Current Studio navigation — [StudioModal.tsx:61](../../../src/studio/StudioModal.tsx:61) | The Studio guide’s flat tab table omits the current task groups and several editors |

Documented artifacts that no longer exist include the separate development build and the former primary settings/player navigation. Negative capability claims about branching policies and curator creation are also obsolete.

## Generated author pages: standalone verdict

They work better as expert lookup material than as standalone instruction.

The local contents lists and **What it does / Good / Bad / If wrong** pattern provide a framework, but the content frequently defeats that framework:

- A field heading starts with implementation filenames instead of the author’s decision.
- Fragments omit their containing object and dependent declarations.
- Required fields, defaults and limits are embedded in prose.
- Advanced material occupies the same visual level as the minimal configuration.
- Development evidence and campaign incidents interrupt the explanation.
- Newer sections combine several independent features under one topic, especially poses/presentation.

Keep stable field URLs and anchors, but rewrite each topic around a minimal valid configuration and an observable play result. Link to advanced behavior rather than putting every exception in the opening bullet.

## Structure and navigation

The existing internal links are mechanically sound. The read-only checks found:

- **33 guide pages**, all represented in navigation.
- **Zero broken internal guide links/anchors.**
- **Zero missing local Markdown-link targets** in the other scoped documents.
- **Nine links to hidden author pages** from player/setup pages.
- **One guide image**, with no annotated product screenshots.
- No inbound reference from the scoped entry pages to `docs/dev/companion-plugin-maintenance.md`.

Remote website availability and external links were not checked.

A better target contents structure would be:

| Section | Pages |
|---|---|
| **Start here** | Install and update; play the example; return to an existing story |
| **Playing** | Play workspace; starting/restarting/branching; memory; Journal and People/Places; finished stories and carry |
| **Configure** | Feature switches and scopes; model connections; costs and latency; judge; images/sprites; GPU sharing |
| **Write a story** | First complete story; wizard walkthrough; current Studio map; playtest and repair |
| **Author reference** | Story file basics; existing field groups; macros and commands; advanced lore mechanics |
| **Troubleshooting** | Nothing happens; Repair findings; model/context failures; save/reload recovery; bug reports |
| **Contributors** | Setup and gates; current architecture; style; companion-plugin maintenance |
| **Plugin administration** | Five consistently structured plugin READMEs, linked from setup |

Reduce duplication as follows:

- README: product introduction and entry links.
- Quick start: first successful play.
- Setup overview: a configuration map, without another installation tutorial.
- Setup path: optional capability progression after first play.
- Settings reference: exact controls, locations, scope, defaults and costs.

## Prioritized top-10 action list

1. **Replace stale navigation across quick start, player pages, setup and Studio documentation together.**
2. **Remove private campaign content from the public source guide and regenerate its pages.**
3. **Correct read cadence, latency and effective-default claims at their generating sources.**
4. **Publish one complete first-story tutorial with valid JSON and observable play results.**
5. **Restructure the largest generated field topics into short instructions, examples and reference tables.**
6. **Document install/story/chat/device scopes and regenerate the settings reference with current locations.**
7. **Resolve the in-app hidden-page dead ends and add player explanations for currently author-only documentation.**
8. **Rewrite troubleshooting around distinct symptoms; correct unsaved-state recovery before recommending reload.**
9. **Complete the 27-use judge reference and provide working GPU-adapter setup examples.**
10. **Add annotated current screenshots, then remove obsolete developer-build instructions and standardize plugin entry pages.**