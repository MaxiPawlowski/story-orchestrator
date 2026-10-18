import { refuseDefaultCardArt } from "../cardArt";
import { beginRun, type RunGuard, type RunOwnership } from "@runtime/runToken";
import { stableStringify } from "@runtime/hash";
import { publicLook } from "@engine/cardFields";
import type { PoseEntry } from "@engine/poseSchema";
import type { AlphaRecipe, ComfyDiscovery, SpriteManifest, SpriteReferencePack } from "@services/stHost/media";
import type { SpriteSettings } from "../settings";
import { builderRender } from "../settings";
import { BASE_RECIPE, EDIT_RECIPE, POSE_RECIPE, POSE_FALLBACK_RECIPE, contentHash, qwenImageInput, type EditModels } from "../builder/recipes";
import type { SpriteBuilder, SpriteBuildRequest } from "../builder/builder";
import type { HeadBox, PixelImage } from "../builder/pixels";
import { bodyStamp, poseCacheKey, poseSet, type CachedBody, type LookLayers } from "./layers";
import type { AnimationFrames } from "../animation";
import { completeLookFrames } from "../builder/lookFrames";
import { retargetPose, retargetVersion, type Retarget } from "./skeleton";
import { headToHipRatio } from "./import";
import { shippedPoses } from "./library";
import { anySignal } from "@utils/signals";

export type HeadSource = "target" | "measured" | "none";
export interface BodyStamp extends CachedBody { story: string; member: string; version: number; head: HeadBox; headSource?: HeadSource; stamp?: string }
export interface BodyResult { set: string; files: Array<{ label: string; path: string }>; body: BodyStamp; frames?: AnimationFrames }
export interface BodyRequest {
  story: string; member: string; folder: string; label: string; pose: PoseEntry; layers: LookLayers; cardArt?: string; frames?: boolean;
  config: SpriteSettings["builders"][string]; accepts(): boolean; apply(result: BodyResult): void; failed(reason: string): void;
}
export interface BodyDeps {
  ownership: RunOwnership;
  builder(): Pick<SpriteBuilder, "build" | "save" | "cancel" | "close">;
  discover(signal: AbortSignal): Promise<ComfyDiscovery>;
  models(config: BodyRequest["config"], signal: AbortSignal): Promise<EditModels>;
  pack(folder: string, set: string): Promise<SpriteReferencePack>;
  manifest(folder: string, set: string): Promise<SpriteManifest | null>;
  decode(path: string): Promise<PixelImage>;
  wait(signal: AbortSignal, current: () => boolean): Promise<void>;
  proportions?(image: PixelImage, discovery: ComfyDiscovery, signal: AbortSignal): Promise<PoseEntry["keypoints"] | undefined>;
  head?(image: PixelImage, discovery: ComfyDiscovery, signal: AbortSignal): Promise<PoseEntry["keypoints"] | null | undefined>;
  lineage?(folder: string, signal: AbortSignal): Promise<{ root: string; baseSet: string; current(): boolean } | undefined>;
  publishLook?(run: Pick<RunGuard, "stillOwns">, folder: string, root: string, set: string, fields: Record<string, string>,
    base: { path: string; sha256: string; key: string; recipe: { id: string; version: number } }): void;
}

export function alphaBox(image: PixelImage): HeadBox {
  let left = image.width, right = -1, top = image.height, bottom = -1;
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) if (image.data[(y * image.width + x) * 4 + 3] > 16) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error("The look base has no visible subject.");
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

let standing: PoseEntry["keypoints"] | undefined;
const standingReference = (): PoseEntry["keypoints"] | undefined => {
  standing ??= shippedPoses().find((pose) => pose.id === "stand_relaxed")?.keypoints;
  return standing;
};

export function poseHead(keypoints: PoseEntry["keypoints"], fallback: HeadBox): HeadBox {
  const head = [0, 14, 15, 16, 17].flatMap((at) => keypoints.points[at] ? [keypoints.points[at] as [number, number]] : []);
  if (!head.length) return fallback;
  const minX = Math.min(...head.map((p) => p[0])), maxX = Math.max(...head.map((p) => p[0]));
  const minY = Math.min(...head.map((p) => p[1])), maxY = Math.max(...head.map((p) => p[1]));
  const span = Math.max(16, maxX - minX, maxY - minY), x = Math.max(0, Math.floor(minX - span * 0.5)), y = Math.max(0, Math.floor(minY - span * 0.65));
  return { x, y, width: Math.min(keypoints.canvas[0] - x, Math.ceil(span * 2)), height: Math.min(keypoints.canvas[1] - y, Math.ceil(span * 2.2)) };
}

