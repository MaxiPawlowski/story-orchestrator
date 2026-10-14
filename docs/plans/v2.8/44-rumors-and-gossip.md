# Plan 44 — Rumors and gossip

**Status: v2.8, owner decision 2026-10-14 (new idea), not built.** Pairs with v2.8 42 (who heard what) and v2.8 43
(exact words). Implementation D; acceptance CL (voicing fixture, second-model labels) and RP or LT (one live leg).

## 1. What it is

- Today a character knows what extraction says it witnessed or was told, and nothing travels after that. If the
  blacksmith learns something at noon, the innkeeper never hears it, however close the two are.
- Rumors make knowledge **move between characters over story time**: along authored channels (who talks to whom), after
  a delay, sometimes changed on the way. The innkeeper ends up with a secondhand version ("heard from the blacksmith
  that…"), possibly wrong.
- It reuses what exists: the epistemic rows (`[knows]`, `[suspects]`, `[believes]`, `[hiding]`, `[unaware]`), the
  per-member private block, character life (relationships, agendas, schedule, clock) and seeded chance.
- The player meets rumors **secondhand**: a character repeats its version; nothing announces "a rumor spread".
- Secrets travel only where the author allows it, and then as a reveal the held-secret machinery already understands.
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
  a rumor that reaches everyone has the same shape and must be treated the same way.

## 3. Current state in code

Verified on master `211d8d96`.

- **Epistemic rows:** `EpistemicEntry {subject, tag, content, hiddenFrom?, messageId?, pinned?, provenance, retiredAt?}`
  (`src/memory/types.ts:105-124`); tags `knows, unaware, suspects, believes, hiding, intends` (`:95`).
- **Write path:** `MemoryCoordinator.applyEpistemic` → `dropCommonKnowledge` → `applyEpistemicSignals` →
  `capEpistemic` → `updateInjection()` (`src/runtime/coordinators/memoryCoordinator.ts:351-363`); retire by id via
  `retireIds` (`src/memory/epistemic.ts:72-118`). Caps: 80 total, 12 per subject (`:9-10`, `capEpistemic` `:223-240`).
- **Rollback:** `rollbackEpistemic(entries, messageId)` drops rows sourced at or after the message (pinned rows go
  `source-removed`) and un-retires rows retired after it (`src/memory/epistemic.ts:178-189`; `keepPinnedFrom`
  `src/memory/provenance.ts:108-113`).
- **Held secrets:** `heldSecrets()` excludes a barred member's own echoes from `knowers`
  (`src/memory/heldSecrets.ts:27-30`), so a `[knows]` row given to a barred member does **not** make it a knower: the
  secret is still redacted from its shared tiers. A rumor reaching a barred member must therefore be an explicit
  retire of the `[hiding]`/`[unaware]` row, never a quiet extra `[knows]`.
- **Private block per drafted member:** `renderPrivateEpistemicBlock` (`src/memory/epistemic.ts:139`), swapped in
  `onMemberDrafted` (`src/runtime/memoryInjector.ts:119,254`); registry key `story_orchestrator_epistemic`, depth 4, not
  scannable (`src/constants/injectionRegistry.ts:20`). Epistemic data is never written to World Info (architecture).
- **Character life:** `LifeMember {relationships, mood?, agenda, schedule}`, `RelationshipDecl {toward, axes, range,
  step, start}`, `StoryClock`, relationship quality key `rel_<holder>_<toward>_<axis>` (`src/engine/lifeSchema.ts:15-85`);
  day key `story_day` (`:9`). Presence/away per member (`src/engine/life/presence.ts:45-65`). Agendas never call a model.
- **Seeded chance:** `chanceSeed`, `seededStream`, `unitDraw(parts)` (`src/engine/chance.ts:10-33`); runtime context
  hash(chat, story, boundary, key) (`src/runtime/chance.ts`).
- **Boundary work registry:** entries like `meanwhile-land` (order 6), `living-apply`, `scene-read`
  (`src/runtime/boundaryWork.ts:36-210`).
- **Nothing spreads knowledge** between members today; no rumor schema, no channel, no `rumor` provenance.

## 4. Design options

| | Design | Model calls | Risk | Verdict |
|---|---|---|---|---|
| A. Authored rumors only | Story declares rumors (seed text, origin member, versions, spread gate); code spreads them along channels with seeded delay and seeded version pick | none | author work; nothing emergent | **stage 1** |
| B. Emergent spread of extracted rows | Any live `[knows]` row whose subject has an authored channel may spread to the channel's partner, verbatim or hedged (`[suspects]` "heard that …"); never `[hiding]`/`[unaware]` content | none | spreads trivia; cap pressure on the 12-per-subject budget | **stage 2** |
| C. Model-distorted versions | B plus a model rewrites the passed-on version (exaggerate, blur names) | one CL call per hop, propose-only like meanwhile | drift into invented facts; unreached-content spoilers | later, only if A/B voicing is flat |
| D. Shared "town knowledge" tier | Rumors as a shared memory tier everyone reads | none | breaks per-member privacy; the T2-2 class | refused |
| E. Nothing | Characters keep inventing carriers (v2.6 finding) | — | — | fallback |

## 5. Recommendation

**A then B, deterministic, no model call. C stays a candidate.**

**Authoring** (story schema, validated in `engine/validate/life.ts` style):
- `life.members[].gossip: { talks_to: [rosterId], when?: <gate>, delay: { boundaries: [min, max] } | { days: [min, max] },
  hops?: 2 }`. A channel is one-way; `when` can read relationship qualities (`rel_*`), schedule location, or any gate.
- `rumors: [{ id, from: rosterId, text, versions?: [{ text, true: boolean, weight }], starts_when?: <gate>,
  leaks_to?: [{ member, when: <gate> }] }]` (stage 1). Stage 2 adds `gossip.topics?: [entity]` to scope which extracted
  rows may travel.

**Spread** (pure core `src/memory/rumors.ts`, runtime boundary work `rumor-spread` after `meanwhile-land`, lazy chunk
with the game layer):
- At each committed boundary, for each carrier row and open channel whose gate holds: a pending hop is scheduled with a
  delay drawn by `unitDraw([chat, story, rumorId, from, to, hop])`; when due, the version is drawn the same way.
  **Never `Math.random`.** The draw keys omit the boundary, so the same hop yields the same delay and version on replay.
- A due hop becomes an epistemic signal for the receiver: faithful true version → `[knows]` "heard from <from>: …";
  false version → `[believes]`; hedged (stage 2 default) → `[suspects]`. Provenance `code` with detail
  `rumor:<id>:<from>:<hop>`, `messageId` = the boundary's `lastMessageId`.
- Applied through the existing write path (`applyEpistemicSignals` + `capEpistemic` + `updateInjection()`), skipping
  `dropCommonKnowledge` for rumor signals, but a rumor that reaches every enabled member stops spreading and stays as
  ordinary rows.
- Away members (presence) and members outside the group receive nothing; a hop waits until both ends are present or
  the channel says otherwise.
- Hop limit (default 2) and a per-boundary cap (3 hops) keep it bounded.

**Secrets:**
- A row with tag `hiding`/`unaware`, or a `[knows]` row that `keptFrom` would redact for the receiver, never travels to
  a barred receiver. Not even a distorted version (distortion of a secret is still the secret).
- Only an authored `leaks_to` rule may pass one, and then the hop **retires** the `[hiding]`/`[unaware]` row through
  `retireIds` (a reveal) and adds the receiver's row. The reveal is journaled like any retire.
- Stage 2 rows are checked against `heldSecrets` at spread time **and** at apply time (state may change in between).

**State and rollback:**
- `extras.rumors {pending: [{rumorId, from, to, hop, due, version}], landed: [{…, messageId}]}`, cap 200, persisted.
- Rollback to message m: drop `landed` rows with `messageId ≥ m` and `pending` scheduled at or after m;
  `rollbackEpistemic` already drops the receiver rows and un-retires leak reveals. Replay recomputes the same hops.
- Never written to World Info, never to the memory mirror, never to the shared tiers.

**Player and author surfaces:**
- Player: none new (v2.8 rule 4); rumors reach play only through characters' private blocks. A player-facing "rumors
  heard" journal waits for a session that asks for it.
- Author view: a rumor list in the Memory panel (origin, hops, version, landed at), and next-turn preview shows the
  receiver's rumor rows (already part of the private block).
- Studio: `rumors` and `gossip` editors under "State and rules", guide topics (`copilot/guideCoverage.test.ts`).
- On by default once built (v2.8 rule 9); a story with no `gossip`/`rumors` does nothing.

## 6. Predeclared floors

Committed before any run; never retuned.

| # | Condition | Floor |
|---|---|---|
| G1 | Determinism: same chat, story, boundaries → same hops, delays, versions | 0 divergent across 4 seeds × 2 runs |
| G2 | `rollback ≡ replay` (swipe, edit, delete, reopen mid-delay) | 0 divergent in property cases |
| G3 | Secret safety: a held-secret phrasing reaching a barred member without a `leaks_to` rule | 0 over the property generator (planted secret per case) |
| G4 | Leak reveals: an authored leak retires the secret row and is journaled | 100 % of fixture leaks |
| G5 | No `Math.random`, no World Info write | guard tests: chance-source grep, `lorebookWriters.guard.test.ts` census unchanged |
| G6 | Player surfaces identical with and without a rumor in flight | 0 diffs (`so-ui.mts assert-player-clean` + snapshot diff) |
| G7 | Voicing (CL): on a 20-case fixture where a receiver holds a rumor and the turn invites it, the reply uses the **received** version, not the origin's | ≥ 0.7, second-model labelled |
| G8 | Fidelity of false versions (CL): reply asserts the false version as heard, not as narrator fact | ≥ 0.8 |
| G9 | Spoilers: a rumor row referencing unreached checkpoints | 0 in a spoiler subset (stage 1 rumors gated by `starts_when`) |
| G10 | Cost | 0 added model calls (stages 1–2); boundary work p95 ≤ 5 ms on a 12-member fixture |

## 7. Gates by tier

**Implementation (D):**
- `npm run gates`; `npm run typecheck:test` for the new tests.
- jest: schema validation (unknown member, self-channel, cycle with hops > limit refused), spread core (delay window,
  version weights from seeded draws, hop limit, per-boundary cap, away members), G1–G5 property tests, leak retire path,
  `heldSecrets` re-check at apply time, rollback of pending and landed hops.
- No-LLM scenario on a lane: a fixture story with two channels and one leak, `send` turns, `expect` receiver rows and
  journal lines; swipe mid-delay; cleanup per debug-scripts rules.
- Storybook stories for the author rumor list and the Studio editors; feature registry + Help entry (v2.8 rule 10).
- Guide topics in `docs/authoring/story-guide.md`, then `npm run docs:guide`, `npm run docs:settings`.

**Acceptance:**
- CL: G7/G8 voicing fixture (20 cases, second-model labels), ×2.
- RP or LT: one live leg on an adolion-fresh lane if the campaign adopts rumors (decision 4), else on a generic fixture
  group: 30 turns, run header diff around the batch, G6 checked live.

## 8. Privacy and spoiler notes

- Rumor rows live only in the receiver's private block; the shared transcript is unchanged. ST Summarize / Vector
  Storage do not see rows, only what characters say aloud (the `transcript-copiers` alert covers that channel).
- No rumor text appears in player surfaces; reports name counts only for campaign data.
- If the Adolion campaign adopts rumors, the authored rumor content lives in the private campaign repo and is reviewed
  by a second model, never by the owner.

## 9. Dependencies and links

- v2.7 37 character life: relationships, schedule, clock, agendas (channels read them); meanwhile facts are the closest
  existing pattern.
- v2.8 42 witness filter v2: once its witness record exists, a member present but not addressed can "overhear" (a
  channel with origin = witness set); without it, origins are extracted rows only.
- v2.8 43 verbatim recall: a stage 3 option is quoting the origin line through 43's filter ("she said, word for word…").
- v2.8 22 living director: may author new rumors as part of its future-only ops later; not in this plan.
- v2.8 13 J7.3 epistemic via the judge: could check voicing (G7) instead of a second model; not required.

## 10. Decisions for the owner

1. Build stage 1 (authored rumors, deterministic) now? **Recommended: yes.**
2. Stage 2 (extracted `[knows]` rows spread along channels)? **Recommended: yes, after stage 1's gates; hedged as
   `[suspects]` by default.**
3. Model-distorted versions (C)? **Recommended: not now; revisit if G7 shows flat, repetitive voicing.**
4. Should the Adolion campaign use rumors? **Recommended: yes for stage 1, authored by another model in the campaign
   repo, pin bump and reinstall per the docs-and-campaign rule.**
5. Player-visible "rumors heard" journal? **Recommended: no until a session asks for it (v2.8 rule 4).**
6. Leaks of secrets through people: author rule only, or also on relationship thresholds without a rule?
   **Recommended: authored `leaks_to` only.**

## 11. Unresolved questions

- Whether rumor rows should count against the 12-per-subject cap or get their own small cap (G7 runs will show crowding).
- Clock-based delays need a story clock; stories without one fall back to boundaries. Whether `days` should be refused
  without a clock (validation) or silently mapped.
- How a receiver who later witnesses the truth retires a false `[believes]` rumor: the existing retire prompt should
  do it; to be confirmed on the fixture.
