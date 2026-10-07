import { beginRun, type RunGuard, type RunOwnership } from "@runtime/runToken";
import { checkPixels, checkMouthCoverage, pasteEdit, validateBox, type HeadBox, type PixelImage, type PixelQA } from "./pixels";
import { contentHash, editGraph, editInstruction, editKey, renderKey, type EditKind, type EditModels } from "./recipes";
import type { AlphaRecipe } from "@services/stHost/media";
import { referenceProblems } from "./referencePack";
import { mouthRegion, validateRegion, type FrameRegion } from "./frameRegion";
import { RawEditCache } from "./rawCache";
import { validateBuildRequest } from "./buildRequest";

export interface BuildTimings { prepareMs: number; leaseMs: number; uploadMs: number; renderMs: number; decodeMs: number; compositeMs: number;
  referenceReleaseMs: number; leaseReleaseMs: number; totalMs: number; cacheHit: boolean; fingerprintMs?: number }

export interface SpriteBuildRequest {
  character: string;
  set: string;
  label: string;
  kind: EditKind;
  value: string;
  reference: string;
  referenceHash?: string;
  box: HeadBox;
  models: EditModels;
  seed: number;
  steps: number;
  story?: string;
  member?: string;
  cutout?: AlphaRecipe;
  resolution?: number;
  frameRegion?: FrameRegion;
}

export interface SpriteCandidate {
  request: SpriteBuildRequest;
  key: string;
  data: string;
  qa: PixelQA;
  seconds: number;
  timings?: BuildTimings;
  rawData?: string;
  referenceData?: string;
  inputs: { base: string; models: EditModels; kind: EditKind; value: string; seed: number; steps: number; box: HeadBox;
    story?: string; member?: string; cutout?: AlphaRecipe; resolution?: number; frameRegion?: FrameRegion };
}

export interface BuilderDeps {
  ownership: RunOwnership;
  decode(src: string): Promise<PixelImage>;
  encode(image: PixelImage): string;
  crop(image: PixelImage, box: HeadBox): Promise<string>;
  resize(image: PixelImage, box: HeadBox): PixelImage;
  uploadReference(data: string, signal: AbortSignal, scope?: { character: string; set: string; story?: string }): Promise<string>;
  releaseReference?(name: string): Promise<void>;
  render(graph: Record<string, unknown>, signal: AbortSignal): Promise<{ data: string; format: string }>;
  lease(request: SpriteBuildRequest, signal: AbortSignal): Promise<{ release(): Promise<void> }>;
  save(candidate: SpriteCandidate, expectedHash?: string): Promise<{ path: string; sha256: string }>;
}

export class SpriteBuilder {
  private controller: AbortController | null = null;
  private candidates = new Map<string, RunGuard>();
  private raw = new RawEditCache();

  constructor(private readonly deps: BuilderDeps) {}

  cancel(): void { this.controller?.abort(); }

  close(): void {
    this.cancel();
    for (const run of this.candidates.values()) run.release();
    this.candidates.clear();
    this.raw.clear();
  }

