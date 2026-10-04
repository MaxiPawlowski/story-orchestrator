import { beginRun, type RunGuard, type RunOwnership } from "@runtime/runToken";
import { checkPixels, pasteEdit, validateBox, type HeadBox, type PixelImage, type PixelQA } from "./pixels";
import { contentHash, editGraph, editInstruction, editKey, type EditKind, type EditModels } from "./recipes";

export interface SpriteBuildRequest {
  character: string;
  set: string;
  label: string;
  kind: EditKind;
  value: string;
  reference: string;
  box: HeadBox;
  models: EditModels;
  seed: number;
  steps: number;
  story?: string;
  member?: string;
}

export interface SpriteCandidate {
  request: SpriteBuildRequest;
  key: string;
  data: string;
  qa: PixelQA;
  seconds: number;
  inputs: { base: string; models: EditModels; kind: EditKind; value: string; seed: number; steps: number; box: HeadBox; story?: string; member?: string };
}

export interface BuilderDeps {
  ownership: RunOwnership;
  decode(src: string): Promise<PixelImage>;
  encode(image: PixelImage): string;
  crop(image: PixelImage, box: HeadBox): Promise<string>;
  resize(image: PixelImage, box: HeadBox): PixelImage;
  uploadReference(data: string, signal: AbortSignal): Promise<string>;
  render(graph: Record<string, unknown>, signal: AbortSignal): Promise<{ data: string; format: string }>;
  lease(request: SpriteBuildRequest, signal: AbortSignal): Promise<{ release(): Promise<void> }>;
  save(candidate: SpriteCandidate, expectedHash?: string): Promise<{ path: string; sha256: string }>;
}

export class SpriteBuilder {
  private controller: AbortController | null = null;
  private candidates = new Map<string, RunGuard>();

  constructor(private readonly deps: BuilderDeps) {}

  cancel(): void { this.controller?.abort(); }

  close(): void {
    this.cancel();
    for (const run of this.candidates.values()) run.release();
    this.candidates.clear();
  }

  async build(request: SpriteBuildRequest): Promise<SpriteCandidate> {
    if (this.controller) throw new Error("Finish or cancel the current sprite first.");
    if (!request.character || /[\\/]/.test(request.character) || !/^[a-z0-9_]{1,80}$/.test(request.set) || !/^[a-z0-9_]{1,80}$/.test(request.label)) {
      throw new Error("Choose a character folder and valid lowercase set and expression ids.");
    }
    if (!Number.isInteger(request.steps) || request.steps < 1 || request.steps > 100 || !Number.isInteger(request.seed) || request.seed < 0 || request.seed > 4294967295) {
      throw new Error("Steps must be 1–100, and the seed must be a whole number from 0 to 4294967295.");
    }
    if (request.kind === "look" && !request.value.trim()) throw new Error("Describe the visible change before generating a new look.");
    const controller = new AbortController();
    this.controller = controller;
    const run = beginRun(this.deps.ownership);
    const abort = () => controller.abort();
    run.signal.addEventListener("abort", abort, { once: true });
    let retained = false;
    let lease: { release(): Promise<void> } | null = null;
    const start = performance.now();
    const guard = () => {
      controller.signal.throwIfAborted();
      if (!run.stillOwns()) throw new Error("The story or draft changed. Build this sprite again for the current draft.");
    };
    try {
      guard();
      const base = await this.deps.decode(request.reference);
      const box = request.kind === "look" ? { x: 0, y: 0, width: base.width, height: base.height } : request.box;
      validateBox(base, box);
      if (!base.data.some((value, at) => at % 4 === 3 && value < 255) || !base.data.some((value, at) => at % 4 === 3 && value > 0)) {
        throw new Error("Choose a transparent reference sprite with a visible subject before generating expressions.");
      }
      const baseHash = base.sha256 ?? await contentHash(new Uint8Array(base.data));
      const inputs = { base: baseHash, models: request.models, kind: request.kind, value: request.value, seed: request.seed,
        steps: request.steps, box, story: request.story, member: request.member };
      const key = await editKey(inputs);
      const crop = await this.deps.crop(base, box);
      guard();
      lease = await this.deps.lease(request, controller.signal);
      guard();
      const reference = await this.deps.uploadReference(crop, controller.signal);
      guard();
      const result = await this.deps.render(editGraph({ models: request.models, steps: request.steps, seed: request.seed,
        reference, instruction: editInstruction(request.kind, request.value) }), controller.signal);
      const edit = await this.deps.decode(`data:image/${result.format};base64,${result.data}`);
      guard();
      const output = pasteEdit(base, this.deps.resize(edit, box), box, request.kind);
      const qa = checkPixels(base, output, box, ["blink", "talk", "talk2"].includes(request.kind));
      if (!qa.ok) throw new Error(qa.reasons.join(" "));
      const candidate = { request: { ...request, box: { ...request.box } }, inputs, key,
        data: this.deps.encode(output), qa, seconds: (performance.now() - start) / 1000 };
      this.candidates.get(key)?.release();
      this.candidates.set(key, run);
      retained = true;
      return candidate;
    } finally {
      try { if (lease) await lease.release(); }
      finally {
        run.signal.removeEventListener("abort", abort);
        if (!retained) run.release();
        if (this.controller === controller) this.controller = null;
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
