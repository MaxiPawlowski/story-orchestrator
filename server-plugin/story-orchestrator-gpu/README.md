# story-orchestrator-gpu

**Advanced and machine-specific. Do not install it unless your setup matches the one below.**

A SillyTavern server plugin that coordinates a local text model and ComfyUI renders on **one GPU**. It was built for
one machine and assumes all of this:

- the text model is **`TheDrummer/Artemis-31B-v1.1-GGUF` served by Unsloth Studio on `127.0.0.1:8888`**;
- ComfyUI runs on `127.0.0.1:8188`;
- your text Connection Manager profiles point at this plugin's proxy, `127.0.0.1:18888`, by hand;
- there is nothing to configure: ports and the model name are fixed in `gate.mjs` and `index.mjs`.

## What it does

- Runs an HTTP proxy on `127.0.0.1:18888` that forwards `/v1/*`, `/health`, `/props`, `/completion`, `/tokenize` and
  `/detokenize` to `127.0.0.1:8888`. While an image holds the GPU, text requests wait in a queue.
- Before an image: checks Unsloth Studio's active generations and status, requires the loaded model to be Artemis,
  and unloads it. After the image: waits for ComfyUI's queue to empty and calls ComfyUI's `/free`, so text can load
  again.
- Recovers on its own: a lease is checked every 15 s and released after 60 s without renewal (120 s once renewed);
  after 600 s it interrupts ComfyUI.

## What happens elsewhere

- **Not installed**: the extension renders images without coordination. This is the right choice for nearly
  everyone.
- **Installed on a different setup**: every lease is refused (409), so **every image fails**. Remove
  `<SillyTavern>/plugins/story-orchestrator-gpu` and restart SillyTavern.

`npm run plugin:install` currently installs it along with the other plugins, and the release zip ships it. Making it
opt-in, fail-open and adaptable to other backends is planned (`docs/plans/v2.8/05-self-contained-images.md`).

## Routes

Under `/api/plugins/story-orchestrator-gpu`: `GET /status` (`{phase, activeText, waitingText, imageLease}`),
`POST /lease`, `POST /renew`, `POST /release`. A lease needs a Bearer token the proxy has already seen.

## Tests

`npm run test:plugin` covers `gate.mjs`.
