**The strongest findings are a reproducible image-prompt spoiler leak, incomplete rollback detection, and two quest-progression defects.** Fix those before layering more mechanics onto the same state.

Reviewed read-only against the checkout initially reporting `0c283dc6`, including all eight plans’ gate records and their implementation paths. Five small, in-memory probes confirmed specific failures; no browser, model, GPU, campaign access, or full gates were run. A final citation lookup showed concurrent source edits, so the reproductions describe the inspected version, not an attestation of later changes.

**1. Correctness and risk**

Confidence below distinguishes reproduced behavior from static analysis.

| Severity | Finding and concrete failing scenario | Evidence / confidence |
|---|---|---|
| **P0 — spoiler protection** | **A changed look bypasses the narrator-description exclusion.** Give a narrator a private card description, no explicit appearance, and one visual card-field value. `castForImage` returns early, appends the private description, and marks it safe for the template. The probe’s image prompt contained the synthetic private plot text. Apply the narrator exclusion before composing changed looks; use an explicit appearance-only base. | [cast.ts:35](src/image/cast.ts:35), [prompt.ts:34](src/image/prompt.ts:34). **High; reproduced.** Exposure to the image pipeline is proven; a resulting visual spoiler was not generated. |
| **P0 — rollback invariant** | **Intermediate life state can survive a deleted turn.** An agenda’s waiting counter advances without a completed step, transition, or extractor write. The rollback detector returns false, so runtime takes the no-engine-rollback path. The next turn can complete the agenda earlier than a clean replay. Mood-age increments have the same detection gap. Detect all relevant life-state changes, not only landed steps. | [derive.ts:28](src/engine/life/derive.ts:28), [lines.ts:82](src/engine/life/lines.ts:82), [rollback.ts:140](src/runtime/rollback.ts:140). **High; probe produced `wait:1`, `shouldRollback:false`.** |
| **P1 — quest dependencies** | **`requires` tests the prerequisite’s raw completion condition, not its persisted completion.** Complete quest A, then let its non-latching completion condition become false. A remains Done, but dependent B becomes hidden. Conversely, a raw completion condition can satisfy B even when A’s failure takes precedence. Compile dependencies against A’s closed-state latch. | [quests.ts:202](src/engine/validate/quests.ts:202), especially `target.done_when` at :212. **High; reproduced A=Done, B=Hidden.** |
| **P1 — quest discovery** | **Active quests can permanently starve undiscovered quests.** Five active, unresolved quest keys consume the five-key quest allowance. A sixth quest’s discovery condition, referenced nowhere else, never gets read—even when the player encounters it. Rotation within active quests does not solve starvation between statuses. Reserve discovery capacity or age waiting keys. | [scopeSources.ts:9](src/extraction/scopeSources.ts:9), [scopeSources.ts:195](src/extraction/scopeSources.ts:195). **High; discovery key selected in 0/20 rotations.** |
| **P1 — stale suggestions** | **Suggestions survive edits to the transcript they used.** Start “What could I do?”, edit the relevant reply while it runs, then receive and select an obsolete suggestion. The request’s ownership token has no transcript window, so its mutation check does not invalidate it. Capture the source window and invalidate displayed results on relevant edits. | [suggestionsHost.ts:52](src/runtime/suggestionsHost.ts:52), [runToken.ts:88](src/runtime/runToken.ts:88). **High; token probe accepted an intervening edit. Browser journey unverified.** |
| **P1 — persona repair** | **“Switch back” can report success when restoring the chat lock failed.** Selection succeeds, `host.lock()` refuses, but `switchBack()` returns the successful selection result. The journal records the failure; the caller receives success. Return the lock failure and retain actionable repair state. | [playerSetupControl.ts:47](src/runtime/playerSetupControl.ts:47), return at :59. **High; static control-flow finding.** |
| **P2 — misleading image setup** | **The setup checklist requires configuration that the working default route does not need.** ST image service plus template prompting can work without an extension Comfy URL or director profile, yet `imagesReady` requires both. A player can repeatedly “repair” an already-working feature. Use the actual route readiness result. | [SettingsPanel.tsx:163](src/components/settings/SettingsPanel.tsx:163), template fallback [runtime.ts:249](src/image/runtime.ts:249). **High; static.** |
| **P2 — misleading stage state** | **“Enabled” and effective stage activation disagree.** With untouched settings and a story without stage directions, feature resolution reports sprites enabled, while activation returns `off`. This makes the default-on promise and UI ambiguous. Show “automatic / awaiting story directions” distinctly, or make the effective behavior match the enabled control. | [featureResolve.ts:40](src/runtime/featureResolve.ts:40), [activation.ts:13](src/sprites/activation.ts:13). **High; static.** |

