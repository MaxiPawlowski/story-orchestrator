# Plan 24 — Image completion and acceptance

**Status (2026-10-05): IN BUILD; implementation D green; reference adoption and local reply smoke green ×2;
S32-1 measured ×2, keep overlay default off; Belle comparison pack awaiting user ratings; residency fixes and
real image/read/reply recovery green ×2; full image acceptance remains open.** Closes the open items of v2.7 17–21 and owns
their live acceptance. Overview: `00-overview.md`. Test plan: `16-test-plan.md`. Pilot record: `21-belle-image-pilot.md`.
Local residency and FreeToken (22–23) implementation is handed over; image-path integration defects are in scope
here (user, 2026-10-05).

**Gate tiers** (00-overview §Gate taxonomy). Implementation D; acceptance LT/LI (local text/image via the tray),
CL (existing DeepSeek director + second-model rater/Jev). Replies use local Artemis; image models use local ComfyUI.
No RunPod work or spend.

## Rules

1. **Inherited.** v2.7 rules 1–14, v2.8 rules where cited, every invariant in `.claude/rules/architecture.md`.
2. **Deterministic first.** A workstream's D rows green before its live rows; `npm run gates` is the D row, not a
   live sign-off.
3. **Image models stay on `C:`** (v2.7 rule 8 exception, user 2026-10-04). Nothing here copies, moves or downloads
   model weights. The model-roots config in `server-plugin/story-orchestrator-media/config.json` reads the existing paths.
4. **Group chats only** (v2.7 03); live rows on lanes 1+ (lane 0 untouched), dev build served
   (`npm run build:dev && npm run stage -- --flavor dev` then `st-session.mts reload`), images/sprites off unless the
   row turns them on.
5. **Evidence is a gate.** Live rows ×2 on the frozen candidate; runs archived under `test/measurements/v2.7/<ws>/`
   and `test/journeys/records/v2.7/<ws>/`; a leak fails the run.
6. **Findings** get an id `V27-24-<n>` with severity/class per v2.6 14 rule 3, a row here, and a deterministic
   regression check that then runs ×2.
7. **Floors are predeclared and never retuned.** S28 and S32 numbers below are frozen before the first run.
8. **No `so-*` control ships without a registry entry and Help line** (v2.7 rule 9); player copy free of schema words.

## Workstreams

### A. Image probes + Repair (v2.7 17)

Add a first-class `image` capability and the health-center rows the plan promised.

- `src/services/stHost/capabilities.ts`: add `image` to `CapabilityId` and `PROBES`. `imageProbe`:
  - route A: ST's Image Generation extension present and a source selected (`stImageReadiness()`); detail names the missing step;
  - route B: media plugin `/discover` reachable, ComfyUI reachable and the routed models present;
  - the director profile set or the non-LLM template in use;
  - the broker adapter state (`none`/`unsloth`/`managed`) when the GPU plugin answers.
  - `absent` cached for the page; `error` not cached, per the existing contract.
- `src/runtime/checks.ts` (+ `src/runtime/checksSetup.ts`): extend `RepairArea` with `image` and register:
  - `images-on-no-service` — `blocks`, `scope: install`, `audience: setup`; Show me → `#so-image-settings`.
  - `image-route-model-missing` — `degrades`, `audience: author`; target the route select; detail names the model file.
  - `gpu-broker-no-text-model` — `info`; the broker is installed but its adapter is `none`, so images pass through.
  - `look-sprites-missing` — `info`, `audience: author` (owned with B/D; a visual card field with no set and no
    on-demand backend).
- Registry + fixture gates: every new check fires at least once in `checksRegistry.test.ts`, every `feature` names a
  real registry entry (`images`, `sprites`, `sprite-builder`), consequence copy present, `player` copy clean.
- Storybook: the image empty states and Test render (`src/image/ImageGroup.stories.tsx` and a new
  `stImage`-refusal story); 390/768/1440, a11y.

**Gate:** D (`npm run gates`).

### B. Sprite/asset lifecycle (v2.7 18, 20)

Close the ownership/cleanup gap the pilot recorded as open (manual guarded removal exists today).

