import { comfyDiscover, comfyFingerprint, spriteFileFingerprint, spriteManifest, spriteReferencePack } from "@services/stHost/media";
import { spriteList } from "@services/stHost/sprites";
import { closeImageBurst, gpuBrokerStatus, openImageBurst } from "@services/stHost/gpuBroker";
import { beginRun } from "@runtime/runToken";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { createSpriteBuilder } from "./host";
import { contentHash, EDIT_RECIPE, recipeProblems } from "./recipes";
import { publicLook } from "@engine/cardFields";
import { log } from "@utils/log";
import { hostGenerating, waitForTextPriority } from "./textPriority";
import { completeLookFrames, LOOK_FRAME_KINDS, lookFrameRequest, lookKeyInput, lookStillRequest } from "./lookFrames";
import { frameIndex, type AnimationFrames } from "../animation";
import { visualRoot } from "../visualManifest";
import { verifyVisualSource, sourceStillCurrent, publishDerivedVisual } from "../visualHost";
import { anySignal } from "@utils/signals";

export interface LookRequest {
  folder: string; member: string; label: string; fields: Record<string, string>;
  accepts(): boolean; apply(set: string, files: Array<{ label: string; path: string }>, frames?: AnimationFrames): void;
  failed?(reason: string): void;
}

const LOOK_BURST_MS = 180_000;

export class OnDemandLooks {
  private stopped = false;
  private active: ReturnType<typeof createSpriteBuilder> | null = null;
  private activeRequest: LookRequest | null = null;
  private controller: AbortController | null = null;
  private queue = new Map<string, LookRequest>();
  private running = false;
  private attempted = new Set<string>();

  constructor(private readonly manager: RuntimeManager) {}

  private cancel(): void { this.controller?.abort(); this.active?.cancel(); }
  close(): void { this.stopped = true; this.queue.clear(); this.cancel(); }

  revalidate(): void {
    if (this.activeRequest && !this.activeRequest.accepts()) this.cancel();
    for (const [key, request] of this.queue) if (!request.accepts()) this.queue.delete(key);
  }

  request(request: LookRequest): void {
    if (this.stopped || !Object.keys(request.fields).length) return;
    this.revalidate();
    const key = `${request.member}:${request.label}:${JSON.stringify(request.fields)}`;
    if (this.attempted.has(key)) return;
    this.queue.set(key, request);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    const opened = await openImageBurst({ count: this.queue.size * (1 + LOOK_FRAME_KINDS.length), ttlMs: LOOK_BURST_MS, kind: "looks" });
    if (!opened.ok) log.info("The GPU broker was not told about the look burst", opened.reason);
    try {
      while (this.queue.size && !this.stopped) {
        const [key, request] = this.queue.entries().next().value as [string, LookRequest];
        this.queue.delete(key);
        if (!request.accepts()) continue;
        this.attempted.add(key);
        if (this.attempted.size > 200) this.attempted.delete(this.attempted.values().next().value as string);
        await this.edit(request).then(() => this.attempted.delete(key)).catch((error) => log.warn("A changed-look sprite was not generated", error));
      }
    } finally {
      this.running = false;
      if (opened.ok && opened.burst) {
        const closed = await closeImageBurst(opened.burst);
        if (!closed.ok) log.info(closed.reason);
      }
    }
  }

