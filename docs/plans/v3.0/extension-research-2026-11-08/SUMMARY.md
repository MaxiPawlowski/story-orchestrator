# Extension harvest 2026-11-08 — summary

## Method and safety

- Ask (owner 2026-11-08): one more harvest pass plus a defect repro-and-fix round. Same caution as 2026-10-30 (trojaned Bot Browser
  extension stole keys on 2026-10-26).
- Forum `#📦・extensions` re-listed in the browser pane: 7 threads since 2026-10-30. Cloned 3 (MVU-Helper, AutoExpress, Image Edit with
  ComfyUI); skipped 4 (qwen-tts server plugin, Mors's Music Box, Yahoo Messenger theme; SillyTavern Index used as a source instead).
- SillyTavern Index (`zaakh.github.io/SillyTavern-Index`, 1,221 entries, data file `data/extensions.json`) filtered for active (commit since
  2026-10-15), ≥ 8 stars, on-lens and not in the corpus: cloned 3 (Summaryception, zTracker, SLAY Images).
- Existing clones refreshed only where `ls-remote` showed a new head (fixes last pass's `--shallow-since` "error processing shallow info"
  failures): 12 changed, 1 fetch failed (quick-image-gen). Old heads are branch `pre-refresh-2026-11-08`. Scripts:
  `C:/dev/st-extensions-research/_refresh-2026-11-08/{safegit,clone,fetch,screen}.sh` (hooks, symlinks, fsmonitor, submodules, LFS off).
- Regex screen, then an Opus security reviewer over every new repo and diff before any idea harvest:
  `C:/dev/st-extensions-research/_refresh-2026-11-08/SECURITY.md`. 15 CLEAR, 3 CAUTION, none suspicious.
- Six Opus reviewers, read-only, never inside a clone (`_brief.md`). Nothing was executed, installed, built or loaded into ST. One
  reviewer parsed an AutoExpress JSON data file with `python -I` from outside the clone (data only, no repo code); recorded as a brief
  deviation.

## Security findings

- **CAUTION mvu-helper**: on consent writes a global TavernHelper script that `import()`s a jsDelivr bundle on every chat; schemas import an
  unpinned jsDelivr module; card JS via `new Function` in a CSP-locked Worker; wraps `window.fetch`.
- **CAUTION autoexpress**: the ST extension is clean; its companion Python app binds `0.0.0.0` without auth, downloads its frontend ZIP
  unverified, collects Civitai keys from other tools' configs; `curl | bash` RunPod scripts; cloning into ComfyUI `custom_nodes` runs it.
- **CAUTION sillytavern-copilot-p3dra (First Mate)**: reads ST's OpenRouter key via `findSecret` (works only with `allowKeysExposure`) and
  sends it to an editable `baseUrl`; ships an ST core patch.
- **tavernos-hud** (CLEAR, AGPL now): still wraps `window.fetch` and rewrites every generation body; now also gates ST's `/api/chats/save`
  behind a popup, so it can delay chat saves.
- st-image-edit vendors a 3.2 MB HEIC decoder whose hash was not checked against npm.
- **Agent bait** (quoted in the reports, never followed): autoexpress `AGENTS.md` (rent GPUs, sandbox workarounds, drop AI attribution),
  mvu-helper `doc/ai_guide/*`, summaryception `docs/agents/issue-tracker.md`, ztracker `.github/instructions/*` (`npm install`, drive a live
  ST), castward `AGENTS.md` (escalate permissions), nemopresetext tracked `.claude/settings.local.json`, tavernos-hud attribution headers.

## SO defects

Fixed on `v3.0-defects-1108` (record in `47-harvest-2026-11-08.md` §Gate record):

- Write-ahead effect refused after a save that only waited behind another save (v2.9 13 candidate): the persist is asked once more first.
- Author nudge lost when a generation stopped or ended with no reply (tavernos-hud review): now spent only by a rendered reply.
- A model refusal kept as the first short-term or any scene summary (summaryception review): `isRefusal` in `summaryGuard.ts`.
- Text clips could end on half a surrogate pair (small-updates review): `clipText`.
- A story workflow counted as usable when `"%prompt%"` appeared anywhere, titles and UI-format graphs included (image review).
- Chapter seal save/announce fault cells covered by tests (fault matrix todo rows); wall-clock perf asserts flaked under load (now CPU
  time); the run-header manifest test needed a build.

Open (in plan 47): renamed memory-mirror book orphaned; check outcome reaches only the reply after the attempt; `lorebookFileId` vs ST's
sanitize (trim, 255-byte cap); `degenerate.ts` misses single-character and short-unit tail loops; ST cancels every ComfyUI job on one
request's abort (host fact, check against the GPU broker); a thought-only reply that is not last is never retried (host limit, kept).

## Ideas (ranked in plan 47)

- Image track: save an invented NPC's look once and reuse it; strip appearance words when every pictured member has a stored look; loop
  finishing for 11b / 45 C; post the filled workflow straight to `/api/sd/comfy/generate` instead of swapping ST's setting; expression
  recipe wording (rate first); previous scene picture as place reference.
- Memory: compaction cut starts at a player row (before the A3-R rating); sticky recall inside a scene; memorize-backlog coverage record;
  author "reread just this value"; evidence source by claim kind; interop test for a peer's dry-run WI scan.
- Play: relationship "wound" line; nudge pinned to its reply across swipes; per-character physical tells; an outcome-pending clause or a
  pre-reply check read.
