# Plan 16 — Adolion install and image integration review

Status: targeted repair complete 2026-09-29; the campaign's long playtest and fifth-reply live cadence remain unmeasured. Superseded in part by `17-story-openings-and-gpu-recovery.md`: the stories gained authored openings and group bindings, so the versions below moved (Adventurer/Academy v19, Aegis v6, Deep/East/Eshalanore/War v5, Night v4, Saga v5).

## As built

- The installed 147 cards, 16 globally selected Adolion books, nine groups and nine story-library records matched the campaign build. A full asset reinstall was unnecessary. `Xentar Checkpoints` stayed deselected.
- Fresh chats in all nine groups pin the rebuilt stories with `illustrations: {checkpoints:true, scenes:true}`. Player-copy fields were left to their existing fallbacks. The story versions are Adventurer/Academy v18, Aegis/Saga v4, and Deep/East/Eshalanore/Night/War v3.
- The old group chats were backed up, then deleted through ST. The Saga's missing-file placeholder was removed from its group's chat list. New chats were backed up before pruning unrelated pinned story records. Backups: `C:\dev\backups\story-orchestrator\2026-09-28-adolion-verify\`.
- Image Director is enabled with every five rendered replies plus authored checkpoint/scene cues. Its director profile remains DeepSeek Flash, ST's ComfyUI URL resolves to `http://127.0.0.1:8188`, and both local Unsloth Connection Manager profiles use the GPU broker at `http://127.0.0.1:18888` (previously `:8888`). Judge and every user-enabled use remain on; curator remains auto. The old `st-image-director` settings record is gone.
- An image cue used an Academy snapshot during a Deep chat switch and stored the Academy cue key in Deep. Image reads and writes now check the runtime's claimed chat and selected story; emitted keys are filtered by chat/story and new image settings carry a chat stamp. Media saves use the observed chat-save seam. The foreign key in Deep was removed and read back from its chat file.
- Normal navigation also pinned the previous group's story into the next chat. `ChatSave` now refuses writes while the owner has claimed a new chat but the loaded story still belongs to the old one. All nine extra pinned records were removed through guarded, observed ST saves. War → Academy navigation after the fix left both blobs single-story.
- Broker connection errors now refuse images rather than rendering unbrokered. ComfyUI HTTP errors are logged, and a browser-side render has a three-minute timeout. The initial ComfyUI 500 and subsequent process exit had no current execution log; VRAM contention was suspected but **not proven**. The broker's real lease/release returned success. ComfyUI was restarted with `py -u main.py --port 8188 --cache-ram 8` from `C:\dev\ComfyUI` after installing its updated Python 3.12 requirements (`blake3`, then `requirements.txt`).

## Final installed chats

| Group | Pinned story | Version | Opening checkpoint | Background | Cast mirror applied |
|---|---|---:|---|---|---:|
| House Nightriver | adolion-academy | 18 | nightriver-house | royal.jpg | 9/9 |
| The Adventurer's Road | adolion-adventurer | 18 | guild-hall | tavern day.jpg | 12/12 |
| Between the Roads | adolion-aegis | 4 | aegis-homecoming | tavern day.jpg | 33/33 |
| Crimsonwing & Ebonwing | adolion-deep | 3 | deep-joint-posting | tavern day.jpg | 13/13 |
| The Eastern Road | adolion-east | 3 | east-landfall | japan path cherry blossom.jpg | 22/22 |
| Eshalanore | adolion-esha | 3 | esha-the-last-chapel | landscape autumn great tree.jpg | 2/2 |
| Night Courts | adolion-night | 3 | night-the-slums | cityscape medieval night.jpg | 15/15 |
| The Saga | adolion-saga | 4 | guild-hall | tavern day.jpg | 117/117 (two already disabled) |
| Fire and War | adolion-war | 3 | war-the-summons | royal.jpg | 13/13 |

Each has exactly one chat and one pinned story; selected id, version and content hash match the library; `requirements.ready` is true with no missing members or books. The Saga's 117 sequential cast writes take roughly 35 seconds before its background/cast settle.

## Gate record — 2026-09-29

- Campaign: `python scripts/build_all.py` → preflight OK, nine stories; second story build byte-identical. `node build/validate-stories.mjs build/story/*.story.json` → nine OK (info only); `node build/check-scope.mjs build/story/*.story.json` → none out of scope. Direct Jest campaign harness → 85/85; `scripts/check_cast.py` → zero muted-on-every-path; `scripts/check_cards.py` → 146 checked, zero failing; `scripts/check_lab.py` → 0/9 failing. Regenerated PNG compression differences were restored to committed bytes.
- Extension final source: `npm run typecheck && npm run typecheck:test && npm run lint && npm test -- --silent && npm run test:debug` → all green, Jest 339 suites / 4,554 tests, debug 416/416. `npm run build:dev && npm run build && npm run test:release` → webpack success, release 77 pass / 2 skip / 0 fail. Prod bundle `19c709a684f0`, main entry 1,219,900 / 1,250,000 B. Prod page reloaded with cache disabled: manifest `prod`, extension mounted, dev handle absent.
- Real-LLM image checks on the dev build: one manually directed SDXL render and one FLUX render saved and attached to the open chat; after the observed-save change, another SDXL render was read back from the chat file. An automatic Adventurer checkpoint cue with `mode=everyN` produced a FLUX image, saved a chat-scoped emitted key and attached media. During renders the broker reported `phase:image` with zero active/waiting text; afterward `phase:text`, no lease, ComfyUI HTTP 200. FLUX peaked at 17,757 MiB and returned below 1 GiB after release. A separate live `/lease` → `/release` returned success; no newly run simultaneous text-vs-image request pair was measured.
- Final disk audit after War → Academy and Eshalanore → Adventurer navigation: nine of nine single-story chats, all requirements ready, all hashes/versions current; `settings.image.enabled=true`, `automation.mode=everyN`, `everyN=5`; broker idle and ComfyUI HTTP 200.

## Unresolved questions

- A real fifth-reply cadence and a fifth reply coinciding with a checkpoint transition were not driven live. The two triggers can queue separately on the same reply; decide whether that should collapse to one illustration after observing play.
- The browser request times out after three minutes; ST's `/api/sd/comfy/generate` server-side history loop itself has no deadline if ComfyUI accepts a prompt and then disappears. That failure shape was not reproduced in this pass.
- The campaign's Pass D/E long playtests, judge-on matrix and v2.5 acceptance remain separate gates.
