# Stagecraft — the curator fleet

Design doc for plan 07. The deterministic spine (checkpoints, gates, transitions, blackboard) is
**not** negotiable by any agent here. Stagecraft is everything *around* the spine: what the scene
looks like, what the model is told about the world, who is on stage, and whether the last reply
contradicted something established. D1 took that role away from the player; this is where it goes.

v2.1 **ships** the deterministic `background` effect and the World Info curator. Everything else on
this page is design intent for v2.2, written down now so the second curator does not re-invent the
contract the first one exports.

## Invariants (spec addendum §Stagecraft — binding on every curator, forever)

1. **Proposals only.** A curator returns typed data. Writes happen in the runtime, at a boundary,
   through an existing effect path. No curator calls a host API itself.
2. **Never the spine.** A curator can never write the blackboard, a memory tier, an arc, the
   epistemic map, the ledger, or fire a transition. `src/runtime/architecture.test.ts` enforces this
   for the WI curator by construction (no `@memory`/`@generation`/`@pacing` import, no `enqueue*`
   call) — every new curator gets a row in that guard.
3. **Bounded scope, authored explicitly.** A curator writes only where the story says it may. For
   World Info that is `stagecraft.lorebooks`; nothing is inferred from `requirements` or from
   `world_info` effects (user decision 2026-08-11). An absent or empty allowlist means the curator
   has nothing to write, full stop.
4. **Off-path.** Curators run on the memory LLM through the P2–P4 scheduler lanes. The reply path
   never waits for one. A pass that fails is a silent no-op plus a journal line.
5. **Journaled and reviewable.** Every proposal and every application lands in the session journal
   (`kind: "stagecraft"`), and the author can read, edit, accept or decline each change in the
   drawer's author view.
6. **Feature-flagged per curator**, default off until a live journey has earned the flag.
7. **Deterministic first.** If a checkpoint effect can express it, it is not an agent. Every
   candidate below carries that test explicitly.

## Deterministic stagecraft (shipped)

| Effect | Shape | Applied | Notes |
|---|---|---|---|
| `background` | `effects.background: "file.jpg"` or `{ name }` (normalized at parse) | `EffectsApplier.applyCheckpoint`, on activate **and** hydrate | Idempotent — an authored name already active is a no-op. Rollback re-applies the restored checkpoint's background through the existing hydrate path. Host seam: `stHost/backgrounds.ts` (`background_settings` for the read, `/bg <name>` for the write) |

Candidates deliberately **not** added: ambience and music. Neither has a verified ST host seam, and
inventing one would put a presentation nicety on the same footing as the verified paths.

## The fleet

Each curator is one concern, one prompt, one lane. `[shipped]` is built; the rest are designed.

### 1. World Info curator `[shipped, flag: stagecraft.curatorEnabled, default off]`

**Why an agent.** Deciding that "the bridge is intact" has become false requires reading the story
so far against an entry's prose. No gate expression can say that. A checkpoint effect *can* switch a
pre-authored entry on or off, and that path stays the right one when the author knows in advance
which entries matter — the curator is for what the author did not foresee.

- **Inputs**: story title, active checkpoint (name + objective), canon, open arcs, and the full text
  of every entry in `stagecraft.lorebooks`.
- **Outputs**: `enable | disable | rewrite | patch`, at most 4 per pass, replacement text capped at
  600 characters. `patch` uses ST-Copilot's boundary syntax — `first words || last words` — so a
  small model never has to restate a whole entry; a missing anchor is a failed op, never a silent
  overwrite.
- **Trigger / lane**: P4, on checkpoint activation (`boundaryWork` entry `stagecraft-curator`) and
  on a confirmed scene break, coalesced to one pass per 4 boundaries and never concurrently.
- **Veto rules**: an entry title outside the prompted list is dropped by the parser; a lorebook
  outside the allowlist is refused again at the write edge; a change that would leave the entry
  reading the same way is dropped; a duplicate op is dropped. Every drop is reported to the author.
- **Author review**: `components/drawer/StagecraftPanel.tsx` in the Scheduler tab (author view) —
  one card per change, text editable before it runs, accepted or declined on its own. Accept mode:
  `review` (default) waits for the author, `auto` applies at the next boundary, `off` records what
  it *would* do and writes nothing.