- Ledger: `server-plugin/story-orchestrator-media/files.mjs` label rows gain `chats[]`. Add routes
  `/sprites/touch-chat` (add/remove one chat id) and `/sprites/sweep` (a set referenced by no chat is deleted
  label-by-label; ownership-checked; never an unledgered file). All per-user.
- Reaper: a chat-delete hook (mirror-reaper precedent, `src/runtime/mirrorReaper.ts` / `mirrorReaperHost.ts`) removes
  the deleted chat id and, when the last reference goes, offers deletion through the same accept mode as the mirror
  reaper (never silent).
- Crash-resume: on hydrate, reconcile manifest `status: "pending"` rows against disk (hash match → complete; else
  delete); a killed write leaves no half-state; test with a process killed mid-write.
- `scripts/debug/so-assets.mts`: list/remove generated sprite sets by marker **and** ledger, baseline-aware,
  test-session-scoped (including `anim-*` folders), extending the wizard asset scope rules.
- In-product author action "Remove generated sprites for this story" (author view).
- Media plugin `/prune`: drop stale per-user reference inputs under ComfyUI `input/story-orchestrator/` that no
  ledger row references.

**Gate:** D; LI (delete a referencing chat → the unreferenced set is offered/deleted; `so-assets.mts assert-clean`).

### C. Author controls (v2.7 20, 18)

- Adopt existing expression packs as protected references: inventory and hash their images, validate transparency,
  select the expression-specific reference (neutral fallback), and save builder settings without claiming ownership
  of the original files. Existing packs need no generated-asset manifest. Generated looks use separate owned sets.
- Studio editors: `RosterEditor`/`StoryEditor` gain a per-member `card.fields` editor (field id → quality, `visual`)
  and `CheckpointEditor`/`EffectsEditor` gain `effects.card` (owner → field → value), reusing the quality picker and
  the `so-roster-*` idioms.
- Studio Sprites "Build base from card art": render up to four base candidates from the card image, alpha-cutout via
  the installed ComfyUI-RMBG (`RMBG` node) or `SplitImageWithAlpha`, author picks one (ports the campaign base-pick
  heuristics as a `base` recipe). Keeps the existing "edit an existing transparent reference" path.
- Read-only ledger mirror for bound card fields in the drawer (author view).
- Scope priority by newest-reply speaker (the rotation already prevents starvation; ordering is the change).
- Storybook for each new control; registry entries; consequence copy.

**Gate:** D; base creation LI (four candidates + alpha, author picks, QA passes).

### D. S28 talking sprites (v2.7 19)

- **Build:** 3 characters (variety: glasses, long hair over the eyes, a non-human face) × default set ×
  `neutral/happy/angry/worried` × `blink/talk/talk2`, in both arms (**edited from each label's sprite** and **from the
  neutral base**); record seconds per edit and QA pass rate.
- **Blind packs** (extend `so-session rating-pack` / the existing sprite tooling): static / procedural-only /
  2-frame / 3-frame; unlabelled, shuffled.
- **Runtime:** 3 actors on stage, streaming a real reply on local Artemis.

**Floors (predeclared):** ≥90% frames pass QA on the first seed; B+P (either mouth arm) preferred over today in ≥70%
of pairs; seam or pop visible in ≤5% of rated clips; 2-vs-3 arm preferred in >50% sets the `mouth` default (tie →
`simple`); no task >50 ms; animator ≤1 ms/frame; decoded stage memory ≤64 MB; layout/paint on overlays only; lazy
chunk grows ≤4 KB.

**Gate:** LI (frames) + streamed LT (runtime). Evidence: `test/measurements/v2.7/s28/`.

### E. Living-cards S32 (v2.7 20)

- **S32-1** (LT): synthetic 3-member group, one visual change mid-scene (card says X, overlay says Y), 10 replies
  after each change, N=30/arm; arms depth 1 / depth 4 / no block; second-model rater; replies that never mention it
  excluded and counted. Run **×2, inside this plan, before the default/depth decision**. **Floor:** ≥90% of mentioning
  replies agree with Y and ≥15 mentioning replies per arm; the baseline arm must be worse. Pass → `cardOverlay`
  defaults on at the winning depth; below floor → the switch stays off and the overlay serves visuals only.
