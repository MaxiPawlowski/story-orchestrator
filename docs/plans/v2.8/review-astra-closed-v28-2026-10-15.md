The main risks are **spoiler-bearing context, stale results after rollback, and lore leaking between runs**. Several smaller UI defects also make built features appear ineffective.

This is a static review of shipped code at `0c283dc6`, alongside the plans and gate records. No files were changed, no private campaign content was inspected, and no browser or real-model acceptance was run. “High confidence” below means the code path supports the finding; it does not mean I reproduced it live.

**1. Correctness and risk review**

1. **P0 — Author description enters player Ask and suggestion prompts. High confidence.**  
   [`playerProjection.ts:66`](src/runtime/playerProjection.ts:66) falls back from `player_intro` to `description`. That becomes the projection’s introduction and is printed into model context at [`playerProjection.ts:118`](src/runtime/playerProjection.ts:118). [`suggestionsHost.ts:39`](src/runtime/suggestionsHost.ts:39) supplies the full story to this projection; player Ask shares that projection path.  
   **Failure:** an author describes the concealed antagonist in `description`, omits `player_intro`, and the player asks what to investigate. The assistant receives the concealed answer.  
   **Fix:** use only explicitly player-facing introduction text. Add a property test: changing author-only metadata cannot change player prompts.

2. **P0 — Curator-created lore can contaminate another run. High confidence in the path; live reproduction outstanding.**  
   Created entries are written into shared lorebooks and tagged with their originating chat. [`createdStamp.ts:10`](src/stagecraft/createdStamp.ts:10) provides that attribution, but [`storyLore.ts:56`](src/runtime/storyLore.ts:56) appends required-book entries without filtering those stamps by the current chat. Stamp consumers found during review handle attribution/deletion, not scan eligibility.  
   **Failure:** run A creates an entry recording a late discovery; fresh run B uses the same required book and activates that entry by keyword. B receives A’s discovery.  
   **Fix:** isolate created lore by run, preferably through an overlay. If filtering stamps instead, cover every scan route, including already-loaded global/character books. Cross-run inheritance should require an explicit carry operation.

3. **P1 — Ask and suggestions accept results based on edited-away messages. High confidence.**  
   [`askHost.ts:36`](src/runtime/askHost.ts:36) and [`suggestionsHost.ts:52`](src/runtime/suggestionsHost.ts:52) call `beginRun` without a transcript window. [`runToken.ts:88`](src/runtime/runToken.ts:88) checks transcript mutations only when the token has a window. Rollback records a mutation rather than universally replacing the epoch: [`runtimeManager.ts:348`](src/runtime/runtimeManager.ts:348).  
   **Failure:** ask about a revelation, swipe that revelation away while the request runs, then receive an answer based on the erased version. Suggestions can still be inserted because [`suggestionsHost.ts:67`](src/runtime/suggestionsHost.ts:67) repeats the insufficient ownership check.  
   **Fix:** bind requests to their source window; invalidate displayed results on relevant mutation. Suggestions also need a current-scene check before insertion.

4. **P1 — Living-director rollback misses pending work when the engine did not move. Medium-high confidence.**  
   [`rollback.ts:136`](src/runtime/rollback.ts:136) takes a no-engine-change path that never calls `restoreLiving`; that happens only at [`rollback.ts:153`](src/runtime/rollback.ts:153). The living movement check considers applied operations, not all pending proposals/divergence readings. Reviewed director work also includes guards without transcript windows.  
   **Failure:** a reply produces a divergence reading or pending branch proposal without changing the blackboard. Editing that reply can leave the proposal available to apply later, despite removing its basis.  
   **Fix:** invalidate transcript-derived living work on every relevant mutation. Restore divergence bookkeeping from retained evidence rather than treating only applied graph operations as rollback state. This needs a targeted regression test before calling it reproduced.

5. **P1 — Wizard lorebook updates cannot reliably clear existing fields. High confidence.**  
   [`provisioning.ts:36`](src/wizard/provisioning.ts:36) and [`worldInfo.ts:281`](src/services/stHost/worldInfo.ts:281) omit empty secondary keys, outlets and trigger lists. Existing-entry comparison/update likewise treats some empty values as unconstrained or absent.  
   **Failure:** clear an existing entry’s restrictive triggers or outlet assignment. The operation appears applied or unchanged, while the old restriction remains and the entry still fails to appear normally.  
   **Fix:** distinguish “not supplied” from “explicitly clear.” Test create → restrict → clear → reread for every supported field, including primary keys.

