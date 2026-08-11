# Plan 06 — Story wizard & provisioning

## Objective

Turn the staged authoring copilot into a **setup wizard** that takes an author from a premise to a *playable, provisioned* story: it interviews before it proposes, and it can create the ST-side assets the story requires — character cards, the story lorebook + entries, the group — through reviewed proposals. Today a story's `requirements` must pre-exist by hand (sun-ruins needs 4 hand-made cards + a hand-built "Xentar Checkpoints" lorebook); after this plan the wizard closes that gap and "Fix with wizard" replaces the requirements panel's diagnose-only dots. Addresses D3.

## Context

- Spec addendum §Story wizard. Patterns adopted (00-overview §External-base learnings): ST-Copilot (MIT) — `ask_user` interview mechanic, proposal cards with inline edit-before-apply, history stripped of proposal blocks after decision, `createCharacterAPI` proving `/api/characters/create` (FormData + `getCharacters()` reload).
- Current copilot: staged proposer (`copilot/prompts.ts` stages qualities→checkpoints→transitions→effects; `StudioCopilot.tsx` chat + `ProposalReview` per-op accept; ops applied through `studio/mutations.ts`). It cannot ask, and it cannot touch ST assets.
- ST facts to verify + vendor (rule: confirm in host source before use): `/api/characters/create` (proven by ST-Copilot), `/api/groups/create` (`public/scripts/group-chats.js:2119`), WI creation already vendored (`WorldInfoHostModule.createNewWorldInfo/createWorldInfoEntry`, 00-overview v2 ledger).
- Consumed: plan-02 identity (save lands under a real id), plan-05 Studio completeness + `applyStoryUpdate` (wizard output = same mutation/op contract), plan-01 journey format (defines J9).

## Scope

In: interview protocol, provisioning ops + host seams, wizard flow/entry points, proposal-card polish, wizard-session persistence, J9.
Non-goals: in-play steering (driver/stagecraft own that); native tool-calling APIs (backend-agnostic message protocol — the memory LLM is generic textgen); **editing existing user characters or non-story lorebooks** (create-only; ST-Copilot's edit flows deliberately not adopted); chat-message editing (ST-Copilot chat-manager — out entirely, conflicts with TurnBridge rollback semantics).

## Deliverables

- **Interview protocol**: `ProposalResult` gains a `questions` variant `{status:"questions", questions:[{id, text, why?, options?[]}]}` — per stage the copilot may interview (≤3 questions) before proposing; StudioCopilot renders question cards with option chips + free text; answers append to history; "you decide" always available and the wizard must proceed under stated defaults. Prompt: ask only when the premise underdetermines the stage — the current failure mode is inventing specifics instead.
- **Provisioning ops** (new op kinds, schema-validated, act on ST not the draft): `createCharacterCard {name, description, personality, scenario, first_mes, mes_example, tags?}`, `createStoryLorebook {name}` (also prefills the draft's `stagecraft.lorebooks` allowlist for plan 07's curator), `upsertLorebookEntry {lorebook, comment, keys[], content, constant?}`, `createGroup {name, members[]}`. Review UX: every provisioning op renders as an editable proposal card (all fields editable before apply — ST-Copilot pattern); apply is per-op explicit, excluded from bulk Accept-all; results reflect live in the requirements panel.
- **Host seams**: `stHost/charactersCreate.ts` (POST + header quirk: drop Content-Type for FormData + reload via `getCharacters()`), `stHost/groupsCreate.ts`; WI through the existing `worldInfo.ts`. Verified fact rows appended to this plan's notes with host file:line.
- **Wizard flow**: entry points — settings "New story (wizard)" + Studio empty state + requirements panel "Fix with wizard" when unmet. Sequence: premise → interview → existing stages → **provisioning stage** ("these roster members / lorebooks don't exist — create?") → save (plan-02 identity) → requirements green → "Start playing" (select in current chat or create the group chat).
- **Session persistence**: wizard conversation + pending stage persisted per draft so an interrupted setup resumes (ST-Copilot sessions pattern, lite).
- **Token hygiene**: raw proposal JSON never re-enters history — summaries only (verify current behavior holds for the questions variant).
- Tooling: scenario verbs for interview + provisioning (debugResponse for unit determinism only); **J9 wizard journey** — fresh state (story members/lorebook absent) → premise → real-LLM wizard run → provisioned playable story → first transition fires; journey **cleans up every created asset** (characters, group, lorebook, chat).

Exports: provisioning-op contract + host seams (plan 07's WI curator reuses the lorebook write path + proposal-card review pattern), `questions` protocol (driver may adopt it in v2.2).

## Implementation notes

- **Code home (rule 3)**: wizard orchestration lives in plan-03's `copilotCoordinator` + a new pure `src/wizard/` (interview state machine, provisioning-op validation); `runtimeManager.ts` gains nothing but delegation. Provisioning host calls go through the new `stHost/` modules only.
- Create-only invariant is a hard rule enforced in op validation, not prompt-trusted: ops naming an existing character/lorebook fail validation with a clear message (except `upsertLorebookEntry` against the story's own lorebook).
- **Asset-leak safety**: J9 tags every created asset with a recognizable test marker and the journey ends with a leak assertion (zero test-marked characters / groups / lorebooks remain). A leaked asset is a gate failure — this journey writes to the user's real ST install, so cleanup is load-bearing, not hygiene.
- Rule 8: `test-plan.md` gains the J9 section + wizard rubric in this plan.
- Group reuse: if a group already contains exactly the roster members, offer select-instead-of-create (delegated below).
- gemma-scale models: keep per-stage JSON small; the interview reduces malformed-op risk on thin premises; provisioning cards tolerate partial JSON via the existing proposal repair/validation path.
- Persona tags: everything here is `author`.
- Requirements panel: "Fix with wizard" jumps straight to the provisioning stage pre-filled from the unmet list.
- J9 hygiene mirrors the debug-scripts cast gotcha: created assets tracked and deleted; never touch pre-existing user assets.

## Validation gate

Harness: baseline (incl. structural guards + v2 corpus) + op-validation suites (create-only enforcement, question-variant parse) + Storybook (question cards, provisioning cards, requirements "Fix with wizard"). Live journey gates (fresh-start, real LLM): **J9 green** — real interview, real proposals, real character/group/lorebook creation, leak assertion clean; J2 regression floor. **Human-eval**: one wizard session run by the user (premise → playable story) scored on the wizard rubric — proposal quality and interview usefulness are inherently subjective and automation cannot green this plan alone. Gate record: verified host-fact rows.

## Delegated decisions

- Wizard-session storage home (extension settings vs draft store).
- Group reuse-vs-create policy.
- Whether the wizard drafts an opening scene / first message for the group.

## Unresolved questions

- Should provisioning also cover persona requirements (create/select a persona), or is diagnose-only fine there? (Leaning diagnose-only — personas are personal.)
