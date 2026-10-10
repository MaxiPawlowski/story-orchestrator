# Plan 30 — Model downloads from Civitai and Hugging Face

**Status: SEEDED 2026-10-07 from the user's idea list ("add civitai api key or hugging face api key to download
models", `00-overview.md` tail); needs user approval; not built.** Implementation D; acceptance LI (one real download
per provider, small file).

## Problem / idea

A story or recipe that needs a checkpoint, LoRA or upscaler the user lacks can only say "missing" today (v2.7 17 route
B validation; v2.8 29 bundled workflows). The user then finds the file by hand, often behind a login (Civitai needs a
token for many files; gated Hugging Face repos need one). Idea: the user stores a Civitai and/or Hugging Face token
once, and the product offers to download exactly the missing file into their ComfyUI model folders, verified.

## Player / author outcome

- Repair row "This story's pictures need 2 models you don't have" → **Download…** opens one card per file: name,
  source (Civitai model/version or HF repo/file), size, license/usage terms, target folder, free space. The user
  confirms each. Progress shows in the panel; a cancelled or broken download resumes.
- Nothing ever downloads on its own: not on import, not on story start, not from a wizard step.
- Authors: a recipe/LoRA entry carries a source reference (`civitai {modelId, versionId, sha256}` already exists on
  `Lora`, `src/image/catalog.ts:36`; add `hf {repo, file, revision, sha256}`), so a shared story can say where its
  models come from without shipping them.

## Existing code to reuse

| What | Where |
|---|---|
| Key stored in ST secrets, never readable by the page | judge: page `writeSecret` (`src/services/stHost/judge.ts:29,95`), plugin `readSecret(request.user.directories, key)` (`server-plugin/story-orchestrator-judge/index.mjs:65-73,123-129`), per user when accounts are on |
| ST already has an HF secret slot | ST `src/endpoints/secrets.js:44` `HUGGINGFACE: 'api_key_huggingface'` (reuse; Civitai gets `so_civitai_token`) |
| ComfyUI model roots on the ST server | `server-plugin/story-orchestrator-media/index.mjs:19` `config.modelRoots` (README example: `diffusionModels`, `textEncoders`, `vaes`, `backgroundModels`) |
| Model size/identity from file headers | `scripts/local/models.mjs` (`safeName` `:7-12`, `modelIdentities`), `safetensors.mjs`, `gguf.mjs` (move with v2.8 28) |
| Streamed hash cache | media plugin README "Model hashes are streamed and cached by file size, modification time and change time" |
| Discovery of installed models | v2.7 17 route B: ComfyUI `/object_info` (checkpoints, LoRAs, upscalers) + `/embeddings` |
| Create-only provisioning cards | v2.1 plan 06 (`src/wizard/provisioning.ts`), one card per asset, never "Accept all" |

## Design

### A. Keys

- Settings → Image → "Model sources": two password fields (Civitai token, HF token), write-only through
  `writeSecret`; the panel shows only "set / not set" and a **Test** button (plugin calls Civitai `/api/v1/me` or HF
  `/api/whoami-v2` with the key and answers ok/refused, never the key).
- The plugin reads the key server-side per request (judge `resolveKey` shape). No env/dotenv fallback (decision 4).

### B. Plugin routes (in `story-orchestrator-media`, new `downloads.mjs`)

| Route | Does |
|---|---|
| `POST /models/resolve` | `{provider, ref}` → metadata only: file name, size, sha256, license/terms URL, base model, kind. Civitai: `GET /api/v1/model-versions/{versionId}` (files[].hashes.SHA256, sizeKB, downloadUrl); HF: `HEAD` on `https://huggingface.co/{repo}/resolve/{revision}/{file}` (`x-linked-size`, `x-linked-etag` = sha256 for LFS) |
| `POST /models/plan` | resolve + target dir + free bytes on that volume + "already present" (same sha256 found under any root) |
| `POST /models/download` | starts one confirmed download (body: the plan id, never a URL or path) |
| `GET /models/jobs`, `POST /models/cancel` | progress, cancel |

- **Target directory**: one of the configured `modelRoots[kind]`, chosen by the user on the card; the product never
  writes outside a configured root (path resolved and prefix-checked, `models.mjs:21-23` shape). No root configured
  for a kind → the card offers "configure a folder" (admin), never a default path.