6. **P2 — Valid author-only meter widgets disappear. High confidence.**  
   Widget validation permits author-audience meters over non-public qualities, but meters use the sheet projection through [`widgets.ts:248`](src/runtime/widgets.ts:248). [`gameSheet.ts:36`](src/runtime/gameSheet.ts:36) excludes qualities without `display.public`; an empty meter then disappears.  
   **Failure:** an author adds a private diagnostic meter and sees nothing, although the story validates.  
   **Fix:** make sheet composition audience-aware while retaining strict player filtering.

7. **P2 — Generated living scenes lack player-facing journal identity. High confidence.**  
   [`plan.ts:77`](src/generation/living/plan.ts:77) builds director checkpoints with internal names/objectives but no player-facing name/text. [`playerProjection.ts:53`](src/runtime/playerProjection.ts:53) deliberately accepts only `player_name`; the timeline similarly filters for player-named checkpoints at [`widgets.ts:176`](src/runtime/widgets.ts:176).  
   **Failure:** the director advances through generated scenes, but the player sees generic “current scene” wording and missing timeline entries.  
   **Fix:** produce a separately checked, non-spoiling scene label when the scene becomes current. Do not expose the internal objective as a fallback.

8. **P2 — Briefing diagnostics reject harmless opening vocabulary. High confidence.**  
   [`briefingDiagnostics.ts:55`](src/studio/briefingDiagnostics.ts:55) collects enum values as forbidden terms unless represented in the starting snapshot. [`briefingDraft.ts:81`](src/runtime/briefingDraft.ts:81) rejects a draft on any diagnostic.  
   **Failure:** the approved introduction calls the player a “friendly visitor,” while an unrelated quality has a non-starting `friendly` enum value. A faithful briefing can be rejected for repeating approved text.  
   **Fix:** exempt explicitly disclosed opening vocabulary. Keep genuine spoiler checks separate from broad lexical heuristics; lexical matching alone is not a secrecy proof.

9. **P2 — Open stretches can mistake engaged roleplay for stagnation and repeatedly offer interruptions. High confidence in mechanics; experiential outcome unverified.**  
   [`quiet.ts:24`](src/pacing/quiet.ts:24) watches outgoing-gate qualities, so meaningful conversation outside those qualities can count as quiet. [`steering.ts:79`](src/pacing/steering.ts:79) relies on prompt instructions to avoid repeating encounter offers, without deterministic consumption tracking.  
   **Failure:** the player spends several turns developing a relationship without moving an exit gate. Multiple group members receive the same encounter menu and may introduce competing or repeated hooks.  
   **Fix:** offer at most one candidate per player turn, record reversible offer receipts/cooldowns, and consider declared public-thread movement when assessing quietness. An offer must remain optional.

10. **P1 risk — Agency protection is narrower than the prose it accepts. High confidence in detector limitation; actual model failure unverified.**  
    [`guard.ts:18`](src/generation/living/guard.ts:18) recognizes a limited set of player-subject constructions and verbs. Wording such as “You reluctantly agree to surrender” can evade the simple pattern.  
    **Failure:** an accepted scene objective or encounter narrates a player decision rather than presenting a situation. Whether the model/critic catches that specific case remains unverified.  
    **Fix:** constrain generated fields to world events, NPC intentions and opportunities; add adversarial agency fixtures. More regex coverage helps, but cannot establish semantic safety.

Two further concerns remain **unverified**: rechecking newly held secrets immediately before accepting curator/director output, and outbound navigation from HTML widgets despite their sandbox/CSP. Neither should be reported as an experimentally demonstrated leak from this review.

I did not establish a new engine-purity, unseeded-chance or single-chat execution violation. That is a scoped observation, not a blanket invariant sign-off. Existing deterministic gate records also do not establish real-model acceptance. Keep built features on by default and retain the original floors when measuring them.

**2. Player-experience review**

| Built feature | Likely experience as shipped | Small, mostly deterministic improvement |
|---|---|---|
| **04 — Story presence panels** | Useful orientation, but generic or missing scene labels can make the display feel disconnected from play. | Show the current public scene label and the last public change. Keep presence wording distinct from knowledge or hearing. |
| **09 — Wizard assistant / Ask** | Powerful but trust-eroding when advice refers to an erased reply or an edit silently retains old settings. | Clear stale answers automatically; show concise before/after values for provisioning edits, including explicit clears. |
| **10 — Briefing drafting** | A missing briefing can look like inactivity; overly broad rejection makes useful drafts disappear. | Give a brief failure/retry state and preserve the approved opening as fallback content. |
| **11 — Curator create** | Helps continuity, but can accumulate redundant facts or make a fresh run feel pre-informed. | Isolate entries by run; deduplicate using stable entity identity and accepted fact provenance. |
| **19 — Open stretches** | Free conversation can be enjoyable, but “quiet” pressure may interrupt exactly when the player is engaged. | Space offers by player turns, select one, and let it expire without consequences for ignoring it. |
| **22 — Living director** | Generated developments may feel invisible in the Journal or like the system is redirecting the player. | Give entered scenes safe public labels; distinguish an available development from a completed player decision. |
| **23 — Story widgets** | Helpful at a glance, but blank valid widgets and redundant panels weaken confidence. | Fix audience-specific composition; show only meaningful public changes and avoid duplicate information. |
| **34 — Lorebook features** | Rich author controls can feel unreliable when clearing a field does not reset host behavior. | Make clearing exact, then show the resulting host configuration in the author review. |

