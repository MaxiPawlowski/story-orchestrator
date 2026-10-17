# Plan 44 — Rumors and gossip

**Status: v2.8, owner decision 2026-10-14 (new idea), not built. Revised 2026-10-14 against the Astra review (owner
approved; §12).** Pairs with v2.8 42 (who heard what; §0 shared audience/provenance contract) and v2.8 43 (exact
words). Implementation D; acceptance CL (voicing fixture, second-model labels) and RP or LT (one live leg).

## 1. What it is

- Today a character knows what extraction says it witnessed or was told, and nothing travels after that. If the
  blacksmith learns something at noon, the innkeeper never hears it, however close the two are.
- Rumors make **claims move between characters over story time**: along authored channels (who talks to whom, when
  they are in contact), after a delay, sometimes changed on the way. The innkeeper ends up with **hearsay**: "the
  blacksmith told me that…", which may be wrong.
- Hearsay is typed separately from truth (v2.8 42 §0 **told** + **believed**): the receiver knows that someone said
  something, holds a belief stance about it, and the authored truth stays author-side. Extraction never promotes
  hearsay into fact or canon.
- The player meets rumors **secondhand**: a character repeats its version; nothing announces "a rumor spread".
- **Stage 1 carries non-secret subjects only.** Secrets travel only after recipient-specific disclosure is built
  (§5.4), and then only along an authored `leaks_to` rule, as a disclosure to one recipient.
- Group chats only (v2.7 03).

## 2. History and evidence

- Owner idea list 2026-10-14 (this plan's origin). Prior art in our own plans: "the world having momentum (weather,
  people, rumours, a deadline the world states)" (`docs/plans/v2.8/19-open-stretches.md:49`); v2.7 37 L3 agendas and
  curator-proposed "meanwhile" facts land in a member's private block (`docs/plans/v2.7/37-character-life.md:85-125`).
- v2.6 sessions show the need: the narrator invented a rumour-carrier the guidance gave to another member
  (`docs/plans/v2.6/14-findings.md:213`). Knowledge that should have been secondhand had no path, so the model made one.
- Privacy history this must not reopen: v2.6 T2-2 (secrets through shared tiers, fixed per member, `a19c7023`),
  K1/K2 (`7ee079f2`), the held-secret invariant (`.claude/rules/architecture.md` §Memory and privacy).
- Common-knowledge pruning exists because models hand everyone the same `[knows]` line (`src/memory/epistemic.ts:198-220`);
  a rumor that reaches everyone has the same shape.

## 3. Current state in code

Verified on master `211d8d96`; re-checked on `3a716f2b` for the review.

- **Epistemic rows:** `EpistemicEntry {subject, tag, content, hiddenFrom?, messageId?, pinned?, provenance, retiredAt?}`
  (`src/memory/types.ts:105-124`); tags `knows, unaware, suspects, believes, hiding, intends` (`:95`). Row ids come
  from `generateMemoryId()` (`crypto.randomUUID` or `Math.random`, `src/memory/types.ts:237-242`): not stable across
  replay, so never a seed for draws.
- **Write path:** `MemoryCoordinator.applyEpistemic` → `dropCommonKnowledge` → `applyEpistemicSignals` →
  `capEpistemic` → `updateInjection()` → **memory-mirror resync when `heldSecretsKey()` changed**
  (`src/runtime/coordinators/memoryCoordinator.ts:351-363`). Calling the pure helpers alone skips the mirror resync.
- **Retirement is whole-row:** `applyEpistemicSignals(…, retireIds)` sets `supersededBy` on the whole entry
  (`src/memory/epistemic.ts:72-90`); `heldSecrets()` derives protection from active rows only
  (`src/memory/heldSecrets.ts:21-35`). Retiring a `[hiding]` row hidden from several members lifts it for all of them.
- **Caps do not reserve protection:** `capEpistemic` keeps the newest unpinned rows per subject (12) and overall (80)
  with no reservation for `[hiding]`/`[unaware]` (`src/memory/epistemic.ts:223-240`). New rows on a subject can evict
  its secret restriction. **A fix is in progress on branch `v2.8-epistemic-cap`** (protection rows reserved, never
  evicted by caps); this plan depends on it.
- **Rollback:** `rollbackEpistemic(entries, messageId)` drops rows sourced at or after the message (pinned rows go
  `source-removed`) and un-retires rows retired after it (`src/memory/epistemic.ts:178-189`).