  async build(request: SpriteBuildRequest): Promise<SpriteCandidate> {
    if (this.controller) throw new Error("Finish or cancel the current sprite first.");
    const resolution = validateBuildRequest(request);
    const controller = new AbortController();
    this.controller = controller;
    const run = beginRun(this.deps.ownership);
    const abort = () => controller.abort();
    run.signal.addEventListener("abort", abort, { once: true });
    let retained = false;
    let lease: { release(): Promise<void> } | null = null;
    let reference: string | null = null;
    const start = performance.now();
    let candidate: SpriteCandidate | null = null;
    const timings: BuildTimings = { prepareMs: 0, leaseMs: 0, uploadMs: 0, renderMs: 0, decodeMs: 0, compositeMs: 0,
      referenceReleaseMs: 0, leaseReleaseMs: 0, totalMs: 0, cacheHit: false };
    const timed = async <T>(field: Exclude<keyof BuildTimings, "cacheHit">, work: () => Promise<T>): Promise<T> => {
      const began = performance.now();
      try { return await work(); } finally { timings[field] = performance.now() - began; }
    };
    const guard = () => {
      controller.signal.throwIfAborted();
      if (!run.stillOwns()) throw new Error("The story or draft changed. Build this sprite again for the current draft.");
    };
    try {
      guard();
      const base = await this.deps.decode(request.reference);
      const box = request.kind === "look" || request.kind === "base" ? { x: 0, y: 0, width: base.width, height: base.height } : request.box;
      validateBox(base, box);
      const region = ["talk", "talk2", "rest"].includes(request.kind) ? request.frameRegion ?? mouthRegion(box) : undefined;
      if (region) validateRegion(box, region);
      if (request.kind !== "base" && (!base.data.some((value, at) => at % 4 === 3 && value < 255) || !base.data.some((value, at) => at % 4 === 3 && value > 0))) {
        throw new Error("Choose a transparent reference sprite with a visible subject before generating expressions.");
      }
      const baseHash = base.sha256 ?? await contentHash(new Uint8Array(base.data));
      if (request.referenceHash && request.referenceHash !== baseHash) throw new Error("The reference sprite changed before the render. Read the pack again.");
      const inputs = { base: baseHash, models: request.models, kind: request.kind, value: request.value, seed: request.seed,
        steps: request.steps, box, resolution, ...(region ? { frameRegion: region } : {}), story: request.story, member: request.member, ...(request.cutout ? { cutout: request.cutout } : {}) };
      const key = await editKey(inputs);
      const crop = await this.deps.crop(base, box);
      const rawKey = await renderKey(inputs);
      timings.prepareMs = performance.now() - start;
      guard();
      let raw = this.raw.get(rawKey);
      timings.cacheHit = Boolean(raw);
      if (!raw) {
        lease = await timed("leaseMs", () => this.deps.lease({ ...request, resolution, box }, controller.signal));
        guard();
        reference = await timed("uploadMs", () => this.deps.uploadReference(crop, controller.signal, { character: request.character, set: request.set, story: request.story }));
        guard();
        const result = await timed("renderMs", () => this.deps.render(editGraph({ models: request.models, steps: request.steps, seed: request.seed,
          reference: reference as string, instruction: editInstruction(request.kind, request.value), cutout: request.cutout, resolution }), controller.signal));
        const image = await timed("decodeMs", () => this.deps.decode(`data:image/${result.format};base64,${result.data}`));
        guard();
        raw = { image, data: result.data };
        this.raw.put(rawKey, raw);
      }
      guard();
      const compositeStart = performance.now();
      const output = request.kind === "base" ? this.deps.resize(raw.image, box) : pasteEdit(base, this.deps.resize(raw.image, box), box, request.kind, region);
      const reasons = request.kind === "base" ? referenceProblems(output) : [];
      const qa = request.kind === "base" ? { ok: !reasons.length, reasons, changed: 0,
        alphaPixels: output.data.filter((value, at) => at % 4 === 3 && value <= 8).length, ringDrift: 0 }
        : checkPixels(base, output, box, ["blink", "talk", "talk2"].includes(request.kind));
      if (region) qa.reasons.push(...checkMouthCoverage(base, output, box, region, request.kind !== "rest"));
      qa.ok = qa.ok && !qa.reasons.length;
      if (!qa.ok) throw new Error(qa.reasons.join(" "));
      candidate = { request: { ...request, box: { ...request.box } }, inputs, key, timings, rawData: raw.data, referenceData: crop,
        data: this.deps.encode(output), qa, seconds: 0 };
      timings.compositeMs = performance.now() - compositeStart;
      this.candidates.get(key)?.release();
      this.candidates.set(key, run);
      retained = true;
      return candidate;
    } finally {
      try {
        try { if (reference) await timed("referenceReleaseMs", async () => this.deps.releaseReference?.(reference as string)); }
        finally { if (lease) await timed("leaseReleaseMs", () => (lease as { release(): Promise<void> }).release()); }
      }
      finally {
        run.signal.removeEventListener("abort", abort);
        if (!retained) run.release();
        if (this.controller === controller) this.controller = null;
        timings.totalMs = performance.now() - start;
        if (candidate) candidate.seconds = timings.totalMs / 1000;
      }
    }
  }

  async save(candidate: SpriteCandidate, expectedHash?: string): Promise<{ path: string; sha256: string }> {
    const run = this.candidates.get(candidate.key);
    if (!run?.stillOwns()) throw new Error("This preview belongs to an old story or draft. Generate it again before saving.");
    if (!candidate.qa.ok) throw new Error("A failed sprite cannot be saved.");
    return this.deps.save(candidate, expectedHash);
  }
}
