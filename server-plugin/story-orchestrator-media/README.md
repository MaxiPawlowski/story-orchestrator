# Optional media plugin

Install with `npm run plugin:install -- --with media`, then restart SillyTavern.
Ordinary illustrations use ST's configured Image Generation backend without this plugin.
Reference edits and the Studio sprite builder require it.

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
model is refused before ComfyUI runs it. The plugin never downloads weights. Restart ST after changing its config.

For local temporary-reference cleanup, set `comfyInputRoot` to that ComfyUI's existing input directory. Each upload is
recorded before the host call in a per-user reference ledger. The builder releases its exact name in `finally`;
cleanup removes only a released input whose bytes still match, and waits while ComfyUI has queued/running work.
`/prune` takes an explicit list of ledgered names; it never scans or deletes unrelated inputs. Remote ComfyUI without
a local input root keeps references and reports cleanup deferred. Test cleanup scopes references by set/story marker
and a trusted pre-run inventory, the same as generated sprites.