- **Held secrets:** `heldSecrets()` excludes a barred member's own echoes from `knowers`
  (`src/memory/heldSecrets.ts:27-30`), so a `[knows]` row given to a barred member does not make it a knower.
- **Private block per drafted member:** `renderPrivateEpistemicBlock` (`src/memory/epistemic.ts:139`), swapped in
  `onMemberDrafted` (`src/runtime/memoryInjector.ts:119,254`); registry key `story_orchestrator_epistemic`, depth 4,
  not scannable (`src/constants/injectionRegistry.ts:20`).
- **Character life:** `LifeMember {relationships, mood?, agenda, schedule}`, relationship key
  `rel_<holder>_<toward>_<axis>` (`src/engine/lifeSchema.ts:15-85`); day key `story_day` (`:9`). Presence compares a
  member's schedule location with the **party** location (`src/engine/life/presence.ts:15-20`): "away from the
  player" says nothing about whether two NPCs are together.
- **Seeded chance:** `chanceSeed`, `seededStream`, `unitDraw(parts)` (`src/engine/chance.ts:10-33`).
- **Boundary work:** `meanwhile-land` (order 6) **launches** `meanwhile.land` with `void` and does not await it
  (`src/runtime/boundaryWork.ts:43-48`); "after meanwhile-land" does not mean after its writes.
- **Nothing spreads knowledge** between members today; no rumor schema, no channel, no hearsay type.

## 4. Design options

| | Design | Model calls | Risk | Verdict |
|---|---|---|---|---|
| **A. Authored rumors, typed hearsay, non-secret subjects** | Story declares rumors (claim text, origin member, versions with authored truth, start gate); code spreads them along channels with explicit contact, seeded delay and seeded version pick, as hearsay rows | none | author work; nothing emergent | **stage 1** |
| A+. Authored secret leaks | A plus `leaks_to` disclosures of a held secret to one named recipient | none | needs recipient-specific reveal state (§5.4) | **stage 1b, after §5.4 and the cap fix** |
| B. Emergent spread of extracted rows | A live `[knows]` row on an explicitly eligible topic, with stable source lineage, spreads as hedged hearsay; never `[hiding]`/`[unaware]` content | none | trivia; crowding | **stage 2**, only with G15 crowding measured |
| C. Model-distorted versions | B plus a model rewrites the passed-on version | one CL call per hop, propose-only | drift into invented facts; spoilers | later, only if voicing is flat |
| D. Shared "town knowledge" tier | Rumors as a shared memory tier everyone reads | none | breaks per-member privacy; the T2-2 class | refused |
| E. Nothing | Characters keep inventing carriers (v2.6 finding) | — | — | fallback |
| F. Conflicting testimony (added 2026-10-14, Astra brainstorm) | Track "who claims what" apart from truth: an authored or landed rumor version becomes a **claim** row `{claimant, subject, version, true?}`; two members holding different versions of one rumor are "in disagreement"; each member's private block may say "<other> tells it differently"; conversation, not exposition, settles it, through an authored `settles_when` gate that retires the false version as a `[believes]` correction | none | a disagreement line can reveal that a false version exists to a member who should not know; the truth flag must never reach a shared tier | candidate on top of A (decision 7) |

**Option F detail (candidate).** Builds on stage 1 versions (`versions[].true`). The claim is the version a member
holds (`[knows]` for a true one, `[believes]` for a false one, as stage 1 already writes), so no new store: a pure
read `claimsOf(rumorId)` groups the receivers' rows by version. A member sees "<other> tells it differently" only
when both are present and the other has spoken of it in a witnessed exchange (v2.8 42); never the truth flag, never
which version is true. `settles_when` (authored gate) retires the false rows through `retireIds` and adds a
`[knows]` correction, journaled; history of having heard the false version stays in the journal, not in play. The
existing claim rule (`CLAIM_RULE`, `src/memory/contract.ts:28-29`: a character's claim is recorded as a claim, never as
the event) is the read-side precedent. Floor if built: 0 truth flags or "which is true" text in any shared tier or
player surface over ≥ 500 seeds (D); rollback ≡ replay of settle retirements (D).

## 5. Recommendation

**A first (non-secret, typed hearsay), then A+ once recipient-specific disclosure and the cap fix land, then B with
topic eligibility and crowding measured. No model call. C stays a candidate.**

