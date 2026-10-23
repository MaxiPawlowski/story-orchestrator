# story-orchestrator-media

Optional server plugin for Story Orchestrator's advanced pictures: owned ComfyUI jobs, reference edits, model fingerprints and generated sprite files. Ordinary illustrations use SillyTavern's configured Image Generation backend without it.

| | |
|---|---|
| Who needs it | Authors who use the Studio sprite builder, reference edits, changed looks, or the advanced ComfyUI recipes. |
| Install | From a source checkout: `npm run plugin:install -- --with media`. From a release zip: copy this folder to `<SillyTavern>/plugins/story-orchestrator-media/`. |
| Enable | Set `enableServerPlugins: true` in SillyTavern's `config.yaml`, then restart SillyTavern. A plugin is loaded only at start. |
| Configure | `config.json` beside this plugin: model roots and, optionally, the ComfyUI address (below). |
| It works when | while signed in to SillyTavern, `http://127.0.0.1:8000/api/plugins/story-orchestrator-media/status` (your SillyTavern address) answers with JSON instead of an error; `comfyUrlFrom` says which ComfyUI address it uses. |
| User guide | [Illustrations](../../docs/guide/setup/images.md), [Sprite packs](../../docs/guide/setup/sprites.md) |

The general install steps for every plugin: [Server plugins](../../docs/guide/setup/README.md#server-plugins).

## Configuration

`config.json` beside this plugin holds the local model roots and, optionally, the ComfyUI server. Without `comfyUrl`
the plugin uses the ComfyUI address set in SillyTavern's Image Generation settings (per user), then ComfyUI's
documented default `http://127.0.0.1:8188`. `/status` reports which one it used (`comfyUrlFrom`).

```json
{
  "comfyUrl": "http://127.0.0.1:8188",
  "modelRoots": {
    "diffusionModels": ["F:/models/story-orchestrator/diffusion_models"],
    "textEncoders": ["F:/models/story-orchestrator/text_encoders"],
    "vaes": ["F:/models/story-orchestrator/vae"]
  }
}
```

The roots refer to files on the ST server. A remote ComfyUI requires a fingerprint service on that host;
the builder refuses a model it cannot fingerprint rather than caching by file name.
Model hashes are streamed and cached by file size, modification time and change time.

Jobs are scoped to ST's authenticated user. Cancel removes only the job's pending prompt id.
A running cancelled image finishes on ComfyUI and is discarded; no global interrupt is sent.
Generated sprites have a write-ahead per-set manifest. An unowned or externally changed file is never replaced
or deleted. Replacing an unchanged generated file requires its reviewed hash.

Existing expression packs are read through `/sprites/reference-pack`; reading does not create a generated manifest or
grant overwrite/delete permission. `/sprites/inventory` gives the cleanup harness each generated label's recorded and
actual hash. Story-scoped removal preserves unrelated files even when the last generated label is removed.

Card-art base creation needs an alpha-removal recipe. Add `backgroundModels` to `modelRoots` and `alphaRecipes` to the
config, naming the installed node/model and every file its loader requires. Example (reuse existing files):

```json
"alphaRecipes": [{
  "id": "birefnet_toonout", "node": "BiRefNetRMBG", "model": "BiRefNet_toonout",
  "files": [
    {"kind": "backgroundModels", "name": "BiRefNet/BiRefNet_toonout.safetensors"},
    {"kind": "backgroundModels", "name": "BiRefNet/birefnet.py"},
    {"kind": "backgroundModels", "name": "BiRefNet/BiRefNet_config.py"},
    {"kind": "backgroundModels", "name": "BiRefNet/config.json"}
  ]
}]
```

Discovery offers only recipes whose node/model and files exist. Submission rechecks the files; an unconfigured alpha
model is refused before ComfyUI runs it. It never downloads weights for a recipe; model downloads are a separate, confirmed step (below). Restart ST after changing its config.

For local temporary-reference cleanup, set `comfyInputRoot` to that ComfyUI's existing input directory. Each upload is
recorded before the host call in a per-user reference ledger. The builder releases its exact name in `finally`;
cleanup removes only a released input whose bytes still match, and waits while ComfyUI has queued/running work.
`/prune` takes an explicit list of ledgered names; it never scans or deletes unrelated inputs. Each idle prune also
removes ledgered references a deferred cleanup left, and active ones older than 30 minutes (a page reloaded mid-render
never released them). Remote ComfyUI without
a local input root keeps references and reports cleanup deferred. Test cleanup scopes references by set/story marker
and a trusted pre-run inventory, the same as generated sprites.

## Model downloads (`downloads.mjs`, `downloadRoutes.mjs`)

Admin-only routes under `/api/plugins/story-orchestrator-media/models`: `GET keys` (set / not set, any signed-in
user), `POST test-key {provider}`, `POST plan {provider, ref, kind?, root?}`, `POST download {planId}`, `GET jobs`,
`POST cancel {id}`. No route accepts a URL or a path: `ref` is a Civitai `{versionId, fileId?}` or a Hugging Face
`{repo, file, revision?}`, `root` is the index of a configured `modelRoots[kind]` folder.

- Tokens are read per request from ST secrets (`so_civitai_token`, ST's own `api_key_huggingface`), per user when
  accounts are on; no env or dotenv fallback. They are sent only to `civitai.com` / `huggingface.co`, never on a
  redirect to a CDN, and never appear in a response or a log line.
- Redirects are followed only to the provider's hosts (Civitai's delivery bucket, Hugging Face's `*.hf.co` CDNs).
- A file needs a source SHA256 (Civitai `hashes.SHA256`, Hugging Face `x-linked-etag` of an LFS file). It downloads to
  `<name>.part` + a `.part.json` sidecar, resumes with `Range` (a server that ignores `Range` restarts it), is hashed
  in full, and is linked into place without ever overwriting; a mismatch deletes the partial file.
- Free space (`fs.statfs`) must cover the remaining bytes plus `downloads.freeMarginBytes` (default 2 GiB), checked at
  the card, before the transfer and every GiB when the size is unknown. `.ckpt/.pt/.pth/.bin` are refused unless
  `downloads.allowPickle` is true. One download at a time per user, `downloads.maxQueue` (default 4) queued.

```json
"modelRoots": { "checkpoints": ["D:/models/checkpoints"], "loras": ["D:/models/loras"] },
"downloads": { "freeMarginBytes": 2147483648, "allowPickle": false }
```
