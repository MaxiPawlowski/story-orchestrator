# Illustrations

In **Image service**, choose **Use SillyTavern Image Generation settings**. Configure a source in ST's own Image
Generation extension, then use **Test render** in an open group chat. Its saved image appears as a separate message.

The optional **Image-prompt model** picker uses Connection Manager. Leave it empty for a template built from the
current public scene and appearance details. It never switches your reply profile.

New installs draw automatically only at story-authored moments. Every-N automation is opt-in. With local ComfyUI
stopped, automatic attempts are suppressed; Test render explains which setup step is missing.

## Advanced ComfyUI

Install the optional media plugin for owned render jobs and sprite edits:

`npm run plugin:install -- --with media`

Restart SillyTavern after installation. The plugin's `config.json` selects the ComfyUI endpoint and model roots.
See `server-plugin/story-orchestrator-media/README.md`. Reuse your existing model folders; the plugin does not copy,
move or download model weights.
Map installed models to a supported recipe; a matching filename alone is not a compatible model.

## GPU sharing

Only local text and image models using the same graphics card need coordination. Cloud and RunPod reply models do
not use the local image GPU. The GPU broker is optional (`--with gpu`), configurable, and passes images through when
no adapter is configured. An enabled adapter refuses work it cannot safely coordinate.

The current verified adapter is Unsloth. It requires an explicit upstream, model and ComfyUI URL. A local
llama-server adapter needs its own verified unload/reload interface before it can be enabled.

## Privacy

An image prompt goes to the image backend selected in ST. A director profile also receives the current scene's
prompt context. Select local backends for local processing; cloud backends send that input to their providers.

[Sprite builder](sprites.md) · [Setup](README.md)