### 5.1 Authoring (validated in `engine/validate/life.ts` style)

- `life.members[].gossip: { talks_to: [rosterId], contact: "together" | "any" | <gate>, when?: <gate>,
  delay: { boundaries: [min, max] } | { days: [min, max] }, hops?: 2 }`. A channel is one-way.
- **Contact model:** `together` (default) = both members' schedule locations (`whereabouts`) are equal and known;
  `any` = they can reach each other regardless (letters, messengers); a gate = author-defined. Being away from the
  party does not close a channel. A member outside the group never sends or receives.
- `rumors: [{ id, from: rosterId, claim, about?: [entity], versions?: [{ text, truth: "true" | "false" | "unknown",
  weight }], starts_when?: <gate>, leaks_to?: [{ member, when: <gate> }] }]`. `truth` is author-only data; it never
  reaches a prompt.
- Validation refuses a stage-1 rumor whose claim restates an active `[hiding]`/`[unaware]` phrasing at import time
  when the story authors that secret, and refuses `days` without a story clock.

### 5.2 Hearsay rows (typed, not facts)

- A landed hop writes a **hearsay row**, a slice of its own (`extras.memory.hearsay`), not an epistemic `[knows]`:
  `{occurrenceId, receiver, teller, claim (the version text), rumorId, stance: "believes" | "doubts" | "unsure",
  told: <v2.8 42 §0 source: the boundary's lastMessageId + revision>}`. Stance is drawn deterministically from the
  version weight and the receiver→teller relationship (authored mapping, default `unsure`).
- The private block renders it as attributed speech: "<teller> told you: <claim> (you <stance> it)". The epistemic
  extraction contract gains one rule: a claim the window only repeats from hearsay is not a `[knows]` or a fact; the
  memory read treats hearsay rows as read-only context.
- A receiver who later witnesses the truth gets an ordinary epistemic row; the hearsay row stays (history of being
  told), with its stance moved to `doubts` by an explicit correction signal, never deleted.

### 5.3 Spread as reversible hop events

- Pure core `src/memory/rumors.ts`; runtime boundary work `rumor-spread` in the lazy game-layer chunk.
- **Stable occurrence ids:** `occurrenceId = hash(chatId, storyId, rumorId, from, to, hop, parentOccurrenceId)`.
  Draws use `unitDraw([chat, story, occurrenceId, "delay" | "version" | "stance"])`. Never a memory id, never
  `Math.random`, never the boundary.
- **Event log** `extras.rumors.events: [{occurrenceId, rumorId, from, to, hop, scheduledAt: {boundary, messageId},
  due, version, landedAt?: {boundary, messageId}}]`, deduplicated by `occurrenceId`. Cap 200 with deterministic order
  (due, then occurrenceId), and retention never below the engine's rollback horizon (`historyFloor`): events newer
  than the floor are never evicted.
- **Rollback to message m:** events with `scheduledAt.messageId ≥ m` are removed; events with `landedAt.messageId ≥ m`
  but scheduled before m return to **pending** (`landedAt` cleared, hearsay rows for that occurrence removed). Replay
  re-lands them at the same due point.
- **Sequencing:** `rumor-spread` reads a stable boundary input snapshot taken synchronously at boundary work start
  (the committed blackboard, the hearsay slice and the active epistemic rows at that moment). It does not depend on
  `meanwhile-land`'s asynchronous writes; those are visible at the next boundary.
- Per-boundary cap 3 landings, hop limit default 2; a claim that reaches every enabled member stops spreading.

### 5.4 Secrets: recipient-specific disclosure (stage 1b)

- **Never whole-row retirement for a reveal.** A `[hiding]`/`[unaware]` row gains `disclosedTo: [{member,
  occurrenceId, at: {boundary, messageId}}]`. `heldSecrets()` treats a disclosed member as a knower **of that secret
  only**; every other barred member stays barred.
- Disclosure happens only through an authored `leaks_to` rule (v2.8 42 §0 **authorized disclosure**), lands through a
  coordinated memory write (§5.5) and is journaled. Rollback removes `disclosedTo` entries at/after m.
- Protection rows are never evicted by caps (branch `v2.8-epistemic-cap`); hearsay rows have their own cap (48 per
  chat, 6 per receiver) and never count against the epistemic budget.
- Stage 2 rows are checked against `heldSecrets` at schedule time **and** at land time.