- **Discovered, not hardcoded**: roots from the media config, and where ComfyUI exposes it, its `extra_model_paths`
  folders via `/object_info` lists cross-checked; disk space via `fs.statfs`.
- **Resumable**: write to `<target>.part` + a sidecar `{url host, sha256, bytes}`; resume with `Range`; a server that
  ignores `Range` restarts. Final: sha256 over the whole file must equal the resolved hash, then atomic rename.
  Mismatch deletes the `.part` and reports. No hash available from the source → refused (decision 3).
- **Redirect policy**: follow only to the provider's known CDN hosts (Civitai's storage redirect, HF `cdn-lfs*`);
  the token goes only to the provider host, never forwarded on a cross-host redirect.
- One download at a time per ST user, bounded queue; admin-only (it writes to the server's disk and spends the
  host's bandwidth; `isAdmin` precedent `story-orchestrator-harness/index.mjs:577`).
- After success: ComfyUI's model list refresh (`/object_info` re-read; the image capability cache invalidated), the
  Repair row goes green from evidence.

### C. Catalog defaults → discovery

- The three hardcoded checkpoints (`WAI`, `JANKU`, `FLUX`, `catalog.ts:53-55`) stop being defaults (v2.7 17 §A
  already makes them suggestions). Suggestions keep a source reference so "Download suggested model" is one card.
  FLUX stays out (v2.8 28 / v2.7 31).
- A missing model is matched by sha256 first (a renamed file still counts), name second.

### D. This machine (v2.8 rule 5)

No new weights on `C:`. The product's target-dir choice covers it: this machine's media config lists only `F:`
roots for new downloads, and the gate asserts a download to a `C:` root is refused **on this machine's lane config**
(a generic install may use any root; the rule is a config, not code). The image-track exception (existing C: models
stay for autoload) is untouched: nothing is moved.

## Security & privacy

- Tokens: ST secrets only, written by the page, read only by the plugin, never returned, never logged, never in a
  URL query (HF/Civitai both accept `Authorization: Bearer`). Per ST user when accounts are on.
- No URL or path from the page: the page sends a provider + model/version ref; the plugin builds the URL from a fixed
  host list and the target from configured roots.
- Never auto-download; each file needs the user's click on a card that shows size, source, license and target.
  Story content can only *request* a card. The license/terms link is shown; NSFW flags from Civitai metadata are shown.
- Downloaded `.safetensors` only by default; `.ckpt`/`.pt`/`.bin` (pickle, code execution on load) refused unless an
  admin setting allows them (decision 5). GGUF allowed for text models.
- Disk: refuse when free space < size + 2 GiB margin (proposed).

## Gates

- **D:** key write/test with fake providers (key never in any response or log line; planted key grep); resolve/plan
  parsers against recorded Civitai and HF metadata fixtures; path containment (`..`, absolute, symlink out of root);
  redirect host policy (token not sent cross-host); resume (`Range` honoured / ignored); sha256 mismatch deletes
  `.part`; free-space refusal; pickle refusal; admin-only 403; no route accepts a URL or path. `npm run gates`.
- **LI (acceptance):** one small real file per provider (an SDXL LoRA from Civitai, a small HF safetensors), into an
  `F:` root, interrupted once and resumed, hash verified, ComfyUI lists it, ×2; proposed floor: 100% verified,
  0 bytes written outside the chosen root, 0 key leaks in logs/journal.
- **Tray:** none (no new server; the media plugin runs inside ST).
- **Registry:** feature entry + Help page "Downloading models".

## Dependencies

v2.7 17 (route B discovery, recipes), v2.7 31 (catalog/FLUX removal), v2.8 28 (models.mjs/safetensors helpers move
into the plugin), v2.8 29 (bundled workflows list their models), v2.7 04 (Repair/check registry).

## Decisions for the user

1. Both providers in the first cut? **Recommended: yes; Civitai first (LoRA refs already in the catalog).**
2. Admin-only downloads? **Recommended: yes.**
3. Refuse a file with no source-side sha256? **Recommended: yes.**
4. Keys from ST secrets only (no env/dotenv)? **Recommended: yes; the judge's dotenv fallback is not copied.**
5. Refuse pickle formats (`.ckpt/.pt/.bin`) by default? **Recommended: yes, admin can allow.**
6. Reuse ST's existing `api_key_huggingface` slot (shared with ST's own HF features)? **Recommended: yes.**