- **S32-2** (LI): 5 looks × neutral + 3 expressions on local ComfyUI; rater ≥90% "same character" and ≥90% "changed
  attribute visible"; time-to-first-frame recorded (no floor; never blocking).

**Gate:** LT (S32-1, local Artemis) + LI (S32-2). Existing cloud director/judge/rater roles stay permitted.

### F. Local residency integration

Verify the completed controller on the actual Studio base, sprite and on-demand paths. Image/live rows record text
wait and lease ordering. Fix reproducible controller/cache/broker defects with regression evidence; retain the
2048 MiB GPU / 4096 MiB physical-RAM reserves and exclusive lifecycle ownership. Real story extraction must resume
after a lease and reach its audit/boundary, rather than relying on a transport-only request.

### G. Docs, test plan, acceptance

- `16-test-plan.md`: add 17–23 rows to §Per plan and §What v2.7 does NOT prove, owners now this plan; note the moved
  tier ownership (rules 13–14).
- Reconcile the `v2.8/24-test-plan.md` rows that cite the image track.
- Regenerate the settings reference and README feature table; check the guide pages against the shipped UI;
  "What's new" for the image/local features.
- Archive every gate record + run; `npm run gates` from the main checkout on the frozen candidate; live rows ×2.

## Sequencing

Finish B ownership/harness cleanup and C existing-pack adoption → C remaining controls → E (LT/LI; decide overlay
depth/default before freeze) → C base-from-card → route A/B and three-character sprite acceptance → D (S28) → G.
Run `npm run gates` before live acceptance; archive two consecutive runs on the final candidate. No automatic commits.

## Acceptance floors (predeclared, never retuned)

| Surface | Floor |
|---|---|
| S28 QA | ≥90% frames pass QA on the first seed |
| S28 preference | B+P > today in ≥70% of pairs; seams ≤5% |
| S28 mouth | 2-vs-3 winner sets the default (>50%; tie → simple) |
| S28 runtime | no >50 ms task; ≤1 ms/frame; ≤64 MB decoded; ≤4 KB chunk |
| S32-1 | ≥90% agree with Y; ≥15 mentions/arm; baseline worse |
| S32-2 | ≥90% same character; ≥90% changed attribute visible |
| Shared-GPU integration | record text wait and lease ordering; fix reproducible controller defects |

## Evidence and archive

| What | Where |
|---|---|
| gate records | each workstream section here |
| live runs that green a gate | `test/journeys/records/v2.7/<ws>/`, `test/measurements/v2.7/<ws>/` |
| S28 blind packs | `test/measurements/v2.7/s28/` (packs stay `pending` until rated) |
| findings | this plan, `V27-24-<n>` |

## Risks and unresolved

- The controller remains the single lifecycle owner; image-path residency defects are in scope here.
- Base-from-card alpha quality (C) is unmeasured; the campaign `render_sprites.py` is the reference.
- S32-1 proves the local Artemis setup; retain every arm and the ×2 denominator.
- Remote-ComfyUI fingerprint helper: default is a documented refusal (the local server refuses a file it cannot
  fingerprint); revisit only if a remote controller is actually used.
- `CARD_SCOPE_CAP` and the scope-ordering change interact with v2.8 20's relationship fields; keep the rotation test.

## Decisions (user, 2026-10-04)

1. Include the remaining v2.7 20 (living-cards) work (it is partially built), rather than skip it.
2. Run the live image acceptance locally now (LT/LI/CL; RP only for S32-1), not deferred to v2.8 01.
3. S28 is pilot-only (the 3-character spike), not the full Adolion render.
4. The v2.8 01 O3–O6 image rows stay with v2.8 01; they are not folded in here.
5. Local residency (F) is sequenced last.
6. Supersedes 5 (user, 2026-10-04): local residency and FreeToken removed from this work; another agent owns them.
7. User, 2026-10-04: no pod; local Artemis replies and local image models. DeepSeek and Jev keep their existing roles.
8. User, 2026-10-04: proceed with existing-expression-pack adoption, living-card completion and local acceptance.
9. User, 2026-10-05: residency implementation handed over; fix bugs that block image completion here.
10. User, 2026-10-05: user rates regular expression sprites against two-frame and three-frame talking sprites.
    Shuffled blind pairings use the same reply, expression sequence, framing, background and duration. Regular uses
    existing expressions/breathing without mouth frames; the animated arms share blink/idle behavior. Include regular
    versus two, regular versus three, and two versus three. Record preference/tie, seams/flicker/pop and expression
    preservation. Belle covers neutral/happy/angry/worried first; supporting characters cover the declared variety.
    Visual gates remain pending until the user rates. Existing S28 floors and tie-to-simple rule unchanged.
