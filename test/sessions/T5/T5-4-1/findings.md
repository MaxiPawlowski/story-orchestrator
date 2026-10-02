# Findings draft: T5-4

Session `test/sessions/T5/T5-4-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 1
- stall: 0
- extraction-rejected: 0
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 0
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

## Judge health

- calls: 1 (answered 1, busy 0, timeout 0, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T12:21:34.873Z (message 76)

- note: Repair row stays after the fix: /member-add Lady Corvane put her back in the group (members list shows Lady Corvane.png), but requirements still read missingMembers [Lady Corvane] 20 s later and Repair still says 'Missing from the group: Lady Corvane'.
- evidence: `journal.jsonl:538`
- context (event-time):
  - #73 Master Ilse: "I'll walk with you." *Master Ilse steps beside the apprentice, her ink-stained hand resting on their shoulder in a grounding grip that is both protective and guiding.* "But walk with your eyes open. You're not just seeing the world you changed—you're walking through the changes themselves." *She gl
  - #74 Lady Corvane: *Lady Corvane does not call out. She does not move to intercept them in the street. Instead, she simply steps into the shadow of an archway, her grey form merging with the stone as she watches the apprentice and the Master walk away.* *Her eyes are fixed on the map tucked under the apprentice's arm,
  - #75 Lord Vael: *Lord Vael stands in the workshop doorway, his silhouette sharp against the morning light that is beginning to bleed across the city. He does not rush to stop them—to do so would be uncouth, and besides, he has always found that the most valuable prizes are best secured when their owners feel they a
  - **#76 Ashmere Envoy: *The Envoy does not follow immediately. Instead, she stands in the workshop's doorway, watching the apprentice and Master Ilse walk away into the morning light. Her hand rests on the brass pen, her fingers curling around it with possessive care—not as a weapon, but as an instrument to be preserved.***

## Anomalies

None.

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T5-?1 | T5 |  |  | `test/sessions/T5/T5-4-1/journal.jsonl:538` | draft |  |  | Repair row stays after the fix: /member-add Lady Corvane put her back in the group (members list shows Lady Corvane.png), but requirements still read missingMembers [Lady Corvane] 20 s later and Repair still says 'Missing from the group: Lady Corvane'. |

## Operator findings (Claude, autonomous run)

VALID. Played 2026-10-02 12:16-12:23Z on lane 3, continuing the T5-1 chat `2026-10-02@07h56m33s541ms` (story v5 from T5-3), served dev bundle `b644cbb7ad01`, author mode, no chat turns. Breaks through ST's own commands: `/member-remove Lady Corvane`, `/member-disable Lord Vael`, `/world state=off The Redline Kingdom` (three at once = the provocation). Repair read from the settings panel after each step. Fix with wizard from both the Repair entry and the drawer's author panel, provisioning stage run once. Repairs by hand: `/member-add Lady Corvane`, `/world The Redline Kingdom`, `/member-enable Lord Vael`. Header diff clean (group back to 4 members, book selected again).

Findings:
- HIGH (product): Fix with wizard cannot fix the breaks Repair reports. Its seed says "cast members that do not exist yet: Lady Corvane; lorebooks that do not exist yet: The Redline Kingdom" (`shots/004`, `shots/006`) when both exist (removed from the group / deselected). The create-only provisioning stage correctly answered "Nothing needs creating... No ops emitted" (`shots/005`): nothing fixed, nothing duplicated, no persona. Repair offers it as the only action for a membership/selection gap; it needs a "re-add / reselect / unmute" route or should not be offered.
- MEDIUM (product): a Repair row stays after the fix. After `/member-add` the group held Lady Corvane again but `requirements.missingMembers` still listed her 20 s later (`shots/007`, flag `journal.jsonl:538`); it cleared only when the World Info reselect refreshed requirements. Removal refreshed within 3 s; the add did not (group-edit event not observed for adds?).
- LOW (product): on reopen the background effect was refused: "background effect was not applied: its write-ahead record could not be saved" (`journal.jsonl:505`), after T5-3's three "save not confirmed" rows. The background was already in place, so nothing visible.
- LOW: Repair has no reveal control for these steps (`[data-so="repair-reveal"]` absent); "Unmute this member in the group's member list" names the place but does not open it.
- Known finding superseded: a disabled member is no longer silent: `mutedMembers` + the author panel "Unmuted cast" row + Repair once it is the worst gap (`shots/010`). `requirements.ready` stays true with a muted member.
- Must-not: Repair never listed several things at once (one step throughout); Fix with wizard created no persona and did not touch the story; one stale row (above).

Calls: DeepSeek 3 measured (19k in / 0.8k out; ring 6 primary, 0 fallback; incl. 1 copilot provisioning call), judge 1, main RP 0. Pod window 12:16-12:23Z (no main-model calls).
