import { comfyDiscover, comfyFingerprint, spriteManifest } from "@services/stHost/media";
import { spriteList } from "@services/stHost/sprites";
import { beginRun } from "@runtime/runToken";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { createSpriteBuilder } from "./host";
import { contentHash, EDIT_RECIPE, recipeProblems } from "./recipes";
import { publicLook } from "@engine/cardFields";
import { log } from "@utils/log";

export interface LookRequest {
  folder: string; member: string; label: string; fields: Record<string, string>;
  accepts(): boolean; apply(set: string, files: Array<{ label: string; path: string }>): void;
}

export class OnDemandLooks {
  private stopped = false;
  private active: ReturnType<typeof createSpriteBuilder> | null = null;
  private activeRequest: LookRequest | null = null;
  private queue = new Map<string, LookRequest>();
  private running = false;
  private attempted = new Set<string>();

  constructor(private readonly manager: RuntimeManager) {}

  close(): void { this.stopped = true; this.queue.clear(); this.active?.close(); }

  revalidate(): void {
    if (this.activeRequest && !this.activeRequest.accepts()) this.active?.cancel();
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
    try {
      while (this.queue.size && !this.stopped) {
        const [key, request] = this.queue.entries().next().value as [string, LookRequest];
        this.queue.delete(key);
        if (!request.accepts()) continue;
        this.attempted.add(key);
        if (this.attempted.size > 200) this.attempted.delete(this.attempted.values().next().value as string);
        await this.edit(request).then(() => this.attempted.delete(key)).catch((error) => log.warn("A changed-look sprite was not generated", error));
      }
    } finally { this.running = false; }
  }

  private async edit(request: LookRequest): Promise<void> {
    const run = beginRun(this.manager.getOwnership());
    const builder = createSpriteBuilder(this.manager.getOwnership());
    this.active = builder;
    this.activeRequest = request;
    const guard = () => {
      if (this.stopped || !run.stillOwns() || !request.accepts()) throw new Error("The look changed before this sprite was ready.");
    };
    try {
      const settings = this.manager.getGlobalSettings().sprites;
      const config = settings.builders[request.folder];
      if (!config || !settings.onDemand) throw new Error("Build and save an expression pack in Studio before enabling on-demand look edits.");
      const story = this.manager.getSnapshot().storyId;
      if (!story) return;
      const discovery = await comfyDiscover(run.signal);
      const problems = recipeProblems(discovery, config.models);
      if (problems.length) throw new Error(problems.join(" "));
      const [diffusion, encoder, vae] = await Promise.all([
        comfyFingerprint("diffusionModels", config.models.diffusion, run.signal),
        comfyFingerprint("textEncoders", config.models.encoder, run.signal),
        comfyFingerprint("vaes", config.models.vae, run.signal),
      ]);
      const base = await spriteManifest(request.folder, config.baseSet);
      if (!base) throw new Error("The base pack has no generated-asset manifest.");
      const version = await contentHash(new TextEncoder().encode(JSON.stringify(base)));
      const key = await contentHash(new TextEncoder().encode(JSON.stringify({ story, member: request.member,
        fields: Object.entries(request.fields).sort(([a], [b]) => a.localeCompare(b)), version, models: { diffusion, encoder, vae }, recipe: EDIT_RECIPE })));
      const set = `look_${key.slice(0, 8)}`;
      const existing = await spriteList(`${request.folder}/${set}`);
      const cached = await spriteManifest(request.folder, set);
      guard();
      if (cached?.labels[request.label]?.status === "complete") { request.apply(set, existing); return; }
      const sources = await spriteList(`${request.folder}/${config.baseSet}`);
      const reference = sources.find((file) => file.label === request.label)?.path ?? sources.find((file) => file.label === "neutral")?.path;
      if (!reference) throw new Error("The base pack has no reference for this expression.");
      guard();
      const candidate = await builder.build({ character: request.folder, set, label: request.label, kind: "look", value: publicLook(request.fields), reference, box: config.box,
        models: { diffusion, encoder, vae }, seed: Number.parseInt(key.slice(0, 8), 16), steps: config.steps, story, member: request.member });
      guard();
      const saved = await builder.save(candidate);
      guard();
      request.apply(set, [...existing.filter((file) => file.label !== request.label), { label: request.label, path: saved.path }]);
    } finally {
      builder.close(); run.release();
      if (this.active === builder) { this.active = null; this.activeRequest = null; }
    }
  }
}