11. User, 2026-10-06: replace blind pairings with all three labeled modes simultaneously. Expression selector,
    synchronized replay/pause/framing, looping playback. Qualitative user review, no A/B arena. Supersedes decision
    10's presentation; labeled choices are not passed off as the old pairwise-floor measurements.

## Completion replan — 2026-10-05

1. Reproduce base creation on the current controller; fix V27-24-5 if present, then base creation/save/cleanup LI ×2.
2. Resumable S32-2 matrix: five Belle looks × four expressions, independent identity/change ratings, text-priority
   evidence, look supersession/reopen/rollback/new-chat controls, original-art hash inventory. Keep S32-1 keep-off.
3. Three-character expression acceptance and S28 matrices: both reference arms, first-seed QA/timings, blind user
   packs, real local streaming desktop/mobile performance, missing frames and reduced motion. No full campaign render.
4. Route A/B/template/director, owned cancellation/cleanup and clean-host acceptance.
5. Reconcile older plans/Help/settings reference/What's-new; freeze, full gates and archived repeated live checks.

Unresolved: user visual ratings are required after packs are delivered; S28 defaults cannot be promoted beforehand.

## Gate record

### Workstream A — image probes + Repair (2026-10-04)

Built:
- `stHost/capabilities.ts`: `image` capability (`imageProbe` — SillyTavern's own service, else the media plugin's ComfyUI; a reachable plugin whose ComfyUI fails is `error`, not cached). `mediaStatus()` (`stHost/media.ts`) and `gpuBrokerStatus()` (`stHost/gpuBroker.ts`).
- `runtime/imageHealth.ts`: the pure read-model; `snapshot.imageHealth`; published by `StoryImageDirector.refreshHealth()` on start and settings change, cleared on stop.
- `runtime/checks.ts` + `checksSetup.ts`: area `image`; `images-on-no-service` (degrades), `image-model-missing` (degrades), `gpu-broker-no-text-model` (info). Registry fixture, counts and install lists updated.

Deviation from the plan text: `images-on-no-service` is **degrades**, not `blocks`. A missing image service does not stop the story, and `blocks` is reserved for "the story does not advance"; the images feature is optional in Getting started. Recorded here for the next reader.

Commands (all green):
- `npm run typecheck && npm run typecheck:test && npm run lint`
- `npx jest` — 6376 passed, 1 skipped
- `npm run test:debug` — 987 passed

Not yet run (belongs to the Live rows): no live image gate; the capability shows in Diagnostics, the Repair rows cover service/model/broker state.

Storybook: the image empty states already ship (`ImageChatPanel.stories.tsx` — `PausesThisChat` with no jobs, `InstallOff`; `ImageReviewGrid.stories.tsx`). No new story needed for the capability (Diagnostics renders every `CAPABILITY_IDS` entry).

### Workstream B — sprite/asset lifecycle (2026-10-04, partial)

Built:
- Crash-resume: `reconcileSet` (`media/files.mjs`) reconciles a manifest's `status: "pending"` rows against disk under the set lock — a landed matching file completes the row, anything else drops the row and its partial file. Wired into `/sprites/read` and `/sprites/list`, so a hydrate reconciles. Test: `media.test.mjs`.
- Story-scoped removal: `removeStorySprites` (`media/files.mjs`) + `/sprites/remove-story` + host `removeStorySprites` (`stHost/media.ts`) + an author control in the sprite settings (`#so-sprite-remove-story`, confirm popup). It removes only labels whose `inputs.story` matches, and deletes a set left empty; a label with no story (a base pack) is never in scope. Test: `media.test.mjs`.

