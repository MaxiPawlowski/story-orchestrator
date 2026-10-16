# story-orchestrator-lore

SillyTavern server plugin for Story Orchestrator's **lorebook writes**: a conditional whole-book save. SillyTavern's own
save (`/api/worldinfo/edit`) replaces the book file unconditionally, so a write built on an older copy can overwrite a
change another page saved in between. This plugin replaces the file only while it still holds the entries the write
started from. Optional: without it, the extension falls back to SillyTavern's save after a server comparison, which
narrows the race but cannot close it.

## Install

Installed with the judge plugin by `npm run plugins:install` (from a source checkout:
`npm run plugin:install -- --st-root <SillyTavern>`). Set `enableServerPlugins: true` in SillyTavern's `config.yaml`
and restart SillyTavern.

## Routes

Mounted at `/api/plugins/story-orchestrator-lore/`, after SillyTavern's user and CSRF middleware (send
`getRequestHeaders()`).

| Route | Body | Answer |
|---|---|---|
| `GET /status` | | `{ ok, version }` |
| `POST /commit` | `{ name, expected, data }` | `200 { ok: true, revision }`; `409 { conflict: true, revision }` when the file holds other entries; `409 { conflict: true, missing: true }` when there is no such book (never creates); `400` for a name that is not a plain file name or a body without `expected` or `entries` |

`name` is the book's listed file id, `expected` the revision of the entries the write started from, `data` the whole
book. The revision is the length and two FNV-1a hashes of the entries as canonical JSON (object keys sorted); the page
computes the same value (`src/services/stHost/lorebookImage.ts`, vector pinned in both test suites).

## What it guarantees

Read, compare and replace run in one synchronous step, so on Node's single thread no other request, including
SillyTavern's own `/api/worldinfo/edit`, lands between the comparison and the write. Story Orchestrator's writers never
overwrite each other or a change the server already has. SillyTavern's own editor still saves unconditionally: its save
landing in the same instant, from a copy older than ours, can still overwrite our write. That case remains best-effort
detection (the write's read-back), not prevention.
