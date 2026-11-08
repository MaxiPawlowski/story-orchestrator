# ST Memory Books — 2026-11-08 harvest

meta: https://github.com/aikohanasaki/SillyTavern-MemoryBooks · `pre-refresh-2026-11-08..HEAD` = 4 commits (`4227ae4` sorting, `5e0c8c8`
+ `2ee350c` rollback protection, `5a79f66` Google connection), v9.3.11 → v9.4.0 · **AGPL-3.0-only: ideas only** · read: diff of
`changelog.md`, `memoryRollback.js`, `viewSortPolicy.js`, `index.js`, `stmbJobs.js`, `constants.js` · skipped: `index.build.js` (minified
rebuild), locales, tests bodies · prior: `docs/plans/v3.0/extension-research-2026-10-30/st-memory-books.md` (P1 privacy transforms, P2
on-demand sub-pass, parked in `30-harvest-index.md`) · SECURITY.md verdict CLEAR.

## What changed

- Rollback after a message deletion now also unhides the source messages of the memories it removes, with indices remapped past the
  deleted span (`memoryRollback.js` `getDeletedMessageRollbackUnhideRanges`, diff `+66-90`).
- Write-ahead "pending unhide" record stored in the memory lorebook with a fingerprint of the chat prefix; replayed on chat open/init
  (`index.js` `queueDeletedMessageRollbackUnhideRecovery`, `recoverDeletedMessageRollbackUnhide`); if the prefix fingerprint no longer
  matches, it refuses the automatic unhide, warns, and clears the record (`validateDeletedMessageUnhideRecords`, error code
  `STMB_UNSAFE_DELETED_UNHIDE`).
- Prefix fingerprint hashes `send_date, name, is_user, original_avatar, mes, swipe_id` per message, SHA-256 or FNV-1a fallback on
  insecure origins (`memoryRollback.js` `fingerprintRollbackChatPrefix`, diff `+92-114`).
- "Last processed" marker is now updated before the unhide replay (moved up in `executeMemoryAutoRollback`), so a failing unhide cannot
  leave the marker ahead of the saved rollback.
- Configurable 60 s progress timeout (`constants.js:37-38`); click-to-sort on prompt/job/recovery lists (`viewSortPolicy.js`).

## Patterns for SO

### P1. Persist the side effect's intent before doing it, replay on open, refuse when the chat moved — confirmation · present
Their pending-unhide record = SO's write-ahead effect ledger (`runtime/effectsApplier.ts` `withLedger`, pending row saved and verified
before the host call, `PENDING_NOT_SAVED`). Their "chat prefix changed → refuse" = SO's per-message fingerprints
(`runtime/fingerprints.ts:1-40`, loaded at `runtimeManager.ts:509`). SO never persists `/hide` state (compaction is a per-request ignore
marker, `runtime/compactHistory.ts:8`), so the unhide class of bug does not exist here. Nothing to take.

### P2. Order: move the "processed up to" cursor before any step that can fail or switch chats — pattern check · extraction cursor · our state: present (verify) · value 2 · effort S
Their fix moved the marker update ahead of the replay so a failure mid-replay cannot leave state claiming more than was saved. SO's read
cursor (`extraction/readCursor.ts`) and short-term `shortTermSummaryEnd` should be written in the same persist as the rows they describe;
a quick review of `runtime/coordinators/extractionCoordinator.ts` `runShortTermCompaction` (~`:430-470`) for a save between the entry
write and the end-marker write would settle it. Test-idea only.

## Suspected SO defects

None from this diff.

## Host facts

- Their fingerprint includes `swipe_id`. Deleting a lower swipe decrements `swipe_id` with `mes` unchanged, so their prefix check would
  flag an unchanged chat as changed (false refusal). SO excludes `swipe_id` for exactly this reason (`runtime/fingerprints.ts:4-6`).
- `crypto.subtle` is missing on insecure origins (LAN over http); they fall back to FNV-1a. SO uses FNV everywhere (`runtime/hash`), no
  dependence on a secure context.

## Not worth taking

- List sorting UI: no comparable SO list needs it (kit tables already sort where useful).
- Google connection changes: provider plumbing, not relevant.

## Security notes

- CLEAR per SECURITY.md. Same-origin `/api/settings/get`, `/api/chats/*`, `/api/files/upload`, `/api/worldinfo/edit`; pre-existing
  `api.deepseek.com` as a `custom_url` routed through ST's proxy.
- `index.build.js` is a minified rebuild; source and map are in the repo. No agent-addressed text in the diff.
- Nothing above needs network, secrets or a server plugin.