### 5.5 Writes go through the coordinator

- A new `MemoryCoordinator.applyHearsay(rows, disclosures, messageId)` writes the hearsay slice and any
  `disclosedTo`, then `updateInjection()` and, when `heldSecretsKey()` changed, the memory-mirror resync, the same
  sequence `applyEpistemic` uses (`memoryCoordinator.ts:351-363`). The pure core never writes.

### 5.6 Stage 2 (extracted rows)

- Only rows whose subject is in an explicit `gossip.topics` list (no default topic), with stable source lineage: the
  row's source span (v2.8 42 §0), so `occurrenceId` derives from the span, not the random row id. Hedged as
  `stance: "unsure"`. Requires G15 crowding numbers before it is on.

### 5.7 Surfaces

- Player: none new (v2.8 rule 4).
- Author view: a rumor list in the Memory panel (origin, hops, version, stance, pending/landed), next-turn preview
  shows the receiver's hearsay rows.
- Studio: `rumors` and `gossip` editors under "State and rules", guide topics (`copilot/guideCoverage.test.ts`).
- On by default once built (v2.8 rule 9); a story with no `gossip`/`rumors` does nothing.

## 6. Predeclared floors

Committed before any run; never retuned. G11–G15 added and G7–G9 tightened 2026-10-14 by the review (never run).

| # | Condition | Floor |
|---|---|---|
| G1 | Determinism: same chat, story, boundaries → same events, delays, versions, stances | 0 divergent across 4 seeds × 2 runs |
| G2 | `rollback ≡ replay` (swipe, edit, delete, reopen mid-delay) | 0 divergent in property cases |
| G3 | Secret safety: a held-secret phrasing reaching a barred member without a `leaks_to` rule | 0 over the property generator (planted secret per case) |
| G4 | Authored leaks: a disclosure adds `disclosedTo` for the named recipient and is journaled | 100 % of fixture leaks |
| G5 | No `Math.random`, no memory-id seed, no World Info write | guard tests: chance-source grep, `lorebookWriters.guard.test.ts` census unchanged |
| G6 | Player surfaces identical with and without a rumor in flight | 0 diffs (`so-ui.mts assert-player-clean` + snapshot diff) |
| G7 | Voicing (CL): 20 cases where the receiver's prompt holds both the origin's version (in the transcript) and its received version, and the turn invites it | received version used ≥ 0.7, second-model labelled; **feature-off baseline** on the same cases reported beside it and on-minus-off ≥ +0.3 |
| G8 | Hearsay framing (CL): reply presents a received claim as heard ("I heard…"), not as narrator fact | ≥ 0.8; off baseline reported |
| G9 | Spoilers: a rumor row referencing unreached content | 0 in a spoiler subset that includes **paraphrased** spoilers of unreached checkpoints, not only checkpoint names |
| G10 | Cost | 0 added model calls; boundary work p95 ≤ 5 ms on a 12-member fixture |
| G11 | Recipient-specific reveal: after a leak to one recipient, every other barred member's shared tiers and private block | 0 secret phrasings (property, ≥ 2 barred members per case) |
| G12 | Protection survives caps: rumor and epistemic churn on a secret's subject | 0 evicted `[hiding]`/`[unaware]` rows (depends on `v2.8-epistemic-cap`) |
| G13 | Pending restored: a hop scheduled before m and landed after m, rollback to m | 100 % back to pending and re-landed at the same due point on replay |
| G14 | No promotion: hearsay claims (true and false versions) appearing as facts, `[knows]` rows, canon or chapter consequences after a 30-turn fixture | 0 |
| G15 | Crowding (stage 2): DELTA and epistemic recall with stage 2 on vs off | live-suite per-tier floors not below the off arm by more than 0.02; private block p95 tokens reported |

## 7. Gates by tier

**Implementation (D):**
- `npm run gates`; `npm run typecheck:test` for the new tests.
- jest: schema validation (unknown member, self-channel, cycle with hops > limit, `days` without clock, secret-restating
  stage-1 claim refused), contact model (`together` from two schedules, away-from-party NPCs still in contact),
  spread core (delay window, version and stance draws, hop limit, per-boundary cap), event log rollback (G13),
  occurrence-id stability, `applyHearsay` calls injection refresh and mirror resync (coordinator test with injected
  deps), G1–G5, G11, G12 property tests.