Deviation from the plan text: the proposed chat-keyed `chats[]` reference counting + chat-delete reaper is **superseded by the explicit, author-confirmed, story-scoped removal**. Generated sets are story-derived caches (`look_<hash>` keyed by story + member + fields + base hash, `builder/onDemand.ts`), reused across the chats that play that story, so a chat-delete trigger cannot tell a shared set from a chat-owned one and would risk deleting art. `inputs.story` gives exact scope, and the confirm keeps it from ever being silent. Recorded for the next reader.

Deferred within B:
- `so-assets.mts` generated-set scope: generated sprite sets carry no wizard ledger and their names are author-chosen, so marker scoping cannot catch them; it needs a sprite-inventory baseline (a later harness task).
- Media plugin `/prune`: ComfyUI exposes no input-directory listing and the plugin holds references only in memory, so a prune has nothing authoritative to read.

Commands (all green):
- `npm run typecheck && npm run typecheck:test && npm run lint`
- `npx jest` — 6376 passed, 1 skipped
- `npm run test:plugin` — 100 passed, 3 skipped
- `npm run test:debug` — 987 passed

Not yet run: the LI row (delete a referencing chat / remove-for-story against a live media plugin + ComfyUI).

### Workstream C — author controls (2026-10-04, partial)

Built (card-field authoring):
- `engine/cardFields.ts` (pure): `cardQualityEligible` (the rule `indexCardFields` enforces — a non-latching extractor string or enum), `boundCardQualities`, `declaredCardFields`.
- `studio/mutations.ts`: `setMemberCard(draft, owner, card)` (roster id or `player`; an emptied card is dropped). `setMemberCard` is listed in `MUTATIONS_WITHOUT_A_TOOL` — an agent tool for card fields is a later step.
- `CardFieldsEditor.tsx`: per-entity field→quality bindings with a "changes the picture" flag; wired into `RosterEditor` for each member and for the player card.
- `EffectsEditor.tsx`: a "Card changes" section that reads the declared fields (enum values offered as options), wired from `CheckpointEditor`.

Tests: `mutations.test.ts` (bind/drop, player card, eligibility, helpers) and two `RosterEditor` stories.

Deferred within C: build-base-from-card (four candidates + alpha cutout via ComfyUI-RMBG), the read-only ledger mirror of bound card fields in the drawer, and scope priority by newest-reply speaker.

Commands (all green):
- `npm run typecheck && npm run typecheck:test && npm run lint`
- `npx jest` — 6381 passed, 1 skipped
- `npm run test-storybook:ci` — 85 suites, 512 tests passed
- `npm run test:plugin` — 100 passed, 3 skipped; `npm run test:debug` — 987 passed

Note: `StoryImageDirector.refreshHealth` now calls `manager.touch?.()`, so the Storybook fake managers (which predate the image-health slice) stay valid.

### Workstreams B/C/E — completion slice (2026-10-05)

Built:
- Protected existing-pack adoption: `/sprites/reference-sets` and `/sprites/reference-pack` read original PNGs and
  fingerprint their bytes; they never create a generated manifest. Studio's ReferencePackPicker validates alpha,
  content and stability, then saves builder settings. On-demand edits need no generated base manifest, verify the
  selected reference before rendering and the pack again before saving, and refuse externally changed cached files.
- Generated inventory + `so-assets` scope now cover look sets, animation labels and temporary references. A trusted
  baseline protects every prior label/reference; marker scope also follows the generated row's story. Removal is
  serialized and deletes only hash-matching recorded files. An emptied generated folder containing foreign art is kept.
- Temporary references have a per-user write-ahead ledger. Release runs in the builder's `finally`; GPU release still
  runs if reference cleanup fails. Local prune uses explicit owned names, recorded hashes and an idle Comfy queue.
- Base-from-card: four seeded preview attempts, installed/fingerprinted alpha removal, author keeps one neutral base.
  No downloads. `qwen21-card-base` v2 inserts `SplitImageWithAlpha` before RMBG/BiRefNet; the first live v1 render exposed
  the RGBA/three-channel-normalization mismatch. Installed BiRefNet_toonout files reused through plugin config.
- Latest-speaker/mentioned-member card scope priority, retaining the 8+4 rotation. Author current-state mirror with
  provenance in the drawer. The mirror is snapshot-only: it adds no second ledger prompt injection.