- **Failure mode**: model error → `lastError` on the slice, no proposal, play unaffected.
- **Rollback**: each applied op records the entry's pre-write content and disabled state, so a
  mutation rollback past the applying boundary puts World Info back.

### 2. Scene-setter `[designed]`

**Why an agent.** Choosing a background from the installed set to match a scene the author never
described is a judgment call over prose. **Deterministic-first test**: for an authored checkpoint the
`background` effect already wins — the scene-setter is for the gaps *between* checkpoints, where a
long scene changes location without the story graph moving.

- Inputs: recent window, blackboard `location` if the story declares one, the installed background
  list, the active checkpoint's authored background (as a floor it may not contradict).
- Outputs: `{ background }` proposals only; never a new asset.
- Trigger / lane: P4 on scene break. Veto: an authored `background` on the active checkpoint wins;
  never switches more than once per scene.
- Open question resolved here: **`background` is not a curator input for v2.1.** The deterministic
  effect stays the only writer until the scene-setter exists, so there is exactly one authority.

### 3. Cast / npc-reply tuning `[designed]`

**Why an agent.** Whether a silent member has been silent too long, or whether a scripted
`npc_replies` entry is now redundant, depends on the read of the scene. **Deterministic-first test**:
`talk_control` and `npc_replies` already express "who may speak" and "who must speak" — this curator
only proposes *tuning* (weights, enabling a scripted line, suggesting a member re-enter), never a
speaker for the current turn. Speaker choice stays with `TalkController`, which is deterministic and
already audited.

- Inputs: roster, talk decision ring, enabled cast, recent window.
- Outputs: `cast_changes`-shaped and `npc_replies.enabled` proposals, applied at a boundary.
- Trigger / lane: P4 on scene break. Veto: never touches the active turn, never adds a member the
  story does not roster, never overrides an authored `lead`.

### 4. Recap narrator `[designed]`

**Why an agent.** The away recap already renders `narrative.ts`; a narrator would rewrite it in the
story's voice. **Deterministic-first test**: this one is closest to *not* being an agent — the
composed narrative view is already correct and player-safe. It earns its place only if a human eval
says the rendered version reads like the machine. Until then, no build.

### 5. Continuity warden `[designed]`

**Why an agent.** Checking the latest reply against established facts is exactly the judgment the
extractor already makes for deltas, applied to contradictions instead. Pattern adopted from
Smart-Memory `continuity.js` (pattern only, AGPL — no code vendored).

- Inputs: the latest reply, the character card, canon, the facts tier, and the ledger.
- Outputs: **one** corrective note, injected for the *next* generation only and auto-cleared after
  it — the same one-turn shape as the copilot nudge (`COPILOT_NUDGE_KEY`), never a memory write and
  never a chat message.
- Trigger / lane: P2, at cadence or on scene break; never blocking.
- Veto rules: one note in flight at a time; only an explicit contradiction of an established fact
  counts (a new fact is not a contradiction); silent when the reply is consistent, which is most of
  the time.
- Failure mode: no note. A warden that guesses is worse than one that says nothing.

## Contracts this plan exports

- **Proposal → review → boundary-apply**: `runCuratorPass` records a typed proposal; the author (or
  `auto`) accepts per op; `applyAccepted()` runs inside `commitBoundary`. A v2.2 curator reuses the
  shape by adding its own op union and its own `applyOp` writer — the coordinator, the ring UI and
  the journal wiring stay as they are.
- **Review ring**: `extras.stagecraft.proposals` (cap 5) + `StagecraftPanel`. Per-op status
  `pending | accepted | rejected | applied | failed`, each carrying the pre-write state that makes
  rollback possible.
- **`stHost/backgrounds.ts`**: read the active background, list the installed ones, switch by name.

## Open for v2.2

- Whether `auto` is a defensible default for the WI curator. J8's automated half supports it — three
  clean end-to-end runs, every veto holding, one coherent proposal per pass — but the default is a
  trust decision, so it waits on the human session. `review` stays the default and `curatorEnabled`
  stays off (plan-07 Gate record §Not done).
- Whether the scene-setter and the WI curator should share one pass over one prompt — cheaper on
  small models, but it couples two veto sets.
- Per-curator token accounting on the trim-stats bar (00-overview §v2.2 seeds).
