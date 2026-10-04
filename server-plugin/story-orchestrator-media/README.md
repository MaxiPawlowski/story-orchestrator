# Optional media plugin

Install with `npm run plugin:install -- --with media`, then restart SillyTavern.
Ordinary illustrations use ST's configured Image Generation backend without this plugin.
Reference edits and the Studio sprite builder require it.

`config.json` beside this plugin selects the ComfyUI server and local model roots:

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