- `look-sprites-missing` author info check, chat-owned and cleared on recovery. On-demand edits yield to every active
  or queued text request before starting another edit. Controller implementation remains external.

Commands:
- `npm run gates` — **all 12 steps green**, full Storybook. Jest 534 suites / 6,392 passed, one skipped; debug 1,026
  passed; plugin 104 passed / three intentional skips; release 94 passed / two skips; defect replay 32/32 killed;
  Storybook 87 suites / 517 passed. Prod main 1,220,696 B, budget unchanged at 1,250,000 B.
- `npm run debug:typecheck` and the targeted plugin/builder/scoring tests — green.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-scenario.mts run test/scenarios/v27-existing-expression-reference.json --sandbox --group 1791068844825`
  — green ×2 (additional consecutive repeats); 16 original Belle expressions, SHA256
  `fb5a7d17b6a492b1e78a35d5a575a06a4c7b124f97fb3b8dc0bac6ce7e37df2a` unchanged; generated ownership unchanged;
  settings restored; sandbox/library cleanup verified. Run-header diff: zero differences, zero warnings on the dev build.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-scenario.mts run test/scenarios/v27-local-card-reply.json --sandbox --group 1791068844825`
  — green ×2: actual request used `llamacpp` → `http://127.0.0.1:18888`, carried applied green hair, author mirror
  agreed; non-empty replies (254/198 characters), both mentioned green. This is plumbing, not the S32 denominator.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-living-cards.mts run --round 1` and `--round 2` — complete
  three-member runs, 30 scored replies per arm, cleanup clean. Local Artemis; independent DeepSeek rater. Fixtures
  seed the same three authored memory facts in every arm; actual requests assert the memory baseline and overlay arm.
- `node scripts/debug/so-living-cards.mts score test/measurements/v2.7/s32-1/round-1/report.json test/measurements/v2.7/s32-1/round-2/report.json`
  — **keep-off** (decision complete, no promotion). Archive: `test/measurements/v2.7/s32-1/`.

| S32-1 | Memory-only | Depth 1 | Depth 4 |
|---|---:|---:|---:|
| Round 1 agreeing / mentioning | 22/30 (73.3%) | 30/30 (100%) | 30/30 (100%) |
| Round 2 agreeing / mentioning | 30/30 (100%) | 30/30 (100%) | 30/30 (100%) |
| Excluded | 0 | 0 | 0 |

The baseline was not worse in round 2. The predeclared ×2 comparison therefore does not promote either depth;
`cardOverlay` stays default off. No floor retuned. On-demand generation remains default off pending S32-2.

Image live gate:
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-scenario.mts run test/scenarios/v27-card-art-base.json --sandbox --group 1791068844825`
  — **NOT green**. First v1 candidate failed in BiRefNet (`tensor a (4)` versus `tensor b (3)`); graph corrected to v2.
  Rebuilt/staged/restarted the owned lane; the v2 run's four candidates were refused by the managed controller:
  `ComfyUI accepted free but its model memory has not been released; text will not race the release.` Both runs left
  no sprite/reference residue. Do not call the RGB fix live-proven yet. Controller follow-up is owed to the other agent.
- No pod, model download or weight move. Lane 0 untouched. Lane 6's temporary main-profile `api: generic → llamacpp`
  was restored to generic and the selected DeepSeek profile restored after text measurements.

Findings:

| ID | Class / severity | Observation | Disposition |
|---|---|---|---|
| V27-24-1 | harness / minor | Reference check left Studio open; it intercepted the following Send | reference helper closes Studio/drawers; local reply guard refuses an open Studio; subsequent live replies green ×2 |
| V27-24-2 | harness / minor | Initial S32 driver used a nonexistent memory getter; a later command budget interrupted a partial round | snapshot read fixed; recovery file and explicit cleanup command added; partial samples excluded; two full rounds archived |
| V27-24-3 | product / major | Story removal recursively deleted an otherwise empty generated set, including unledgered art | only recorded labels removed; unrelated files kept; plugin regression green |
| V27-24-4 | product / major | Base graph passed RGBA into BiRefNet's three-channel normalization | split RGB before alpha removal; base recipe v2; deterministic graph regression green, LI recheck blocked |
| V27-24-5 | integration / blocking LI | Managed controller refuses Comfy memory reclamation after the edit/cutout path | external residency owner; no reserves or admission rules changed here |

