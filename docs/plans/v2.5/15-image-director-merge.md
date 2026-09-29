# v2.5 plan 15 — Image Director merged into Story Orchestrator

Status: **code complete, static + release + live gates green 2026-09-28**. Decided by the user
(2026-09-28): the standalone `st-image-director` PoC is fully merged as an optional Story Orchestrator
feature; the PoC is removed from ST's UI (disabled, then its junction removed) while its source stays at
`C:\dev\st-image-director`. Non-story use was never a concern (the PoC was never used standalone).

## Decisions (user, 2026-09-28)

| Topic | Decision |
|---|---|
| Merge vs two plugins | **Full merge** into Story Orchestrator, one user-facing plugin |
| Triggers | Automatic on **checkpoint transition + confirmed scene/location change** (plus manual controls); deduplicated and cooldown-guarded |
| Text during a render | **Queue text** while ComfyUI owns the GPU; release, then autoload Artemis on the next text request |
| Image-prompt model | Configurable Connection Manager profile; DeepSeek Flash configured now, Artemis allowed |
| Aftermath | Remove the standalone Image Director from ST's UI; keep its source repo |

## As built

- `src/image/**` — `catalog.ts` (3 checkpoints, 3 families), `graph.ts` (SDXL/FLUX + hi-res, ported
  verbatim), `settings.ts` (install-wide `GlobalSettings.image`, seeded once from the PoC's
  `extensionSettings["st-image-director"]`), `routing.ts`, `prompt.ts` (director JSON prompt/parse +
  lore appearance lines), `lore.ts` (gated appearance lines from the story's scanned lorebooks),
  `queue.ts` (serialized render queue), `runtime.ts` (`StoryImageDirector`: plan → story cue → render →
  place → persist), `ImageGroup.tsx` + `ReviewGrid.tsx` + `styles.css` (settings + review UI),
  `start.ts` (lifecycle).
- `src/services/stHost/image.ts` — image chat snapshot, `sendRequest` director call, `/api/sd/comfy/generate`,
  `/api/images/upload`, `/api/images/delete`, media attach / FORCE_SET_BACKGROUND, chat-settings persistence.
- `src/services/stHost/imageSurface.ts` — `/so-image` (+ `/direct` alias) slash, message clapperboard
  button, wand entry, every-N automation and the stealth `illustrate_scene` tool.
- `src/services/stHost/gpuBroker.ts` + `server-plugin/story-orchestrator-gpu/**` — the single-GPU broker:
  a localhost proxy on `127.0.0.1:18888` that forwards to Unsloth, plus `/lease`/`/release`/`/status`.
  Lease drains text, confirms idle, unloads Artemis (verified gone), lets ComfyUI render, unloads ComfyUI
  and resumes. Queued text is held at the proxy. A missing plugin leaves images working (no model switch).
- Settings live install-wide under `extensionSettings["story-orchestrator"].settings.image`; per-chat
  override/emitted keys/automation counter under `chat_metadata.story_orchestrator_image`.
- The image module is lazy (settings panel `React.lazy`, review grid dynamic import), so the prod main
  entry stays inside budget.

## Gate record (2026-09-28)

Static (all green): `npm run typecheck`, `npm run typecheck:test`, `npm run lint`,
`npm test` (**338 suites, 4547 tests, 0 fail**), `npm run test:debug` (**416 pass**),
`npm run test:plugin` (judge 15 pass/1 skip + **broker gate 4 pass**).

Build/release (green): `npm run build:dev && npm run build` then `npm run test:release`
(**77 pass, 0 fail, 2 skip**). Prod main entry **1,208,800 B / 1,250,000 B**.

Live (dev build, real Artemis + DeepSeek, real ComfyUI v0.36.0 on the 3090; sandbox group
`1790528943246`, cleaned up):

| # | Check | Result |
|---|---|---|
| L1 | Real render end to end: `/so-image` scene → director (DeepSeek) → ComfyUI → save → attach | pass, 26 s; `director_*.png` 2.0 MB; hidden `extension`-type message with `extra.media[0].url` |
| L2 | Post persists across a page reload (chat file line 1 carries the media) | pass |
| L3 | Planner uses the played story: checkpoint `guild-hall`, visible cast `Tobias`, gated lore lines `Guild / Tobias / Wendhope` | pass |
| L4 | Router + broker: text runs through `127.0.0.1:18888` (`activeText 1` mid-turn) and the reply arrives | pass (Tobias, 1227 chars) |
| L5 | GPU handoff: image lease (`reserving` → `image`); a text turn fired during the render **queues** (`waitingText 1`) and is not sent to Unsloth; on release `phase text`, queued text forwards | pass |
| L6 | Idle guard: an image requested while a text turn was generating refused after its 120 s cap ("The text turn has not finished yet") | pass |
| L7 | Cutover: PoC disabled in ST settings and its junction removed; merged `/direct` + `/so-image` and the Illustrations panel present on the **prod** build | pass |

## Deviations and outstanding

- The broker plugin required an ST server restart to load; the user authorised it. ST was stopped
  (PID 18416) and relaunched with `node server.js`.
- The two local Artemis profiles were temporarily repointed to `127.0.0.1:18888` for L4/L5 and
  **restored to `http://127.0.0.1:8888`** afterwards. To enable the model switch in play, repoint both
  at `:18888` (the broker is installed and `enableServerPlugins` is true).
- The `--cache-ram 8` ComfyUI instance was started for the live legs and is running.
- Owed: a full playtest (the campaign's TESTING.md live legs and this extension's plan-14 ×2 matrix are
  unchanged by this work). The story-triggered cue is implemented and unit-covered; its automatic firing
  during a real checkpoint transition was not separately driven live (the manual path was).
