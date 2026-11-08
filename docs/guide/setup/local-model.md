# Running the reply model yourself

Story Orchestrator does not write replies; your SillyTavern connection does. Any model SillyTavern can reach works. This
page is for running the tested model, **TheDrummer's Artemis 31B v1.1** (see [Choosing models](models.md#what-we-tested-on)),
on hardware you control: your own graphics card, or a GPU you rent by the hour. Cloud APIs need none of this.

There are three ways, from simplest to most involved:

| Way | What runs | When to pick it |
|---|---|---|
| **Plain llama.cpp** | `llama-server` on your machine, started by you | One GPU just for text, nothing else on it. |
| **The local controller** | A small gateway in front of `llama-server` that loads it on demand, shares the card with ComfyUI and keeps each character's prompt warm | Text and pictures on the same card, or long group chats where switching speakers is slow. |
| **A rented GPU** | `llama-server` (or the controller) on a rented Linux box, reached through an SSH tunnel | Your own card is too small, or busy with pictures. |

Whichever you pick, SillyTavern talks to it the same way: a **Text Completion** connection profile of type
**llama.cpp** pointing at a local address, with the Gemma 4 instruct and reasoning templates and the **Artemis v1.1 RP**
preset settings from [Choosing models](models.md#what-we-tested-on). Then set the preset's context to what the server
holds, or tick **Derive context size from backend**. With more, long chats stop getting replies, and **This chat →
Play** says so.

## Plain llama.cpp

Download a `llama-server` build for your card from llama.cpp's releases (b11888 or later) and the model file
(`TheDrummer/Artemis-31B-v1.1-GGUF`, the Q4_K_M quantization, about 18.7 GB). Start it bound to your own machine only:

```bash
llama-server --model Artemis-31B-v1m-Q4_K_M.gguf --host 127.0.0.1 --port 8080 \
  --ctx-size 32768 --n-gpu-layers all --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --jinja
```

Point the connection profile at `http://127.0.0.1:8080`. On a 24 GB card the model holds 32,768 tokens at full speed;
a larger context spills to the CPU and replies at under a token a second.

**It worked when** a reply streams at tens of tokens a second. Single digits mean some layers ended up on the CPU.

If you also draw pictures with ComfyUI on the same card, add the [GPU plugin](gpu-sharing.md) so the two take turns.

## The local controller

`scripts/local/` in the repository holds the controller the extension is developed against. It is a gateway on
`127.0.0.1:18888` that owns a `llama-server` and, when pictures are on, the ComfyUI it starts:

- **Text loads on demand** and unloads (or sleeps) when a picture needs the card, then comes back for the next reply.
  Every request goes through one queue, so a reply never starts while a picture holds the memory it needs.
- **Context is checked before sending.** A request that would not fit the loaded context is answered with a clear
  error naming the context to set, instead of being cut.
- **Each character keeps a warm prompt.** In a group chat every speaker's prompt starts differently, so a plain server
  reprocesses the whole prompt on every speaker switch. With the member cache (a small patch to llama.cpp, shipped in
  `scripts/local/llama-patches/`), each speaker's state is kept in memory and restored on their next turn.
- **A speed-up drafter.** With an MTP drafter file for the model, replies decode about a third faster.
- **Performance modes** (Max, Headroom, Balanced, Safe) trade memory headroom for speed in one switch.

The GPU plugin talks to it with `"adapter": "managed"` and a `controllerUrl` (see [One GPU for text and
images](gpu-sharing.md#choosing-a-mode)). Start it with `node scripts/local/cli.mjs start`, check it with `node
scripts/local/cli.mjs status`, and stop it with `node scripts/local/cli.mjs stop`. Its configuration is a JSON file named
by `SO_LOCAL_CONFIG`; every key, the performance modes and the measurements behind them are in
[scripts/local/README.md](../../scripts/local/README.md).

The controller is tuned for one Windows machine with a 24 GB card and is not a packaged product: expect to read its
README and adjust paths, reserves and profiles for your own hardware. It never exposes anything beyond `127.0.0.1`.

## A rented GPU

`scripts/remote/` sets up a rented Linux box from your own machine over SSH. The plain server path was run on Vast.ai
with an RTX 3090; the controller path has been checked on Linux without a GPU so far. Nothing on the box listens beyond `127.0.0.1`; your SillyTavern reaches it through
an SSH tunnel.

1. **Rent** a box with an NVIDIA GPU, a CUDA 12.8 or newer **devel** image (Ubuntu 22.04 or 24.04) and at least 60 GB
   of disk. Add your SSH key and note its address and SSH port.
2. **Set it up** with `scripts/remote/vast-bootstrap.sh`, run on the box through SSH, one phase at a time:
   `deps` (build tools), `build` (llama.cpp b11888 for your card: `CUDA_ARCH=86` for a 3090, `120` for a 5090),
   `models` (the model from Hugging Face, checked by its hash), then `serve` (plain `llama-server` in a `tmux` session)
   or `controller` (the controller described above, text only; for the member cache build with `SO_PATCH=1` after
   copying `scripts/local/llama-patches/so-cache-b11888.patch` to the box). Every phase can be re-run and
   skips work already done; `status`, `health` and `stop` (or `controller-status`, `controller-health`,
   `controller-stop`) check on it.

   ```bash
   ssh -p <ssh port> root@<box address> 'bash -s -- deps' < scripts/remote/vast-bootstrap.sh
   ssh -p <ssh port> root@<box address> 'bash -s -- build' < scripts/remote/vast-bootstrap.sh
   ```

3. **Open the tunnel** in its own terminal: `bash scripts/remote/ctl-tunnel.sh <box address> <ssh port> <key>` keeps
   `127.0.0.1:18890` on your machine connected to the box's controller, and reconnects after a drop.
4. **Point SillyTavern at it**: duplicate your Artemis connection profile, set its server address to
   `http://127.0.0.1:18890`, select it, and set the preset's context to what the box serves (the controller reports it,
   so **Derive context size from backend** works).

**It worked when** a test reply comes back through the tunnel at tens of tokens a second. Pictures keep running on your
own machine; only text moves to the box.

Two things to know: the scripts expect the MTP drafter file, which is not published on Hugging Face (upload your own,
or run the controller without it with `CTL_MTP=none`), and a stopped rented box still bills its disk, so **destroy** it
in the provider's page when you are done.

<!-- showcase: rented-gpu -->

---

[Choosing models](models.md) · [One GPU for text and images](gpu-sharing.md) · [Setup](README.md)