Still owed here: route A/B/template/director and clean-host acceptance; base LI ×2 after reclamation is fixed;
three-character sprite identity/expression ratings; S28 generation/blind/performance matrix; S32-2 five-look ratings;
final guide/settings-reference/What's-new reconciliation. The image track is **not accepted**.

Handover verification (2026-10-05): full `npm run gates` rerun after the RGB fix and Help-copy correction — all 12
steps green, counts unchanged. Final prod main `173b478706ec` = 1,220,666 B. `npm run stage` restored the ST slot to
prod; owned lane 6 stopped. `git diff --check` green after removing the extraction helper's trailing blank line.
No commit/push. The controller refusal reproduced on the rebuilt v2 graph; no image row promoted around it.

### User comparison and residency integration — 2026-10-05

User owns the visual verdict. Delivered offline blind pack:
`test/measurements/v2.7/s28/belle-user-pack-v3-run2/index.html` — 12 shuffled pairings, original Belle
neutral/happy/angry/worried versus two/three mouth frames. The shipped `AnimatedFace`/`StreamActivity` render identical
scripted speech timing; regular has no mouth/blink frames, both animated arms share blink/breathing. Full/thigh/close
framing applies to both panels. Preference/tie, per-side seams and expression preservation are downloaded as JSON;
unrated/incomplete answers never score green. This is a Belle visual pilot, not the full S28 or live performance gate.

Built tooling: `so-sprite-comparison.mts` (frame/look matrices, pack, check, independent look ratings, user scoring),
`lib/spriteComparison*` (seeded pairings, strict denominators, player), `so-image-runtime.mts` (real story read queued
behind on-demand edit, next reply/boundary, guarded sandbox cleanup). Base helper now varies/records seeds; initial
same-seed repeats are not used as independent render evidence.

Residency fixes:
- `V27-24-6`: after nine safe Qwen edits, learned GPU demand reached 22691 MiB because it multiplied the observed
  peak by 1.2, then admission added 2048 MiB again. Footprint revision 3 records additional peak + 512 MiB uncertainty;
  the fixed 2048 MiB reserve still applies. Revision-2 budgets stay historical; new budgets need two valid observations.
- `V27-24-7` / follow-up to `V27-24-5`: verified RAM was still floored at the conservative loader estimate. A repeated
  look batch stalled at reclamation despite released GPU memory. Same-runtime verified RAM now replaces the estimate;
  an explicit caller demand remains a floor. Unknown/unverified runtime, missing telemetry and actual reserve misses
  still refuse. Physical-RAM reserve remains 4096 MiB. Regression includes the unchanged reserve refusal/control.
- `V27-24-8` (harness): a new expression edit started off the reply while runtime cleanup removed its reference.
  Cleanup now waits for cancelled owned work/lease to settle before scoped removal. Failed record preserved, residue
  removed through `so-assets --marker SO-V27-LIVELOOK`; following runs clean.

Commands/results:
- `node --test "scripts/local/*.test.mjs"` — 61/61 after both accounting fixes.
- `npm run debug:typecheck` and `node --test scripts/debug/lib/spriteComparison.test.mts` — clean / 4/4.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-scenario.mts run test/scenarios/v27-card-art-base.json --sandbox --group 1791068844825`
  — two distinct-seed runs green; four alpha candidates each, identity 8/8, usable framing 7/8, chosen base saved and
  removed cleanly. Archive: `test/measurements/v2.7/image-completion/base/round-{1,2}.json`.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-sprite-comparison.mts build --out test/measurements/v2.7/s28/belle-user-pack-v3-run{2,3}`
  — 12/12 frames pass first seed each; original pack hashes unchanged, settings/reference cleanup clean. First
  accounting-failure batch and offline-discovery attempt remain archived separately; neither counts as passing.