## Links

`src/image/catalog.ts`; `server-plugin/story-orchestrator-media/{index.mjs,README.md}`;
`server-plugin/story-orchestrator-judge/index.mjs`; `src/services/stHost/judge.ts`; `scripts/local/models.mjs`;
ST `src/endpoints/secrets.js`; `docs/plans/v2.7/17-self-contained-images.md`; v2.8 28, 29.

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer.

## Owner decisions to confirm (2026-10-10, build)

Owner approval 2026-10-10 (queue A11); each open decision took the plan's recommendation, recorded for the owner to
confirm: (1) both providers in the first cut; (2) admin-only downloads (resolve/plan/download/cancel/jobs/test-key;
"keys set?" is readable by any signed-in user); (3) a file with no source SHA256 is refused (Hugging Face non-LFS
files included); (4) keys from ST secrets only, per user, no env/dotenv; (5) pickle formats refused unless
`downloads.allowPickle`; (6) ST's own `api_key_huggingface` slot reused, Civitai in `so_civitai_token`.

Changed from §D after the coordinator's message (2026-10-10): the owner wants dynamically loaded models on the fast
disk (`C:/dev/models`, which ComfyUI's `extra_model_paths.yaml` already reads), and C: is nearly full. So no code or
config rule refuses C:; instead every download checks the target drive's free space (`fs.statfs`) against the file
plus a 2 GiB margin, at the card, before the transfer and every GiB when the size is unknown, and refuses with the
numbers. Nothing was downloaded tonight. To confirm.

Also decided while building, to confirm: Civitai CDN redirects are allowed only to `*.civitai.com` and Civitai's
`civitai-delivery-worker-prod.*.r2.cloudflarestorage.com` bucket, Hugging Face to `*.huggingface.co` / `*.hf.co`;
"already present" checks the target name (same size + SHA256), not every file under every root; the Repair-row entry
point is not built (the main bundle sits at 1,249,994 of 1,250,000 bytes); the download form lives in Images →
Image service → Model sources, which is lazy.

## Gate record (2026-10-10, branch `v2.8-media-stack`)

As built:
- `server-plugin/story-orchestrator-media/downloads.mjs`: reference parsing (no URL or path), Civitai
  `model-versions/{id}` and Hugging Face `HEAD …/resolve/…` resolvers, format and name checks, host allowlist,
  plan cards (folder from `modelRoots[kind]`, present/conflict, free space), a per-user queue, `.part` + sidecar,
  `Range` resume, full SHA256 verify, `link` into place (never overwrite), key test (`/api/v1/me`,
  `/api/whoami-v2`). `downloadRoutes.mjs`: admin-only routes, body allowlists. `index.mjs`: keys via ST's
  `secrets.js` `readSecret`.
- Page: `stHost/modelDownloads.ts` (key write through ST's `writeSecret`, never read back), `src/image/ModelSources.tsx`
  + `downloadCopy.ts` (cards, progress, Stop), inside Images → Image service → Model sources; catalog `Lora.hf` ref.
- Docs: `setup/images.md` "Downloading models", `setup/models.md` pointer, media plugin README, registry
  `model-downloads` (experimental).

Gates: `npm run gates -- --no-storybook --jobs 2` all green (test 7446 passed / 1 skipped; test:plugin 213/213 incl.
11 new download tests; test:release 119/119; typecheck:test, lint, build, test:debug, test:replay green). Storybook
skipped; stories to run: `Settings/ModelSources` (3), `Settings/ImageGroup`. Download tests run against fake
providers only: planted-key grep over every response and log line, signed-URL grep, path containment, redirect host
policy (token only to the provider host), resume with `Range` honoured and ignored, SHA256 mismatch deletes `.part`,
free-space refusal, pickle refusal, never-overwrite, admin-only 403, no URL/path accepted, ST-secrets-only keys.

Not run: LI (one small real file per provider, interrupted and resumed, ×2) — needs a token from the owner and room
on the target drive; nothing was downloaded. Open.
