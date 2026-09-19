# Story Orchestrator review — 2026-09-18

**Assessment: the reviewed snapshot is not ready for a shareable release.** The deterministic engine and authoring surface have substantial test coverage, but asynchronous ownership, history reversal, extraction authority, and generated branching have reproducible correctness gaps. Improving these contracts is a better next step than replacing the checkpoint architecture.

This is a review deliverable, not a production patch. The review added tooling, disposable fixtures, tests, reports, and the requested Artemis setup. The original working tree was not reset. Production files changed concurrently outside this review; all baseline results below refer to the preserved copy, not automatically to those later files.

## Read this dossier

- [Findings](findings.md): reproduced failures, impact, source locations, and remediation.
- [Architecture and evolution](architecture.md): how the project arrived here, current data flow, alternatives and tradeoffs.
- [Coverage and verification](coverage.md): capability matrix, check results, evidence limits, and unclosed gates.
- [UX assessment](ux.md): responsive/keyboard evidence and reviewer judgments.
- [Implementation roadmap](roadmap.md): ordered work packages and explicit proposed contract changes.
- [Memory and engine review](memory-engine-review.md): Sol's independent reproductions, reviewed by the lead reviewer; see the qualifications in findings.md.
- [Test credibility](test-credibility.md): what strict journeys, fixtures, self-tests, and component checks actually establish.
- [Current-source comparison](current-comparison.md): later concurrent changes assessed separately, when available.
- [Live review](live-review.md): Sol's isolated host, model, journey, and feature-scenario results, when complete.

## Reviewed version and reproducibility

Git HEAD was `0a094e58734df99c287e0356b42407dd9e3e95e1` (2026-08-13, `2.1/6`), plus the dirty and untracked files present at snapshot time, including Stagecraft. [Inventory](evidence/inventory.json) records SHA-256 and size for 614 files. [Initial status](evidence/baseline-status.txt) distinguishes that working tree from HEAD; [history](evidence/history.txt) records the evolution. [Reviewed source archive](evidence/reviewed-source.zip) contains the matching source snapshot. Review-specific files created after the snapshot are under `scripts/review/` and this dossier.

The isolated host is SillyTavern 1.19.0, Node 22.22.0, with separate data, config, browser profile and ports 18000/19222. Storybook uses 16006. [Environment](evidence/environment.json) and [host source hashes](evidence/host-source-hashes.json) identify the local host; a host Git revision was unavailable. The debug browser and Playwright MCP browser were explicitly shown to be different sessions. Their state must not be conflated.

[Source drift](evidence/source-drift.json) records subsequent modifications to 23 original files at the first drift checkpoint. These were not silently copied into the baseline. File/line references in findings identify the archived snapshot; current files can have different lines or fixes. The comparison report is a separate observation, not a replacement for the baseline.

## Evidence at this checkpoint

- Clean lockfile installation succeeded after an initial shared npm-cache failure.
- Original Jest suite: **60 suites, 1,589 tests passed**. Lint and debug TypeScript passed.
- Clean-host application TypeScript and production build failed because ancestor host Toastr ambient types conflict with the extension's fallback stub. A review-only contained-type configuration typechecked and built the unchanged source successfully.
- Storybook direct build and interaction/axe run: **26 suites, 107 tests passed**. The repository's nested `test-storybook:ci` command failed to invoke Storybook in this Windows environment; this was recorded separately from component behavior.
- Lead reviewer regressions: **9 intended-contract assertions failed, 4 controls passed**. Sol memory/engine regressions: **8 intended-contract assertions failed, 6 controls passed**. Separate event-ordering and self-test grading harnesses add 3 failures and 4 controls. An independent branching-story fixture adds 2 passing controls. These are defect reproductions, not replacements for the baseline suite or counts of independent root causes.
- Responsive checks: 8 fixture views at 3 viewport sizes, no detected horizontal document/control overflow. Keyboard behavior has a tab-pattern gap. These checks do not establish full accessibility or usability.
- Artemis download hash verified; authenticated cold autoload, ordinary response and explicit unload/reload succeeded. The reload after the user freed VRAM took about 15.5 seconds, with 21,511 MiB (about 21.0 GiB) total GPU memory reported in use afterward. `nvidia-smi` does not establish Windows shared-GPU residency.

Live gates and model reliability belong to [live-review.md](live-review.md), not the deterministic counts above. The historical 63 automated checks are claims being revalidated; the historical 21-human-check claim remains unclosed. The preserved J1–J10 fixtures actually contain 20 human checks; that documentation mismatch is explicit in the harness audit. No automation result establishes that the roleplay feels coherent, surprising, or satisfying to unfamiliar people.

## Delegation and review discipline

At the user's request, Sol handled configuration/live repetition and a bounded memory/engine review. The lead reviewer inspected the memory harness, its source paths, controls, and stated limitations; pinning semantics were qualified rather than presented as proven cross-character disclosure. Lead review owns architectural recommendations and prioritization. The repository [debug skill](../../../.claude/skills/debug/SKILL.md) governed live checks; no messages were sent to external people.