- No-LLM scenario on a lane: a fixture story with two channels and one leak, `send` turns, `expect` receiver rows and
  journal lines; swipe mid-delay; cleanup per debug-scripts rules.
- Integration case **rumor reveal × memory mirror**: a disclosure changes the mirror only for the recipient's view.
- Storybook stories for the author rumor list and the Studio editors; feature registry + Help entry (v2.8 rule 10).
- Guide topics in `docs/authoring/story-guide.md`, then `npm run docs:guide`, `npm run docs:settings`.

**Acceptance:**
- CL: G7/G8 voicing fixture (20 cases, on and off arms, second-model labels), ×2; G14 on the 30-turn fixture.
- RP or LT: one live leg on an adolion-fresh lane if the campaign adopts rumors (decision 4), else on a generic fixture
  group: 30 turns, run header diff around the batch, G6 checked live.

## 8. Privacy and spoiler notes

- Hearsay rows live only in the receiver's private block; the shared transcript is unchanged. ST Summarize / Vector
  Storage do not see rows, only what characters say aloud (the `transcript-copiers` alert covers that channel).
- Authored truth values never reach a prompt or a player surface.
- No rumor text appears in player surfaces; reports name counts only for campaign data.
- If the Adolion campaign adopts rumors, the authored content lives in the private campaign repo and is reviewed by a
  second model, never by the owner.

## 9. Dependencies and links

- v2.8 42 §0 shared audience/provenance contract (told, believed, authorized disclosure) and B (overhearing).
- Branch `v2.8-epistemic-cap` (capEpistemic reserves protection rows): required before A+ and B.
- v2.7 37 character life: relationships, schedule, clock (contact and stance read them).
- v2.8 43 verbatim recall: a told member may get the telling span, never the origin.
- v2.8 22 living director: may author rumors as future-only ops later; not in this plan.
- v2.8 47 promises: a public fulfilment can become an authored rumor; private promises never spread.
- v2.8 53 reputation: a faction reacting to a received version is a later combination, not here.

## 10. Decisions for the owner

1. Build stage 1 (authored rumors as typed hearsay, non-secret subjects, deterministic) now? **Recommended: yes.**
2. Secret leaks (A+)? **Recommended: yes, only after recipient-specific disclosure (§5.4) and the
   `v2.8-epistemic-cap` fix land; authored `leaks_to` only.**
3. Stage 2 (extracted rows along channels)? **Recommended: after stage 1's gates, explicit `gossip.topics` only, with
   G15 measured; hedged by default.**
4. Model-distorted versions (C)? **Recommended: not now; revisit if G7 shows flat voicing.**
5. Should the Adolion campaign use rumors? **Recommended: yes for stage 1, authored by another model in the campaign
   repo, pin bump and reinstall per the docs-and-campaign rule.**
6. Player-visible "rumors heard" journal? **Recommended: no until a session asks for it (v2.8 rule 4).**
7. Default contact model? **Recommended: `together` (shared schedule location); `any` must be authored.**
8. Option F, conflicting testimony (added 2026-10-14 from the Astra brainstorm)? **Recommended: candidate after stage
   1's gates and v2.8 42's witness record; no player surface.**

## 11. Unresolved questions

- Whether the stance mapping from relationship axes needs authoring per member pair or a story-wide default suffices.
- Whether hearsay rows should feed the codex's "I was told" lane (v2.8 52) directly or only through player-visible
  speech.
- Whether a correction (witnessing the truth) should be an extraction signal or an authored event in stage 1.

## 12. Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 42-47 (44). Verified on `3a716f2b`.

- **P0 — retiring a secret row reveals too broadly.** Accepted. Verified whole-row `supersededBy`
  (`epistemic.ts:72-90`) and active-row derivation (`heldSecrets.ts:21-35`). → §5.4 `disclosedTo` per recipient, no
  retirement for reveals; G11; secrets deferred to stage 1b.
- **P0 — gossip can evict the protection; coordinated write needed.** Accepted. Verified `capEpistemic` has no
  reservation (`epistemic.ts:223-240`) and the coordinator's mirror resync (`memoryCoordinator.ts:351-363`). → depends
  on branch `v2.8-epistemic-cap`; hearsay has its own cap; §5.5 `applyHearsay` through the coordinator; G12.
- **P1 — rollback loses pending work.** Accepted. Verified random ids (`types.ts:237-242`). → §5.3 event log with
  scheduling stamps, stable occurrence ids, dedup, deterministic cap order, retention ≥ rollback horizon; G13.