Two additional risks warrant focused verification:

- **P0 privacy risk — check outcomes bypass audience filtering.** `checkOutcomeBlock` composes all latest outcomes into a shared prompt; no held-secret/member filter is present there. A check label describing a private event can therefore enter another member’s request. `narrate: hidden` hides the roll UI; it is **not** a secrecy guarantee. Route outcomes by authorized audience and test a kept-out member. [storyCheckDraws.ts:94](src/runtime/storyCheckDraws.ts:94), [checkOutcomeHost.ts:9](src/runtime/checkOutcomeHost.ts:9). **High confidence in the unfiltered path; secret-bearing end-to-end case unverified.**
- **P1 cross-chat image risk.** Automatic `cue()` checks ownership, awaits service readiness, then calls `direct()` with the earlier cue and message index without rechecking ownership at that point. Switching chats during the wait may carry old-scene input into the new operation. Capture ownership before the wait. [runtime.ts:127](src/image/runtime.ts:127), [runtime.ts:135](src/image/runtime.ts:135). **Medium; downstream placement protection was not fully verified.**

Important limits and positive findings:

- **Plan 35 is only partly implemented as originally envisioned:** current validation still refuses production `pressure` and `trigger`. Open stretches and encounter offerings should not be described as a completed pressure system. [stretch.ts:31](src/engine/validate/stretch.ts:31).
- The examined check draws use seeded chance. Suggestions fill the input rather than sending. Persona writes have ownership checks. Character-life text has a member-private injection path.
- **Plan 30:** no concrete security defect found in the examined reader. It renders React elements, restricts link schemes, and filters author pages before search. This does not establish browser accessibility or deep-link acceptance.
- Historical deterministic gate records do not close the outstanding real-model floors. Nothing here supports switching built features, thinking, or inner voice off.

**2. Player-experience review**

These are likely experience problems, not measured session conclusions.

| Shipped area | Likely experience | Small improvement |
|---|---|---|
| **33 — player loop** | Corrections can feel invisible; suggestion failures offer little useful distinction. Four suggestions can become another menu to inspect. | Explain “still catching up” versus “request failed”; invalidate stale suggestions immediately. Prefer distinct attempts—talk, investigate, wait—without prescribing outcomes. |
| **34 — identity/start** | Strong continuity foundation, but choosing, locking, and repairing identity can feel like setup administration. | Keep the current persona as the prominent path. Show one settled identity summary and precise lock-failure recovery. |
| **35 — open stretches** | “Most replies” carrying an onward hook can make a supposedly open scene feel persistently hurried. | Add deterministic hook spacing and a respite after the player declines. Preserve the destination and agency clauses; do not invent deadlines merely to increase pressure. [steering.ts:68](src/pacing/steering.ts:68). |
| **36 — quests/panels** | Useful state is spread across Journal, log, sheet, and widgets; a silently undiscovered quest looks like the story ignored the player. | Fix discovery first. Then emphasize the latest meaningful change and reuse the same public wording across surfaces. |
| **37 — character life** | Relationships may affect dialogue without an observable acknowledgment. Mood can remain stale until expiry, because mood keys are normally offered only when expired. | Add narrowly scoped, evidence-triggered mood refreshes and authored acknowledgment beats at meaningful relationship changes. Avoid exposing scores. [presence.ts:42](src/engine/life/presence.ts:42). |
| **32 — images/living characters** | Delayed or failed look updates can make the visuals contradict the text; frequent animation can compete with reading. | Preserve the last valid visual, communicate pending/failure accurately, and space automatic pictures. Keep the owner’s chosen animation behavior. |
| **29 — settings** | “On,” “configured,” “active here,” and “waiting for a prerequisite” are easy to confuse. | Derive status from actual consumers, showing the effective value and its source together. |
| **30 — guide** | A searchable manual helps, but players still need to translate their symptom into a feature name. | Add symptom aliases such as “ignored my edit,” “wrong outfit,” and “quest disappeared,” linked to the existing repair/control entry points. |