- `node scripts/debug/so-sprite-comparison.mts pack --out test/measurements/v2.7/s28/belle-user-pack-v3-run2`
  and `check --out ...` — pack built; all 12 pairings decode at 1440×1000 and 390×844, no overflow/page errors.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-sprite-comparison.mts looks --out test/measurements/v2.7/s32-2/round-{3,4}`
  and `rate-looks --out ...` — complete 20-image matrices on the final controller, independent DeepSeek identity,
  change visibility and expression preservation 20/20 each in both runs. Earlier successful round 1 retained; failed
  round 2 (seven reclamation refusals) is not acceptance. These exercise the production look builder; cache/reopen/
  supersession/rollback and exact text-wait bound still need their own matrix before S32-2 closes.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-image-runtime.mts` — two final runs green, own real manual
  audit count increases, observed `imageLease=true`, `waitingText>0`, `activeText=0`; look saved, next local Artemis
  reply commits boundary, original SHA256 unchanged; settings/profiles/chat/library/generated/reference cleanup clean.
  Final records: `test/measurements/v2.7/image-completion/runtime/run-1791225242916.json` and
  `run-1791225432180.json`. Controller `9247e0d271ae`.
- `npm run gates` — all 12 green, full Storybook; Jest 6392 passed / one skip; debug 1033 passed; release 94 passed /
  two skips; defect replay 32/32 killed; plugin 104 passed / three skips; Storybook 517 passed. Prod `173b478706ec`,
  dev `221d7e7a1dc7`. Log: `test/measurements/v2.7/image-completion/gates-2026-10-05.log`.

Still open: user visual ratings; full S28 multi-character/from-neutral/preference/performance matrix; three-character
expression acceptance; S32-2 lifecycle/text-wait matrix; route A/B/template/director/clean-host acceptance; final
Help/settings-reference/What's-new reconciliation. No mouth/on-demand default promoted. Image track NOT accepted.

Handover: `node scripts/debug/st-lanes.mts stop 6` stopped the owned lane; `npm run stage` restored the ST slot to
prod. `npm run debug:typecheck` and `git diff --check` clean after the archive command. No commit/push. Offline rating
pack needs neither lane nor model. Summary: `test/measurements/v2.7/image-completion/2026-10-05-user-rating-handover.json`.

Visual follow-up (user asked whether all three actually work): the initial handover had checked loading/layout,
not systematically reviewed every frame. Added `so-sprite-comparison.mts review --out
test/measurements/v2.7/s28/belle-user-pack-v3-run2`: all 12 pairings display the expected one/two/three distinct mouth
states. `agent-playback-review.json` records the check. Directly inspected `agent-contact-sheet.png` (all four
expressions, original/blink/half-open/open composites): eyes close, mouth openings differ, original expression/pose
remains recognizable, no obvious static compositing seam. Open mouths are exaggerated on some expressions; static
inspection does not prove natural motion or the S28 seam/preference floors. User votes untouched and still pending.
`npm run debug:typecheck` clean. No product/default changes.

### Labeled review — 2026-10-06

Rebuilt the same offline `index.html` with Regular / Two-frame / Three-frame together, four-expression selector,
shared framing, replay/pause and default-on looping. Human feedback is per expression/mode; separate local-storage
key preserves earlier blind progress, exported JSON declares `labeled-sprite-review`. Scoring reports preferences
and completion, never promotes defaults or claims the previous pairwise floors. Original rendered assets reused.

Checks:
- `npm run test:debug && npm run debug:typecheck && git diff --check` — 1034/1034; typecheck/diff clean.
- `node --test scripts/debug/lib/spriteComparison.test.mts` — 5/5, including incomplete/duplicate labeled reviews.
- `node scripts/debug/so-sprite-comparison.mts pack --out test/measurements/v2.7/s28/belle-user-pack-v3-run2`,
  then `check --out ...` and `review --out ...` — green. Four expressions × three labeled panels; 1440×1000 and
  390×844 layout/decode/export checks pass (mobile panels scroll within their strip). All expressions show the
  expected one/two/three mouth states; shared pause/replay/loop controls verified. Desktop screenshot directly reviewed. Initial exact-selector check caught
  missing explicit select names; labels corrected, checks rerun. User verdicts remain pending.

Plan 26 follow-up: `26-sprite-quality-and-speed.md` owns the approved mouth-mask/cache/timing enhancement and its
2026-10-06 gate record. Repaired 512/20 two-frame preview delivered there; user quality approval remains pending.