**3. Combinations with plans 42–53**

The most useful foundation in the Astra review is its distinction between **disclosure, witnessing, belief and player knowledge**. The existing projections and rollback paths should adopt that distinction before new features multiply their consumers.

| Combination | Player benefit | Required constraint |
|---|---|---|
| **42 Witnesses + 43 Recall + Ask/panels** | Answers and reminders reflect what the relevant person actually learned. | Persist source spans/revisions and accepted classifications. Mixed-audience messages need conservative handling; presence alone is insufficient. |
| **44 Rumors + curator + 52 Codex** | Reports acquire sources and can later be corrected, making the world feel socially connected. | Store “someone said X” separately from X being true. Hearing a report does not make its recipient an original witness. |
| **45 New Game Plus + briefing + curator** | A sequel opens with a concise, intentional account of what carries forward. | Explicit carry mappings only. Shared lorebooks must not become accidental carry storage; legacy memory must not imply present progress. |
| **46 Consequences recap + Journal/widgets** | The player can see concrete effects of play without a mechanical dashboard. | Derive public effects from authoritative records. Describe causation only when evidence supports it; retain reversible chapter evidence. |
| **47 Promises + open stretches/director** | A remembered commitment supplies a more personal hook than a generic interruption. | Require the player’s evidenced commitment. Ignoring a prompt or declining a new request must not manufacture a broken promise. |
| **48 Scene test + 49 Complications + 19/22** | More varied developments with fewer repeated interruptions. | Share deterministic player-turn spacing and reversible selection state. Preserve the revised SP6 dependency; refusal must not raise pressure. |
| **50 Calendar + briefings/widgets/promises** | Time becomes legible and deadlines become understandable. | One canonical story clock; no wall-clock or message-count substitution. Implement the revised sequence before scene-break advancement. |
| **51 Relationships + 52 Codex + 53 Factions** | Known people and groups develop understandable social histories. | Known-entity filtering first; historical discoveries must not masquerade as current feelings. Keep numbers private and faction perception scoped to who heard. |

Three additional small ideas:

- **Return-to-play card:** current public situation, last public change, and one unresolved player-authored intention. Compose it deterministically from existing records.
- **Optional-offer shelf:** a currently offered encounter remains available briefly in the UI, without repeated prompt injection or any penalty for ignoring it.
- **“Why is this here?” provenance:** a small source link on a suggestion, codex fact or recap item opens the supporting visible message. Omit it when no safe source exists.

**4. Top 10 actions, ranked by player value per effort**

Effort estimates are relative, not measured.

| Rank | Action | Effort | Value |
|---:|---|:---:|---|
| **1** | Remove author-description fallback from all player projections. | XS | Closes a direct spoiler-input path. |
| **2** | Bind Ask/suggestions to transcript windows and invalidate stale displayed results. | S | Restores trust after swipes and edits. |
| **3** | Isolate curator-created lore by originating run across every scan path. | M | Protects fresh play and makes future carry behavior intentional. |
| **4** | Invalidate pending living proposals/divergence on every relevant rollback. | M | Prevents erased events from steering the future. |
| **5** | Implement explicit clearing semantics for lorebook provisioning. | S | Makes wizard edits match their reported result. |
| **6** | Add safe public labels for entered living scenes. | S–M | Makes director progress visible and memorable. |
| **7** | Add reversible, player-turn encounter spacing and single-candidate offers. | S–M | Reduces repetitive interruptions in group play. |
| **8** | Fix author meter projection and briefing vocabulary false positives. | S | Removes two inexpensive “feature appears broken” failures. |
| **9** | Apply the shared provenance/knowledge contract to existing projections before adding more consumers. | M | Prevents repeated privacy and rollback mistakes across 42–53. |
| **10** | Run a focused synthetic real-model/browser acceptance batch against unchanged floors. | M | Measures briefing usefulness, agency, encounter restraint and director uptake without exposing the campaign. |

For that acceptance batch, include delayed-response edits, a fresh second run sharing a lorebook, engaged conversation without gate progress, and adversarial player-agency phrasing. Record misses against the predeclared floors; do not lower the floors or switch built features off to obtain a pass.