**3. Combinations with plans 42–53**

The revised Astra review’s distinction between **disclosure, knowledge, and truth** should govern these combinations.

| Combination | Player payoff and constraint |
|---|---|
| **Life + 42 witnesses + 44 rumors + 53 reputation** | NPCs respond differently because they received different accounts. Keep hearsay attributed; hearing a rumor must not grant access to its original private scene. |
| **Quests + 47 promises + 43 recall + 46 recap** | Exact pledge → evidenced fulfillment → brief acknowledgment → chapter recap. Link authored promises to existing quests rather than maintaining competing completion states. |
| **Life + 50 calendar** | Schedules and agendas acquire believable rhythms. Implement exactly-once time writers and complete rollback detection before adding deadlines. Open-stretch turns remain distinct from fictional time. |
| **37 relationships + 51 labels + 52 codex** | Players discover how relationships have changed through earned events and public words, without seeing private meters. Disclosure must be explicitly earned, not inferred from mere presence. |
| **35 open stretches + 48 scene tests + 49 complications** | Optional developments advance existing threads instead of repeatedly pushing the main route. Keep 48 director-only initially; finish SP6 before extending its reply-path behavior. Exhausted pools should permit quiet. |
| **34 identity + 45 New Game+ + 46 recap** | A new run begins with a small, explicit legacy. Carry a public projection with target-member knowledge rules; never treat the stored epilogue as automatically safe. |
| **29/30 settings and guide + all twelve plans** | Each mechanic explains what it does *in this chat*, its prerequisites, and where its evidence appears. Avoid adding another independent dashboard. |

Up to five additional ideas, proposed rather than established requirements:

1. **Declined-hook cooldown:** remember an explicit refusal and temporarily suppress that same onward hook; rollback restores the previous cooldown.
2. **Return greeting variants:** choose an authored greeting from the last publicly witnessed interaction, with deterministic reuse limits.
3. **“What changed since I last looked?”:** a compact diff inside existing panels, using public state only.
4. **Revision-aware suggestions:** attach each suggestion set to its scene/transcript revision and visibly retire it when that context changes.
5. **One acknowledgment per event:** a shared occurrence ID prevents the same achievement from being repeatedly announced by quest, relationship, recap, and director systems.

**4. Top 10 actions — player value per effort**

Effort is relative, not a delivery estimate.

| Rank | Action | Effort | Player value |
|---:|---|:---:|---|
| 1 | Close the narrator-description image leak; add a changed-look negative control. | S | Prevents irreversible spoilers. |
| 2 | Make rollback detect intermediate life writes; test deletion before an agenda step lands. | M | Makes edits, swipes, and replay trustworthy. |
| 3 | Compile quest prerequisites against completed-state latches. | S | Stops completed work from mysteriously blocking progression. |
| 4 | Bind suggestions to their transcript window and invalidate stale sets. | S | Prevents advice contradicting the player’s edits. |
| 5 | Give hidden/offered quest discovery a bounded opportunity to be read. | S–M | Makes exploration reliably register. |
| 6 | Verify and audience-scope check-outcome injection, retaining hidden dice behavior separately. | M | Protects private events and prevents inappropriate narration. |
| 7 | Return persona lock failures accurately from “Switch back.” | S | Makes identity repair dependable. |
| 8 | Guard automatic image cues across readiness waits and chat changes. | S | Prevents misplaced images and stale scene requests. |
| 9 | Correct image readiness and stage-activation status using actual runtime state. | S | Removes unnecessary setup and misleading switches. |
| 10 | Add deterministic spacing for onward hooks, then measure it in the existing acceptance session. | S–M | Lets open roleplay breathe without removing direction. |

The highest-value new mechanic after these repairs is the **promise → fulfillment → acknowledgment loop**, starting with authored quest links and exact evidence. It builds emotional continuity with comparatively little new machinery.