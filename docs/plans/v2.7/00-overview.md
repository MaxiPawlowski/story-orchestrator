# Implementation Overview — Story Orchestrator v2.7

**Status: IN BUILD; SCOPE UNDER REVIEW (user, 2026-10-07): v2.7 is being re-scoped with new items, then every test re-runs from zero.** Earlier: re-scoped 2026-10-03 at the version split. v2.7 = **urgent fixes + quick wins whose gates are
deterministic** (`npm run gates`, no-LLM scenarios, seeded metadata, dry-run payloads, Storybook). Everything else the
user decided on 2026-10-03 is v2.8 (`docs/plans/v2.8/00-overview.md`); everything deferred is v2.9
(`docs/plans/v2.9/00-overview.md`). Old → new numbers: `RENUMBER.md`. Review findings: `review-2026-10-03.md` (old
numbers there). Test plan: `16-test-plan.md`.

**Built and merged on master** (gate records in each plan):

| Plan | What | Merge |
|---|---|---|
| 01 | docs half (`docs/guide`, README rewrite, dev docs, plugin READMEs, CHANGELOG 2.5–2.7) | `cf35ec22` |
| 01 | in-app half (feature registry, Help panel, What's new, Getting started, `/story help`, plain-language pass, triage proposal) | `6dcfccb8` |
| 02 | C6–C10 (player-safe image cue, fired/public lore looks, `illustrate` opt-out + chapter looks, narrator never drawn from its card, `stagecraft.exclude`) | `74c8f50a` |
| 02 | C2 (transcript-copier settings read + player copy, check registry seed) | `e9082dd5` |
| 08 | option A warning (`model-not-thinking` check, HUD `#so-hud-setup`) | `e9082dd5` |
| 09 | option E (hold reason + player line in the author journal) | `e9082dd5` |
| 10 | option C (`catching-up` pipeline state after an edit) | `e9082dd5` |
| 07 | A1 (coverage + lab README refresh), A2 (`check_all.sh` portable) | campaign `8012a61`, `b61639f` |
| 03 | the 10 solo story chats on the real install deleted (user-confirmed) | install, no commit |
| 02 C14 + 14 | per-source/per-model context table; profile selects grouped by source, labelled local/cloud; cloud-model guide | merged after v2.6 freeze-2 (branch `8f850724`) |
| 15 | B guide note; C SP10 probe removed (scenario file left, see its record) | merged after v2.6 freeze-2 (branch `8f850724`) |
| 03 | no group, no story; solo-only code removed; make-a-group card | integrated on `worktree-agent-a534f301d5bc25f92`, live not run |
| 04 | one check registry, drawer Setup section + Before you start, HUD setup counts, per-install dismissal | integrated on `worktree-agent-a534f301d5bc25f92`, live not run |
| 05 | story + chapter briefing, Before you start modal (reads 04's findings), Studio editor, `storyKind` | integrated on `worktree-agent-a534f301d5bc25f92`, live not run |
| 06 | plays index, badges, Continue list, chapter cards (05's chapter briefing), wand (+ Story briefing), Activity (+ 04 findings), panels | integrated on `worktree-agent-a534f301d5bc25f92`, live not run |

Every merged row's **live gate is NOT run** (each gate record says so). Deterministic live checks close in v2.7
(`16-test-plan.md`); real-model rows are owed to `v2.8/01-v27-carry-over.md` §A.

## Rules

1. **Inherited.** v2.6 rules and every invariant in `.claude/rules/architecture.md`.
2. **v2.6 takes no more changes** (user, 2026-10-03). v2.6 docs stay as history; its owed work lands in v2.7 02 or
   v2.8 01.
3. **A seed is a candidate, not a commitment**: a plan names its problem, conditions, floor and gate before it is
   approved. Floors are predeclared and never retuned.
4. **Findings cite their source** (session dir, `v2.6/14-findings.md` row, review ledger id, or the user's report).
5. **v2.7 gates are deterministic (tier D).** A v2.7 item is built and accepted at tier D. Any row that needs CL, LT,
   LI or RP is owned by v2.8 01 (or the v2.8 plan named in the row), never closed by `npm run gates`.
6. **v2.7 never changes what reaches the model** unless the change carries a real-model acceptance row owned by v2.8 01
   (or the named v2.8 plan). Each plan says which of its changes touch model input. Plans that touch injection,
   extraction input or image/curator prompts carry a **payload-invariance check** (dry-run capture on a scripted group
   chat, byte-identical except the declared diff) in `16-test-plan.md`.
7. **Group chats only** (v2.7 03). No plan adds solo behaviour. A solo chat appears in a gate only as a control (the
   runtime stays inactive, a story refuses, cleanup runs).
8. **Every server in the tray; models off `C:`** (v2.8 rule 5). v2.7 adds no server; a script that starts one uses
   `C:\dev\tray\items\story-orchestrator.json`, and no new model, weight or cache path lands on `C:`.
   **Image-track exception (user, 2026-10-04):** existing image models stay on `C:` for autoload; plans 17–20 and the
   Belle pilot reuse those paths and copy, move or download no weights (overview rule 5 exception).
9. **Feature-producing plans register** in the v2.7 01 feature registry and Help, with the registry test as their gate
   (review B10). Closures and docs-only plans need no entry.
10. **Player-visible surfaces need a session or an explicit user decision** (v2.8 rule 4). The 2026-10-03 decisions
    cover v2.7 05, 06 and 04's surfaces. Their copy still goes through the spoiler checklist and
    `so-ui.mts assert-player-clean`.
11. **Adolion stays unspoiled for the user.** No campaign story content in plans or reports; briefing and `player`
    copy is reviewed by a second model (review B4).
12. **References are version-qualified** ("v2.7 03", "v2.8 01", "v2.6 plan 11"), never a bare number (review B12,
    F36). Every plan closes with `npm run gates`.
13. **The image track (plans 17–21) moved from v2.8 on 2026-10-04** (user decision). Completion and live acceptance
    are owned by v2.7 24: local Artemis replies (LT), local ComfyUI images (LI), existing DeepSeek/Jev roles permitted
    (CL); no pod. This is an explicit exception to rule 5. `npm run gates` never closes S28, S32-1, S32-2 or route A.
    v2.8 01 O3–O6 stay with v2.8 01. The pilot record states its historical evidence; plan 24 carries later updates.
14. **Local residency (plans 22–23) is separately owned by another agent**, including its LT/LI rows. Plan 24 consumes
    its broker interface and reports integration findings; it does not implement residency or FreeToken work.

## Gate taxonomy (same codes as v2.8)

| Tier | Code | What runs | In v2.7 |
|---|---|---|---|
| Deterministic | **D** | `npm run gates`, jest/property tests, no-LLM scenarios, Storybook, scripted messages, `seed_metadata`, dry-run payloads, live lane checks that make no model call | implementation and acceptance |
| Cloud LLM | **CL** | DeepSeek API roles, TypeSafe judge | owed to v2.8 01 |
| Local text model | **LT** | a model served on this PC | owed to v2.8 |
| Local image model | **LI** | local ComfyUI through the GPU broker | owed to v2.8 01 |
| RunPod | **RP** | the main reply model on the pod | owed to v2.8 01 |

## Build order

Step 0 runs first. Then file order, except where a row says "together".

| # | Plan | What v2.7 builds | State | Moves out |
|---|---|---|---|---|
| 0 | **Code recheck K1–K3** (below) | after the v2.6 worktree session lands: re-read the code, then fix K1 (02 C2), K2 (architecture invariant) and K3 (03) | open, **first** | — |
| 0b | 07 A3 + A8 | pin move + campaign test guards, one change, `test:debug` re-frozen | open, with step 0 | — |
| 01 | `01-docs-and-in-app-guidance.md` | registry, Help, guide (built); triage review with the user; close-out step Z | built; triage open | O1 fresh-install reply → v2.8 01 |
| 02 | `02-v26-carry-in.md` | C2 + K1, C6–C10 (built); C1 SP5.b; C11-F1 display half; C13 exact promotion; C14 context table | partly built | C3, C4, C12, C11-F2/F7, F1 guard, C13-b, C14-b → v2.8 01 |
| 03 | `03-group-chats-only.md` | no group, no story; solo-only code removed; "make a group" card | approved, not built | — |
| 04 | `04-story-health-center.md` | one check registry (extend `checks.ts`), Repair as its ordering, one Story setup surface | seeded, not built | — |
| 05 | `05-story-briefing.md` | static briefing, modal, Studio editor, chapter briefings, C8 onboarding, saga/act indicator, the activation sequence frame | not built | LLM drafting → v2.8 10; identity step → v2.8 03 |
| 06 | `06-story-presence-ui.md` | plays index, badges, C1 Continue list, C2 hover card, C3 chapter card, C6 wand entry, C9 (b) author Activity + roll store, panel frame, per-story toggles | not built | C4, C5, C7, C9 (a) public chips → v2.8 04 |
| 07 | `07-adolion-campaign.md` | A1, A2, A3, A7, A8 (done); A6 deterministic half done | partly done; live rows owed | A4, A5, D13 → v2.8 02 |
| 08 | `08-thinking-per-story.md` | warning (built); copy fix (A11) | built | story/checkpoint level (R4) → v2.8 01 §E |
| 09 | `09-commitment-double-negatives.md` | option E (built); close | built | — |
| 10 | `10-sp2-recommit-v2.md` | option C (built); guide line | built; doc line open | option A → v2.8 01 §C |
| 11 | `11-c4-option-b-restage.md` | close (keep (c)) | docs | E → v2.9 05.3 |
| 12 | `12-model-choice.md` + `12a-model-switch-checklist.md` | decision + runbook | docs (done) | thinking A/B → v2.8 01 §D |
| 13 | `13-warden-lore-one-request.md` | close (separate arm) | docs | C3/C4 → v2.8 01 §B |
| 14 | `14-b10-cli-judge.md` | role picker grouped by source + per-source context table (built as 02 C14) | not built | Lore-creation role → v2.8 11; native CC tool spike: no home (question) |
| 15 | `15-sp10-tool-call-turns.md` | B guide note + C probe removal | not built | A → v2.9 05.2 |
| 16 | `16-test-plan.md` | the v2.7 test plan and close-out checklist | written | — |
| 17 | `17-self-contained-images.md` | ST Image Generation route, template fallback, ComfyUI discovery, owned jobs, broker optional, probes, Test render, `/imagine` setup | implemented candidate; live acceptance PARTIAL | live LI/CL rows → v2.8 01 / final suite |
| 18 | `18-sprite-generation.md` | reference-edit recipes, pixel QA, Studio Sprites tab, fingerprinted generated-set storage, guarded removal | implemented candidate; live acceptance PARTIAL | multi-character LI + identity rating → v2.8 01 / final suite |
| 19 | `19-talking-sprites.md` | blink/talk/talk2 frame contracts, frame lister, streamed-mouth animator, Mouth movement setting | implemented candidate; S28 NOT run | S28 + streamed acceptance → v2.8 01 / final suite |
| 20 | `20-living-cards.md` | bound public card fields, transactional entry writes/provenance, scope rotation, image/sprite readers, on-demand looks (off) | implemented candidate; overlay/on-demand off | S32-1, S32-2 → v2.8 01 / final suite |
| 21 | `21-belle-image-pilot.md` | the Belle pilot record: gate record, delivered scope, open acceptance | written 2026-10-04 | — |
| 22 | `22-local-residency.md` | local residency controller: Artemis on the local GPU for replies + extraction, DeepSeek image direction/judge kept; owned GPU gateway; VRAM arbiter (estimate/retain/shed/swap/idle-restore) | IN BUILD (moved from `v2.8/local-residency.md`, 2026-10-04); text→image→text live green, arbiter slice green | LT/LI live rows stay this plan's |
| 23 | `23-local-residency-freetoken.md` | FreeToken pattern-harvest record (no code ported) | written 2026-10-04 | — |
| 24 | `24-image-and-local-completion.md` | completes 17–21: image readiness, protected existing-pack references, sprite cleanup, Studio card/base controls, S28 and S32; local Artemis + local images, existing cloud roles permitted; 22–23 external | IN BUILD; D green; reference adoption/local reply smoke ×2; S32-1 complete, keep-off; LI blocked by controller reclamation | — |
| Z | close-out | regenerate settings reference + README feature table; second feature triage; guide pages vs the UI; What's new for 2.7; walk every gate record into v2.8 01 §A | open | — |
| 25 | `25-flux-memory-and-backend-spikes.md` | FLUX memory repair on the 3090/32 GiB host, backend spikes | implemented; acceptance PARTIAL | — |
| 26 | `26-sprite-quality-and-speed.md` | opaque mouth region, expression-aware mouth, raw-edit cache, two-frame default, resolution/steps compare | implemented candidate; visual approval given by the user 2026-10-07 | — |
| 27 | `27-main-st-rollout.md` | current build + all nine Adolion stories on the main install, regular sprite packs | COMPLETE 2026-10-06 | — |
| 28 | `28-saga-main-cast.md` | eight Saga main characters: base packs, blink/talk, living-card fields, changed-look animation | IN BUILD; 8 base packs 238/238 frames | — |

**Together** (Sol split item 6): 03 and 04 are built at their seam (`story-needs-group` is a 04 check; the refusal is
03's). Their gates use scripted messages, seeded metadata and dry-run payloads. 05 needs 04's `blocks` findings for
"Before you start"; 06's C3 chapter card can carry 05's chapter briefing.

## Code recheck (step 0, review K1–K3)

Defects in code already on master, held until the v2.6 worktree session lands because it may touch them. When it lands:
re-read each against the current tree, then fix.

| id | Finding | Fix | Gate | Where |
|---|---|---|---|---|
| K1 | **Privacy leak in the shipped 02 C2.** `SECRET_LEAK_CHECK` (`src/runtime/checks.ts:45`) is audience `player`, but `secretLeaks()` is empty unless a secret is held, so the player alert appearing reveals that a hidden `[hiding]`/`[unaware]` row exists | the player copy shows whenever a copier is on in a group story; `secretsHeld` gates only the author detail | identical player-visible output (HUD chip, drawer, settings, Help) with and without held secrets; jest + live seeded lane, ×2 | v2.7 02 C2-K1, v2.7 04 |
| K2 | `architecture.md`'s held-secret invariant says "author-only Repair row"; as built it is a player alert plus a HUD chip | rewrite the invariant together with K1 | docs | v2.7 02 C2-K1 |
| K3 | the shipped guide says solo chats work (`docs/guide/player/troubleshooting.md:44`); the registry's `stories` feature does not need `group-chat` (`src/features/registry.ts:98-103`) | fix both with 03 | registry test + guide drift | v2.7 03 |

## Decisions (user, 2026-10-03)

Re-keyed to new numbers. The user's inline answers stay verbatim in each plan. Decisions for plans that moved are in
`v2.8/00-overview.md` §Decisions and `v2.9/00-overview.md`.

| v2.7 | Was | Decided | Scope change |
|---|---|---|---|
| 01 | 01 | all recommendations; **internal records move to the private `so-sessions` repo**; docs both first and at close-out | — |
| 02 | 02 | build order C2, C1, then C3; v2.6 untouched, so C3/C4 measure on the first v2.7 build; findings straight into this file | C3/C4/C12 and model-driven C11 → v2.8 01 (split) |
| 03 | 33 | **stories run in group chats only**; solo chats show "make a group"; solo-only code removed; all five as recommended; the old solo story chats deleted | — |
| 04 | 31 | all recommendations (one registry, active while a story plays, findings not toasts, dismissible except `blocks`, build right after 01) | the C2/08 build already seeded `src/runtime/checks.ts` |
| 05 | 03 | all recommendations; chapter briefings yes; image optional; C8 merged into the modal | **saga vs act indicator** in the group selector (here); on-the-fly drafting "if the player enables auto" → v2.8 10 |
| 06 | 04 | badges on groups only; the plays index holds checkpoint names; seamless backfill (on open + one idle pass) | **build all C-items**, draggable panels, per-story toggles; **C9 "Behind the scenes"**. Split: C1, C2, C3, C6, C9 (b), panels and toggles here (moved from v2.8 04, user-approved 2026-10-03); C4, C5, C7, C9 (a) in v2.8 04; C8 in 05 |
| 07 | 05 | **do every step**; pin moves at the start of the v2.7 build | A4, A5 → v2.8 02 |
| 08 | 06 | warning yes; no turning thinking on (C refused); story + checkpoint level behind R4; Astra rates | **the warning reaches players too** (built as a player-safe check); level → v2.8 01 §E |
| 09 | 07 | hold; journal row (E); B if ever needed; D no | — |
| 10 | 08 | C now; **option A is important** (the user edits replies and uses a post-processor); 15 s hold; R5′ | A → v2.8 01 §C |
| 11 | 09 | keep (c); E deferred | E → v2.9 05.3 |
| 12 | 10 | keep Artemis v1.1; thinking required; checklist (12a); all three triggers | **one thinking A/B funded** → v2.8 01 §D |
| 13 | 11 | A: keep separate, close | — |
| 14 | 13 | not a runtime judge; labelling aid yes; W27 kept; profiles per role; Lore-creation role with the create op; native-tool spike; no own provider seam; fix the 8192 default | the user has Claude and Codex subscriptions and DeepSeek, no OpenRouter (review B6) |
| 15 | 16d | no CC function calling in story chats: B + C now | A → v2.9 05.2 |
| 17 | v2.8 05 (was 26) | all recommendations; **moved to v2.7 on 2026-10-04** | route A default, template fallback, broker optional/fail-open, story-authored automation default |
| 18 | v2.8 06 (26b) | **moved to v2.7 on 2026-10-04** | Studio Sprites tab, ledgered writes, second-model QA |
| 19 | v2.8 07 (28) | **moved to v2.7 on 2026-10-04**; drop Talkinghead; B + P; compare 2 vs 3 mouth frames and ship a Mouth movement setting | D (rig) → v2.9 05 |
| 20 | v2.8 08 (32) | **moved to v2.7 on 2026-10-04**; all recommendations; avatars deferred | S32-1, S32-2 → v2.8 01 / final suite |
| 21 | new 2026-10-04 | Belle the Barbarian is the image-track pilot; every piece is production code | one-character evidence never closes the multi-character floors |
| 22 | new 2026-10-04 (`v2.8/local-residency.md`) | local-first text/images on the one 3090; DeepSeek image direction + cloud judge kept; owner-tier live rows stay here | moved to v2.7 as current work |

### Open questions decided (user, 2026-10-03: as recommended)

| Question | Decided | Where |
|---|---|---|
| Homes for v2.7 14 research decisions 2 and 3 (Sol r3 R3-15) | native tool calls over CC profiles = v2.8 09 §F (rows in v2.8 24); optional Critic role = v2.9 05 §05.6 | v2.7 14, v2.8 09, v2.9 05 |
| 01 triage: what "dev-only" means; what a fixed default removes | dev-only = left out of the release build, behind `__SO_DEV__` like the spike modules; a fixed default loses the control **and** the setting key (no-legacy rule) | v2.7 01 §D, §Triage proposal |
| 16 live smoke | 5 real turns on the DeepSeek CC profile, no pod; plumbing check only, not acceptance; small spend accepted | v2.7 16 §Live smoke |
| 05/06 saga rule (earlier proposal) | stands as written: a saga = a story with ≥ 2 chapters | v2.7 05 §Saga vs act, v2.7 06 B |

## Status

| Plan | State |
|---|---|
| 01 | BUILT (both halves merged); triage proposal awaits the user's review; live D checks owed (16-test-plan) |
| 02 | PARTLY BUILT: C2, C6–C10, C1 and C14 merged (gates green, live NOT run); K1/K2 fixed in the v2.6 T7 wave B (step 0); C13 merged (41c0c07e); C11-F1 display half built on `worktree-agent-adc7c17ca7267180d` (gates green, live NOT run) |
| 03 | BUILT, merged 41c0c07e (pushed 61c0dad5); live D rows owed |
| 04 | BUILT, merged 41c0c07e; live D rows owed |
| 05 | BUILT (static half), merged 41c0c07e; live D rows owed |
| 06 | BUILT (A, B, moved C-items), merged 41c0c07e; live D rows owed (incl. payload invariance) |
| 07 | A1, A2, A3, A7, A8 done (campaign `b65b5e6`, `c0927b5`); A6 deterministic half done (all nine read `saga`); live rows (A3 lane seed, A6 badge) owed |
| 08 | BUILT (warning); A11 copy fix built on `worktree-agent-adc7c17ca7267180d` (guide + drift test); closes in v2.7 |
| 09 | BUILT (E); closes in v2.7 |
| 10 | BUILT (C); guide line built on `worktree-agent-adc7c17ca7267180d`; C live row owed; closes in v2.7 |
| 11 | CLOSED (docs) |
| 12, 12a | CLOSED (decision + runbook) |
| 13 | CLOSED (keep separate) |
| 14 | BUILT, merged (picker + context table + docs; image director select grouped at merge); live D row owed |
| 15 | BUILT, merged (B + C; `v25-09-tool-turn.json` removed by the v2.6 T7 wave C) |
| 16 | written |
| 17 | IMPLEMENTED CANDIDATE (moved from v2.8 05, 2026-10-04); `npm run gates` green; Belle pilot exercised route/discovery/jobs/Test render; live LI/CL PARTIAL |
| 18 | IMPLEMENTED CANDIDATE (moved from v2.8 06, 2026-10-04); Belle pilot built 4 expressions + 12 frames; multi-character LI + identity rating PARTIAL |
| 19 | IMPLEMENTED CANDIDATE (moved from v2.8 07, 2026-10-04); frames + animator built, streamed reply moved the mouth; S28 NOT run |
| 20 | IMPLEMENTED CANDIDATE (moved from v2.8 08, 2026-10-04); fired-transition rollback passes twice; S32-1/S32-2 NOT run; overlay/on-demand off |
| 21 | written 2026-10-04 (Belle pilot record) |
| 22 | IN BUILD (moved from `v2.8/local-residency.md`, 2026-10-04); text→image→text live green; VRAM-arbiter slice green (estimator 9059 vs measured 9058; shed/swap decisions); open: page-side workflowKey retention wiring, background/edit/sprite families |
| 23 | written 2026-10-04 (FreeToken pattern harvest; no code ported) |
| 24 | IN BUILD, NOT accepted (2026-10-05): D green, 6,392 jest / 1,026 debug / 517 Storybook passed; protected existing-pack adoption, generated/ref cleanup, author mirror, speaker-first scope, readiness and base-from-card code built. Reference/live local reply checks green ×2. S32-1: overlays 100%/100%, baseline 73.3%/100%; default stays off (baseline not worse twice). Base recipe v2 RGB fix D green; LI recheck refused by controller reclamation. S28, S32-2, route/clean-host and final docs owed. Plans 22–23 external |

| 25 | IMPLEMENTED (2026-10-05); local/transport discovery green; overall acceptance PARTIAL |
| 26 | IMPLEMENTED CANDIDATE (2026-10-06); D and image/read/reply regression green; **user visual approval given 2026-10-07** (neutral/happy and the eight-character playback pack) |
| 27 | COMPLETE (2026-10-06): plugin + nine stories on the main install, regular expression sprites |
| 28 | IN BUILD: eight base packs generated and verified (238/238, 58 speaking composites recomposed), user approved 2026-10-07. Open: 31 authored outfits, living-card prompt repair + S32-1 rerun, text→image recovery gate (red: RAM admission), Saga integration ×2 |
## Review 2026-10-03

Applied here: F01 (per-plan status), F15 (gate taxonomy), A4 (rows rewritten from decisions), B10 (registry rule 9),
B12/F36 (rule 12), K1–K3 (step 0), Sol split items 2 (owed rows → v2.8 01), 6 (03 + 04 together), 7 (A6 here). Per-plan
findings are listed in each plan's own "Review 2026-10-03" section.

Round 3 (Sol): R3-15 applied; its homes decided by the user 2026-10-03 (as recommended, §Decisions).