export class PoseBodies {
  private closed = false;
  private running = false;
  private active: ReturnType<BodyDeps["builder"]> | null = null;
  private activeRequest: BodyRequest | null = null;
  private controller: AbortController | null = null;
  private queue = new Map<string, BodyRequest>();
  private frames = new Map<string, BodyRequest>();
  private attempted = new Set<string>();
  private proportions = new Map<string, PoseEntry["keypoints"] | undefined>();
  private heads = new Map<string, HeadBox | null | undefined>();
  constructor(private readonly deps: BodyDeps) {}
  private cancel(): void { this.controller?.abort(); this.active?.cancel(); }
  close(): void { this.closed = true; this.queue.clear(); this.frames.clear(); this.cancel(); }
  revalidate(): void {
    if (this.activeRequest && !this.activeRequest.accepts()) this.cancel();
    for (const queue of [this.queue, this.frames]) for (const [key, request] of queue) if (!request.accepts()) queue.delete(key);
  }
  request(request: BodyRequest): void {
    if (this.closed || !request.accepts()) return;
    this.revalidate();
    const key = stableStringify([request.story, request.member, request.label, request.pose, request.layers, request.config]);
    if (this.attempted.has(key)) return;
    this.queue.set(key, request);
    void this.drain();
  }
  private async drain(): Promise<void> {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      while ((this.queue.size || this.frames.size) && !this.closed) {
        const frames = !this.queue.size, queue = frames ? this.frames : this.queue;
        const [key, request] = queue.entries().next().value as [string, BodyRequest];
        queue.delete(key);
        if (!request.accepts()) continue;
        this.attempted.add(key);
        if (this.attempted.size > 256) this.attempted.delete(this.attempted.values().next().value as string);
        const result = await this.render(frames ? request : { ...request, frames: false });
        if (!frames && result && request.frames !== false && !this.closed && request.accepts()) this.frames.set(key, request);
      }
    } finally { this.running = false; }
  }
  private async measureHead(request: BodyRequest, posed: { path: string; sha256: string }, body: BodyStamp, discovery: ComfyDiscovery, signal: AbortSignal, guard: () => void): Promise<boolean> {
    let blocked = false;
    if (request.pose.id !== "stand_relaxed" && this.deps.head) {
      if (!this.heads.has(posed.sha256)) {
        const found = await this.deps.head(await this.deps.decode(posed.path), discovery, signal);
        guard();
        const box = found && [0, 14, 15, 16, 17].some((at) => found.points[at]) ? poseHead(found, body.head) : found === null ? null : undefined;
        this.heads.set(posed.sha256, box);
        if (this.heads.size > 256) this.heads.delete(this.heads.keys().next().value as string);
      }
      const measuredHead = this.heads.get(posed.sha256);
      if (measuredHead) { body.head = measuredHead; body.headSource = "measured"; }
      else if (measuredHead === null) { blocked = true; body.headSource = "none"; }
    }
    body.headSource ??= "target";
    return blocked;
  }
  async render(request: BodyRequest): Promise<BodyResult | null> {
    if (this.closed || !request.accepts()) return null;
    const run = beginRun(this.deps.ownership), builder = this.deps.builder();
    const controller = new AbortController(), signal = anySignal([run.signal, controller.signal]);
    this.controller = controller;
    this.active = builder; this.activeRequest = request;
    let lineage: Awaited<ReturnType<NonNullable<BodyDeps["lineage"]>>> | undefined;
    const guard = () => {
      signal.throwIfAborted();
      if (this.closed || !run.stillOwns() || !request.accepts()) throw new Error("The stage changed before this body was ready.");
      if (lineage && !lineage.current()) throw new Error("The accepted source changed before this body was ready.");
    };
    const checkedPack = async (set: string, label: string) => {
      const manifest = await this.deps.manifest(request.folder, set);
      guard();
      const row = manifest?.labels[label];
      if (row?.status !== "complete") return null;
      const pack = await this.deps.pack(request.folder, set);
      guard();
      const file = pack.files.find((file) => file.label === label);
      if (!file || file.sha256 !== row.sha256) throw new Error("A cached body changed outside Story Orchestrator.");
      return file;
    };
    try {
      guard();
      lineage = await this.deps.lineage?.(request.folder, signal);
      guard();
      const discovery = await this.deps.discover(signal);
      guard();
      const models = await this.deps.models(request.config, signal);
      guard();
      const source = await this.deps.pack(request.folder, lineage?.baseSet ?? request.config.baseSet);
      guard();
      const neutral = source.files.find((file) => file.label === "neutral");
      if (!neutral) throw new Error("The reference pack needs a neutral look base.");
      const cutout: AlphaRecipe | undefined = discovery.alpha?.find((recipe) => recipe.files.length > 0);
      const render = builderRender(request.config), seedOf = (key: string) => Number.parseInt(key.slice(0, 8), 16);
      const save = async (build: SpriteBuildRequest) => {
        await this.deps.wait(signal, () => !signal.aborted && !this.closed && run.stillOwns() && request.accepts());
        guard();
        const candidate = await builder.build(build);
        guard();
        const saved = await builder.save(candidate);
        guard();
        return saved;
      };
      const common = { character: request.folder, models, ...render, story: request.story, member: request.member, ...(lineage ? { visualRoot: lineage.root } : {}) };
      let base = neutral;
      if (Object.keys(request.layers.base).length) {
        if (!cutout) throw new Error("Install a background-removal setup before rendering a new look base.");
        const reference = request.layers.rebase ? request.cardArt : neutral.path;
        if (!reference) throw new Error("A rebase needs the character card art.");
        const image = await this.deps.decode(reference);
        guard();
        await refuseDefaultCardArt(image, this.deps.decode, request.layers.rebase);
        guard();
        const sourceHash = image.sha256 ?? await contentHash(new Uint8Array(image.data));
        const key = await contentHash(new TextEncoder().encode(stableStringify({ recipe: BASE_RECIPE, story: request.story, member: request.member, fields: request.layers.base,
          rebase: request.layers.rebase, base: sourceHash, models, render, cutout, ...(lineage ? { visualRoot: lineage.root } : {}) })));
        const set = `look_${key.slice(0, 8)}`;
        const cached = await checkedPack(set, "neutral");
        if (cached) base = cached;
        else {
          const saved = await save({ ...common, set, label: "neutral", kind: "base", value: publicLook(request.layers.base), reference, referenceHash: sourceHash,
            box: { x: 0, y: 0, width: image.width, height: image.height }, seed: seedOf(key), cutout });
          base = { label: "neutral", ...saved, width: image.width, height: image.height };
        }
        guard();
        if (lineage) this.deps.publishLook?.(run, request.folder, lineage.root, set, request.layers.base,
          { path: base.path, sha256: base.sha256, key, recipe: BASE_RECIPE });
      }
      const image = await this.deps.decode(base.path);
      guard();
      if (!this.proportions.has(base.sha256)) {
        const measured = await this.deps.proportions?.(image, discovery, signal);
        guard(); this.proportions.set(base.sha256, measured);
      }
      const member = this.proportions.get(base.sha256);
      const target: Retarget = { canvas: [image.width, image.height], box: alphaBox(image), headToHip: member ? headToHipRatio(member) : undefined,
        member: member ? { ...member, points: member.points.map((point) => point ? [Math.round(point[0]), Math.round(point[1])] : null) } : undefined, version: retargetVersion(request.pose) };
      const keypoints = retargetPose(request.pose, target, standingReference());
      const look = stableStringify(request.layers.base), stamp = bodyStamp(request.pose, request.layers, request.config, lineage?.root);
      const secondReference = qwenImageInput(discovery, "image_2");
      const bodyFor = async (route: "p2" | "p3") => {
        const bodyKey = await poseCacheKey({ story: request.story, member: request.member, fields: request.layers.base, pose: request.pose, retarget: target,
          recipe: route === "p2" ? POSE_RECIPE : POSE_FALLBACK_RECIPE, models, base: base.sha256, steps: render.steps, resolution: render.resolution,
          cutout, secondReference: route === "p2" || secondReference, ...(lineage ? { visualRoot: lineage.root } : {}) });
        const set = poseSet(bodyKey);
        const body: BodyStamp = { set, look, pose: request.pose.id, tags: request.pose.tags, version: request.pose.version, story: request.story, member: request.member,
          ...(lineage ? { visualRoot: lineage.root } : {}),
          head: request.pose.id === "stand_relaxed" ? request.config.box : poseHead(keypoints, request.config.box),
          stamp: bodyStamp(request.pose, { ...request.layers, face: {}, decal: {}, regions: {} }, request.config, lineage?.root) };
        let posed = await checkedPack(set, "neutral");
        if (!posed && request.pose.id === "stand_relaxed") posed = base;
        if (!posed) {
          if (!cutout) throw new Error("Install a background-removal setup before rendering a pose body.");
          const saved = await save({ ...common, set, label: "neutral", kind: "pose", value: request.pose.text, reference: base.path, referenceHash: base.sha256,
            box: request.config.box, seed: seedOf(bodyKey), cutout, pose: keypoints, poseRoute: route,
            poseSecondReference: secondReference, body });
          posed = { label: "neutral", ...saved, width: image.width, height: image.height };
        }
        return { bodyKey, body, posed };
      };
      let resolved;
      try { resolved = await bodyFor("p2"); }
      catch (error) {
        guard();
        if (!/image_2|second image|unsupported|node|recipe|pose|framing|alpha|blank/i.test(error instanceof Error ? error.message : String(error))) throw error;
        resolved = await bodyFor("p3");
      }
      const { bodyKey, body, posed } = resolved;
      const expressionBlocked = await this.measureHead(request, posed, body, discovery, signal, guard);
      const faceKey = await contentHash(new TextEncoder().encode(stableStringify({ bodyKey, face: request.layers.face, head: body.head, recipe: EDIT_RECIPE })));
      let finalSet = body.set, file: { path: string; sha256: string } = posed;
      if (!expressionBlocked && (request.label !== "neutral" || Object.keys(request.layers.face).length)) {
        finalSet = poseSet(faceKey);
        file = await checkedPack(finalSet, request.label) ?? await save({ ...common, set: finalSet, label: request.label, kind: "expression",
          value: `facial expression: ${request.label}${Object.keys(request.layers.face).length ? `; ${publicLook(request.layers.face)}` : ""}`,
          reference: posed.path, referenceHash: posed.sha256, box: body.head, seed: seedOf(faceKey), body: { ...body, set: finalSet,
            stamp: Object.keys(request.layers.decal).length ? undefined : stamp } });
      }
      for (const [field, value] of Object.entries(request.layers.decal).sort(([a], [b]) => a.localeCompare(b))) {
        const region = request.layers.regions[field];
        if (!region && expressionBlocked) continue;
        const box = region ? { x: Math.round(region.x * image.width), y: Math.round(region.y * image.height), width: Math.max(1, Math.round(region.width * image.width)),
          height: Math.max(1, Math.round(region.height * image.height)) } : body.head;
        const key = await contentHash(new TextEncoder().encode(stableStringify([file.sha256, field, value, box, EDIT_RECIPE])));
        finalSet = poseSet(key);
        file = await checkedPack(finalSet, request.label) ?? await save({ ...common, set: finalSet, label: request.label, kind: "decal", value: `${field}: ${value}`,
          reference: file.path, referenceHash: file.sha256, box, seed: seedOf(key), body: { ...body, set: finalSet,
            stamp: field === Object.keys(request.layers.decal).sort().at(-1) ? stamp : undefined } });
      }
      guard();
      const result: BodyResult = { set: finalSet, files: [{ label: request.label, path: file.path }], body: { ...body, set: finalSet, stamp } };
      request.apply(result);
      if (request.frames !== false && !expressionBlocked) {
        const frames = await completeLookFrames({ guard, wait: () => this.deps.wait(signal, () => !signal.aborted && !this.closed && run.stillOwns() && request.accepts()),
          cached: async (kind) => (await checkedPack(`anim-${finalSet}`, `${request.label}.${kind}`))?.path ?? null,
          render: async (kind) => (await save({ ...common, set: finalSet, label: request.label, kind, value: request.label, reference: file.path,
            referenceHash: file.sha256, box: body.head, seed: (seedOf(faceKey) + (kind === "blink" ? 1 : 2)) >>> 0, body: result.body })).path });
        guard(); result.frames = frames; request.apply(result);
      }
      return result;
    } catch (error) {
      if (!signal.aborted && !this.closed && run.stillOwns() && request.accepts()) request.failed(error instanceof Error ? error.message : String(error));
      return null;
    } finally { builder.close(); run.release(); if (this.active === builder) { this.active = null; this.activeRequest = null; this.controller = null; } }
  }
}