- **P1 — "after meanwhile-land" is not after completion.** Accepted. Verified `void` launch (`boundaryWork.ts:43-48`).
  → §5.3 stable synchronous input snapshot; no dependency on meanwhile writes.
- **P1 — hearsay and truth mixed; contact not modelled.** Accepted. Verified presence compares with party location
  (`presence.ts:15-20`). → §5.2 typed hearsay with teller and stance, author-only truth, no promotion (G14); §5.1
  explicit contact model.
- **Recommendation (authored, typed hearsay, non-secret first; topic eligibility, lineage and crowding for stage 2;
  off baselines; paraphrased spoilers).** Adopted: decisions 1–3, G7/G8 off baselines, G9 paraphrases, G15.
- Cross-plan: shared contract in v2.8 42 §0 referenced. Rebutted: none.

## Gate record: stage 1 + 1b build, 2026-10-16 (no model, no GPU, LIST)

Branch `v2.8-audience-42-44`. Built what decisions 1–3 allow now: stage 1 (A) and, since `v2.8-epistemic-cap` is merged (`57e53b64`),
§5.4 recipient-specific disclosure with authored leaks (A+). Not built: stage 2 (needs stage-1 gates and G15), C, option F.

Built:
- Authoring: `rumors[]` and `roster[].gossip` (`engine/rumorSchema.ts`, schema fields by module augmentation; `validate/rumors.ts` in the
  game layer): channels one-way, `contact` together (default) | any | gate, `when`, `delay` {boundaries|days} (days need a clock), `hops`
  1–3 (default 2); versions with author-only `truth` and `weight`; `leaks_to` [{member, when}]. Refused: unknown or self member, hops
  above 3, days without a clock, a claim restating an authored secret relationship label (the only secrets a story authors).
- Core `memory/rumors/spread.ts` (lazy, game layer): origin event when `starts_when` holds; hops along channels with stable occurrence
  ids (`chanceSeed` over chat, story, rumor, from, to, hop, parent); delay and version from `unitDraw([chat, story, occurrence, …])`;
  stance from the receiver's relationship toward the teller (first axis: top third believes, bottom third doubts, else unsure; deviation:
  no draw and no weight term); together = both schedule locations equal, whatever the party location; per-boundary cap 3; a member
  outside the group never sends or receives; each member hears a rumor once.
- Secrets: a hop is barred when any version of the rumor restates a secret kept from its receiver (held-secret phrasing, `keptFrom`), at
  schedule and at land time; barred hops wait. `leaks_to` delivers from the origin to that one member and records a disclosure per secret
  entry; `heldSecrets(…, disclosures)` makes that member a knower of that secret only (an `unaware` row stops barring its subject); the
  resting view stays barred. Disclosures are dropped while the feature is off (fail closed).
- Slice `extras.rumors` {events, hearsay, disclosures, settled}; `rollbackRumors` in quarantine; eviction only past the rollback horizon.
- Runtime `runtime/rumorPort.ts`: boundary work `rumor-spread` (order 9) reads the committed blackboard and active epistemic rows
  synchronously; writes the slice, refreshes the injection on a landing, resyncs the memory mirror when the held-secret key changed, and
  journals landings. Hearsay reaches only the receiver's private block (`addPrivateSource`, held-secret filtered): "- Bryn told you: …
  (you are not sure of it; hearsay, it may be wrong)". The read contract adds `HEARSAY_RULE` for rumor stories.
- Surfaces: Author view Memory › Rumors (`#so-rumors`), Studio "Rumors and gossip" editor (State and rules), `setRumors` wizard tool,
  feature `rumors` on by default (`memory.rumors`, policy `rumors`), guide topic `rumors`, plan 24 row. No player surface.

Floors (D):
- G1: 4 chats × 2 runs identical; occurrence ids stable per part. G2/G13: 4 seeds × 28 cuts, rollback to message m equals the run up to
  it and replay from there equals the full run; a hop landed after the cut goes back to pending with its hearsay removed. G3: planted
  secret plus a property over 40 generated channel sets (barred members get no hearsay row at all). G4: a leak lands, is marked and records
  its disclosure. G11: only the recipient becomes a knower; another barred member and the resting view stay barred (jest, and
  `rumorSecret.review.test.ts` through a real `MemoryInjector`: the recipient's private block and shared tiers carry the secret after the
  leak, the other barred member's and the resting view do not; a rollback bars the recipient again; the backstop redacts an undisclosed
  hearsay line). G5: grep guard (no `Math.random`, memory id or World Info write). G6: resting view and player snapshot identical with and
  without rumors in flight; the author slice only in Author view. G12: covered by the merged cap fix, not re-measured. G10: 0 model calls
  by construction; p95 not measured.