  private async edit(request: LookRequest): Promise<void> {
    const run = beginRun(this.manager.getOwnership());
    const builder = createSpriteBuilder(this.manager.getOwnership());
    const controller = new AbortController(), signal = anySignal([run.signal, controller.signal]);
    this.controller = controller;
    this.active = builder;
    this.activeRequest = request;
    const accepted = this.manager.getGlobalSettings().sprites.visualSources[request.folder];
    const guard = () => {
      signal.throwIfAborted();
      if (this.stopped || !run.stillOwns() || !request.accepts()) throw new Error("The look changed before this sprite was ready.");
      if (accepted && !sourceStillCurrent(accepted)) throw new Error("The accepted visual source changed before this look was ready.");
    };
    try {
      const settings = this.manager.getGlobalSettings().sprites;
      const config = settings.builders[request.folder];
      guard();
      if (accepted) await verifyVisualSource(accepted, signal);
      guard();
      if (!config || !settings.onDemand) throw new Error("Choose an expression reference pack in Studio before enabling on-demand look edits.");
      const story = this.manager.getCachedSnapshot().storyId;
      if (!story) return;
      const discovery = await comfyDiscover(signal);
      guard();
      const problems = recipeProblems(discovery, config.models);
      if (problems.length) throw new Error(problems.join(" "));
      const [diffusion, encoder, vae] = await Promise.all([
        comfyFingerprint("diffusionModels", config.models.diffusion, signal),
        comfyFingerprint("textEncoders", config.models.encoder, signal),
        comfyFingerprint("vaes", config.models.vae, signal),
      ]);
      guard();
      const base = await spriteReferencePack(request.folder, accepted?.baseSet ?? config.baseSet);
      const version = base.sha256;
      const models = { diffusion, encoder, vae };
      const key = await contentHash(new TextEncoder().encode(lookKeyInput({ story, member: request.member, fields: request.fields, version, models,
        recipe: EDIT_RECIPE, config, ...(accepted ? { visualRoot: visualRoot(accepted) } : {}) })));
      const set = `look_${key.slice(0, 8)}`;
      const build = { folder: request.folder, set, label: request.label, key, story, member: request.member, models, config };
      const existing = await spriteList(`${request.folder}/${set}`);
      const cached = await spriteManifest(request.folder, set);
      guard();
      const animate = async (path: string, hash: string): Promise<AnimationFrames> => completeLookFrames({
        guard,
        wait: () => waitForTextPriority({ status: gpuBrokerStatus, loud: hostGenerating, current: () => !this.stopped && run.stillOwns() && request.accepts(),
          signal, now: Date.now, sleep: () => new Promise((resolve) => setTimeout(resolve, 500)) }),
        cached: async (kind) => {
          const manifest = await spriteManifest(request.folder, `anim-${set}`);
          guard();
          const row = manifest?.labels[`${request.label}.${kind}`];
          if (row?.status !== "complete") return null;
          const index = frameIndex(await spriteList(`${request.folder}/anim-${set}`));
          guard();
          const path = index.get(request.label)?.[kind];
          if (!path || row.inputs?.base !== hash) throw new Error("The cached animation no longer matches this look.");
          const actual = await spriteFileFingerprint(path, signal);
          guard();
          if (actual !== row.sha256) throw new Error("The cached animation changed outside Story Orchestrator.");
          return path;
        },
        render: async (kind) => {
          const candidate = await builder.build(lookFrameRequest(build, kind, { path, sha256: hash }));
          if (this.stopped || !run.stillOwns() || !request.accepts()) throw new Error("The look changed before this frame could be saved.");
          const saved = await builder.save(candidate);
          guard();
          return saved.path;
        },
      });
      if (cached?.labels[request.label]?.status === "complete") {
        const rendered = await spriteReferencePack(request.folder, set);
        guard();
        if (rendered.files.find((file) => file.label === request.label)?.sha256 !== cached.labels[request.label].sha256) {
          throw new Error("The cached sprite changed outside Story Orchestrator. Choose another generated set.");
        }
        const file = rendered.files.find((file) => file.label === request.label);
        if (!file) throw new Error("The cached look expression is missing.");
        const frames = await animate(file.path, file.sha256);
        guard();
        if (accepted && request.label === "neutral") publishDerivedVisual(run, request.folder, visualRoot(accepted), set, request.fields,
          { path: file.path, sha256: file.sha256, key: cached.labels[request.label].key, recipe: cached.labels[request.label].recipe });
        request.apply(set, existing, frames); return;
      }
      const reference = accepted ? { ...accepted.base, label: "neutral" } : base.files.find((file) => file.label === request.label) ?? base.files.find((file) => file.label === "neutral");
      if (!reference) throw new Error("The base pack has no reference for this expression.");
      await waitForTextPriority({ status: gpuBrokerStatus, loud: hostGenerating, current: () => !this.stopped && run.stillOwns() && request.accepts(),
        signal, now: Date.now, sleep: () => new Promise((resolve) => setTimeout(resolve, 500)) });
      guard();
      const candidate = await builder.build(lookStillRequest(build, publicLook(request.fields), reference));
      const after = await spriteReferencePack(request.folder, accepted?.baseSet ?? config.baseSet);
      guard();
      if (after.sha256 !== version) throw new Error("The reference pack changed during the render. Generate this look again.");
      const saved = await builder.save(candidate);
      guard();
      const frames = await animate(saved.path, saved.sha256);
      guard();
      if (accepted && request.label === "neutral") publishDerivedVisual(run, request.folder, visualRoot(accepted), set, request.fields,
        { ...saved, key: candidate.key, recipe: EDIT_RECIPE });
      request.apply(set, [...existing.filter((file) => file.label !== request.label), { label: request.label, path: saved.path }], frames);
    } catch (error) {
      if (!signal.aborted && !this.stopped && run.stillOwns() && request.accepts()) request.failed?.(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      builder.close(); run.release();
      if (this.active === builder) { this.active = null; this.activeRequest = null; this.controller = null; }
    }
  }
}
