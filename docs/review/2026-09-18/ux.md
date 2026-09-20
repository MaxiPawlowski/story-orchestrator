# UI and experience assessment

These are agent observations. They do not substitute for the 21 outstanding historical human checks or for unfamiliar-player testing.

## Observed evidence

`scripts/review/responsive.mjs` loaded eight independent Storybook fixture views at 1440×900, 768×1024 and 390×844: player overview, player memory, unconfigured drawer, pending Stagecraft review, seeded/empty Studio, wizard interview, and failed proposal. [Metrics](evidence/ui/responsive.json) and 24 screenshots are archived. All 24 had document width equal to viewport width, no horizontally offscreen measured controls, and no captured page errors. This is a bounded geometry probe; it does not prove every control is reachable vertically or correctly styled in SillyTavern.

The lead reviewer visually inspected the mobile [Studio](evidence/ui/studio-studiomodal--seeded-390.png), [player overview](evidence/ui/drawer-drawertabs--player-view-390.png), and [wizard interview](evidence/ui/studio-studiocopilot--interviews-before-proposing-390.png). Studio wraps its eight tabs and keeps its save toolbar visible, while its editor uses internal scrolling. The player narrative has a clear sequence of current place, recent change and story summary. The wizard separates conversation from proposed changes and exposes a useful warning when a quality is not used by gates.

The separate interaction script focused Graph, pressed ArrowRight, and remained on Graph. Tab then moved to Story rather than out of the tab group. All tabs are normal tab stops. This differs from the [W3C APG tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), which uses arrow navigation and one active entry point. The source also lacks explicit tab-to-panel ID relationships. Recommendation: implement the pattern, or use ordinary navigation controls without advertising tab semantics. Acceptance should cover left/right wrapping, selected/focused states, panel association and keyboard-only authoring.

A 45-step keyboard trace remained in the modal in the sampled fixture. The text-scaling probe sets the root font to 200%; it is **not browser zoom** and must not be called a zoom conformance check. Escape did not remove the fixture dialog because its `onClose` is a Storybook mock; the existing story asserts that callback invocation. This observation is not a production close-button defect. [Interaction details](evidence/ui/interaction.json) make these limitations explicit.

The Storybook runner passed 107 interaction/axe tests. Its axe scope is normally `#storybook-root`; individual stories can configure or disable checks. Color-contrast checks are globally disabled in `.storybook/preview.ts`; no story-level disable was found in the preserved corpus. Browser snapshots rely partly on host CSS that is absent in Storybook: for example, the player-view buttons look washed out in the isolated screenshot. That alone is not evidence of a contrast defect in real SillyTavern. Real theme and host layering checks belong to the [live report](live-review.md).

The manual Storybook authoring walkthrough is **partial**. It authored two checkpoints and a `letter_found` gate, then stopped on the Story tab. It did not complete save, reopen, export/import, or play validation, so it is not an end-to-end authoring pass.

## Reviewer assessments and concrete improvements

| Assessment | Why it matters | Proposed acceptance criterion |
|---|---|---|
| Player overview is a useful foundation | It tells a player where they are and what changed without requiring them to read a blackboard. | An unfamiliar player can describe the current objective and whether tracking is waiting/paused from the visible view alone. |
| “Noted” and tracking status need concrete explanations | A queued update, a slow read and a stalled story can look similar. Technical queue vocabulary is not a useful player remedy. | Show a short status with a next action only when needed: waiting for the next reply, retrying, paused with Repair. Detail stays in author diagnostics. |
| Studio is usable at phone width but dense | Eight wrapped tabs, a narrow title field and a fixed footer consume much of the visible area. Raw source/latch/scope fields demand conceptual knowledge. | Complete a basic two-anchor story on a phone without JSON; progressive help explains quality/source/latching at first use, and all fields/actions remain reachable with keyboard and scaling. |
| Wizard still exposes implementation stages | “Qualities”, “Transitions”, “Run stage” and a warning about `state_snapshot` are useful to experts but do not form a first-story narrative for new authors. | Offer guided steps such as premise, characters, turning points and setup; retain advanced editors. Translate diagnostics into a plain consequence plus an optional technical detail. |
| Proposal review should foreground target and impact | R8 demonstrates why naming a book is not enough to establish ownership. Author approval needs to show whether a step creates or overwrites an asset. | Every host write displays asset identity, existing/new status, before/after preview and scope; the write path enforces the same grant. |
| Player/author separation needs content rules as well as hidden controls | A checkpoint objective can itself reveal an author's intended twist. Hiding graph tabs does not redact authored prose. | Optional player-safe summary/premise fields; a fixture with deliberately secret objectives confirms no secret appears in player surfaces. Treat this as a schema/authoring proposal, not a proven disclosure in current examples. |
| Save/resume/recovery must use one vocabulary | Library version, played version, draft, checkpoint and chat have distinct lifetimes. Users should not infer them from inconsistent button labels. | Show “saved to library” versus “applied to this chat”; invalidating changes explain retained/dropped state; failed durable save stays visibly pending. |
| Settings need visible scope | Some preferences are installation-wide, others per-chat or story-specific. A change should not surprise another chat. | Each settings group states its scope; profile readiness is shared; user-facing messages explain changes that affect all chats. |
| Large text and long sessions need deliberate layouts | The sampled fixtures are short and cannot establish behavior for huge canon, many proposals or long quality names. | Add long-content/error/loading fixtures, test search/filter/pagination and real browser zoom. Avoid relying solely on screenshot dimensions. |

## Outstanding experience validation

Real-host agent-led play and authoring are recorded in the [live report](live-review.md) with exact failures. The root Storybook evidence is not a completed authoring journey. Remaining human evaluation should include a new player, a new author, and an experienced roleplayer on at least two themes and a small screen. Ask them to start a story, resume after a break, recover from a failed backend, make an invalidating edit, and explain what a pin means. Observe completion and misunderstanding before asking for subjective quality ratings.

Narrative quality should be judged on causal continuity, character knowledge, respect for player choices, repetition and recovery after surprises. A coherent short generated reply or a satisfied gate is not sufficient evidence of those qualities over a session.