- Validation, `setRumors` tool and mutations: `validate/rumors.test.ts`, `studio/rumorOps.test.ts`; Storybook `Drawer/RumorsPanel` and
  `Studio/RumorsEditor` (in the 888 passing stories).
- Live no-model lane 69 (`C:\dev\st-live-aud`, served `03ae0c12ab8f` before and after each run): `test/scenarios/v28-44-rumors.json` PASS
  ×2: origin and a pending hop on the gate; one turn later the hop lands as Arin's private hearsay line with an Author view row; player
  mode clean (`assert-player-clean` 0); a reopen keeps it; a swipe of the landing reply returns it to pending (row and line gone) and the
  next turn re-lands the same occurrence at the same due point (live boundaries keep counting after a swipe, so it lands at the first
  boundary at or after its due); a reopen equals replay. Evidence `C:\dev\so-live-lanes\evidence-2026-10-16\69\2026-10-16T19-36-36-864Z-so-scenario-run`
  and `…19-37-19-415Z…`.
- Gates: as in the 42 record (full gates green, Storybook green).

Limits found: held-secret matching is lexical, so a version that paraphrases a secret without sharing its words is not caught on its own;
the "any version restates" rule closes the case where one version names it.

Owed: G7/G8 voicing fixture (20 cases, on/off arms, second-model labels), G9 paraphrased-spoiler subset, G14 30-turn fixture, G10 p95,
RP/LT leg; decision 5 (Adolion adopts rumors: campaign repo, pin bump, reinstall) not done; correction signal (§5.2, open question 3) not
built.

## Gate record addendum: after the main-entry diet, 2026-10-16 (no model, no GPU, LIST)

Build: master `4f2b53a2` (42 + 44 + the main-entry diet + master). Main bundle 1,282,779 B (budget 1,300,000). The diet moved the
memorize backlog, canon regenerate, the author memory decisions and the warden check into lazy chunks, and judge imports name their module
instead of the barrel. Full gates and Storybook green on `4f2b53a2` (coordinator run, Storybook 149 suites / 902 stories).

Live: no-model lane 69 (`C:\dev\so-live-lanes`), private code copy `C:\dev\st-live-aud` staged from a detached worktree at `4f2b53a2`,
images and sprites off, served `dist/index.js` sha256 `59bf6ba2c385` before and after every run. Each scenario run twice, back to back,
`--sandbox --group "Group: Arin, DM Narrator"`; every run `ok`, no failed step, no reap prompt or mirror book leaked:
- `v28-42-witness`: PASS ×2 (13 steps).
- `v28-44-rumors`: PASS ×2 (24 steps).
- `plan05-decision-write` (author memory decisions: resolve, reconfirm, refusal): PASS ×2 (6 steps).
- `live-v8-memory-decisions` (memory queue and quarantine): PASS ×2 (13 steps).
- `v27-s11d-held-secret-canon` (canon regenerate through the lazy unit): PASS ×2 (19 steps).
- `v28-40-judge-consumers` (warden notes through the lazy check, canon regenerate with canonVerify): PASS ×2 (8 steps).
- `v24-02-chat-delete-reap` (smoke): PASS ×2 (13 steps).

Verdict: plumbing green, real-LLM owed (no model or GPU on this run; every model and judge answer above is scripted).

Evidence `C:\dev\so-live-lanes\evidence-2026-10-16\69\`, run folders in the order above: `2026-10-16T23-48-24-313Z`, `…23-48-57-291Z`,
`…23-49-26-588Z`, `…23-50-02-540Z`, `…23-50-38-518Z`, `…23-50-59-254Z`, `…23-51-21-736Z`, `…23-51-52-275Z`, `…23-52-23-766Z`,
`…23-52-56-570Z`, `…23-53-44-404Z`, `…23-54-46-976Z`, `…23-55-24-309Z`, `…23-56-06-880Z` (each `-so-scenario-run`), with their
`so-scenario-result.json` files beside them.
