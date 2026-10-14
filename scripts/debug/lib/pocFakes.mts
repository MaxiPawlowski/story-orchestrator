import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

export interface Rgba { width: number; height: number; data: Uint8Array }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, body: Uint8Array): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), Buffer.from(body)])), 0);
  return Buffer.concat([head, Buffer.from(body), crc]);
};

export function encodePng(image: Rgba): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) Buffer.from(image.data.buffer, image.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]);
}

export function decodePng(bytes: Uint8Array): Rgba {
  const buffer = Buffer.from(bytes);
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8, width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8), body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; colour = body[9]; interlace = body[12]; }
    else if (type === 'PLTE') palette = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, interlace ${interlace})`);
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colour];
  if (!channels) throw new Error(`unsupported PNG colour type ${colour}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, out = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)], line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? line[x - channels] : 0, b = previous[x], c = x >= channels ? previous[x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const add = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      line[x] = (line[x] + add) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4, i = x * channels;
      if (colour === 6) { out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = line[i + 3]; }
      else if (colour === 2) { out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = 255; }
      else if (colour === 3 && palette) { const at = line[i] * 3; out[o] = palette[at]; out[o + 1] = palette[at + 1]; out[o + 2] = palette[at + 2]; out[o + 3] = 255; }
      else if (colour === 4) { out[o] = out[o + 1] = out[o + 2] = line[i]; out[o + 3] = line[i + 1]; }
      else { out[o] = out[o + 1] = out[o + 2] = line[i]; out[o + 3] = 255; }
    }
    previous = line;
  }
  return { width, height, data: out };
}

export const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

export function figure(width: number, height: number, seed = 0): Rgba {
  const data = new Uint8Array(width * height * 4), tint = (seed * 37) % 80;
  const paint = (x: number, y: number, r: number, g: number, b: number) => {
    const o = (y * width + x) * 4, n = ((x * 73856093) ^ (y * 19349663)) % 7;
    data[o] = Math.min(255, r + n); data[o + 1] = Math.min(255, g + n); data[o + 2] = Math.min(255, b + n); data[o + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const u = x / width, v = y / height;
    if (inEllipse(u, v, 0.5, 0.62, 0.17, 0.3)) paint(x, y, 60 + tint, 100, 150);
    if (u > 0.42 && u < 0.58 && v > 0.85 && v < 0.97) paint(x, y, 50, 50, 70);
    if (inEllipse(u, v, 0.5, 0.3, 0.035, 0.04)) paint(x, y, 230, 196, 170);
    if (inEllipse(u, v, 0.5, 0.17, 0.11, 0.1)) paint(x, y, 236, 200, 172);
    if (inEllipse(u, v, 0.5, 0.12, 0.12, 0.07) && v < 0.13) paint(x, y, 90 + tint, 56, 40);
    if (inEllipse(u, v, 0.46, 0.165, 0.014, 0.008) || inEllipse(u, v, 0.54, 0.165, 0.014, 0.008)) paint(x, y, 30, 40, 70);
    if (inEllipse(u, v, 0.5, 0.215, 0.025, 0.005)) paint(x, y, 168, 70, 78);
    if (inEllipse(u, v, 0.5, 0.19, 0.006, 0.008)) paint(x, y, 214, 172, 146);
  }
  return { width, height, data };
}

export function editPatch(image: Rgba, strength = 30): Rgba {
  const data = new Uint8Array(image.data);
  const patch = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = Math.floor(image.height * y0); y < Math.ceil(image.height * y1); y += 1) for (let x = Math.floor(image.width * x0); x < Math.ceil(image.width * x1); x += 1) {
      const o = (y * image.width + x) * 4;
      if (data[o + 3] < 240) continue;
      data[o] = Math.min(255, data[o] + strength); data[o + 2] = Math.max(0, data[o + 2] - strength);
    }
  };
  patch(0.35, 0.65, 0.3, 0.45);
  patch(0.42, 0.58, 0.7, 0.78);
  return { width: image.width, height: image.height, data };
}

export function bodyPose(width: number, height: number) {
  const p = (u: number, v: number) => [u * width, v * height, 1];
  const points = [p(0.5, 0.17), p(0.5, 0.32), p(0.38, 0.34), p(0.34, 0.5), p(0.33, 0.64), p(0.62, 0.34), p(0.66, 0.5), p(0.67, 0.64),
    p(0.44, 0.62), p(0.44, 0.78), p(0.44, 0.95), p(0.56, 0.62), p(0.56, 0.78), p(0.56, 0.95), p(0.47, 0.16), p(0.53, 0.16), p(0.44, 0.17), p(0.56, 0.17)];
  return [{ people: [{ pose_keypoints_2d: points.flat() }], canvas_width: width, canvas_height: height }];
}

export function syntheticLandmarks(width: number, height: number) {
  const p = (u: number, v: number) => [Math.round(u * width * 10) / 10, Math.round(v * height * 10) / 10];
  const eye = (cx: number) => [[-0.06, 0], [-0.035, -0.02], [0, -0.026], [0.035, -0.02], [0.06, 0], [0.035, 0.02], [0, 0.026], [-0.035, 0.02]].map(([dx, dy]) => p(cx + dx, 0.36 + dy));
  return { version: 1, image: { width, height }, face: { cx: width * 0.5, cy: height * 0.38, rx: width * 0.28, ry: height * 0.24 },
    eyes: [eye(0.39), eye(0.61)], brows: [p(0.39, 0.3), p(0.61, 0.3)], nose: p(0.5, 0.44), mouth: { left: p(0.44, 0.52), right: p(0.56, 0.52), top: p(0.5, 0.505), bottom: p(0.5, 0.535) },
    chin: p(0.5, 0.6), neck: p(0.5, 0.68), shoulders: [p(0.25, 0.85), p(0.75, 0.85)] };
}

export interface FakeReply { status: number; json?: unknown; body?: Buffer; contentType?: string }

interface Stored { bytes: Buffer; sha256: string; key: string; recipe: unknown; qa: unknown; inputs: unknown; createdAt: string; status: 'complete' }

export class FakeMedia {
  readonly references = new Map<string, Buffer>();
  readonly jobs = new Map<string, { status: string; result: { data: string; format: string; pose?: unknown } | null; graph: Record<string, any> }>();
  readonly sets = new Map<string, Map<string, Map<string, Stored>>>();
  readonly calls: Array<{ at: string; method: string; path: string }> = [];
  private counter = 0;
  private readonly owned: (character: string) => boolean;
  private readonly models: { diffusion: string; encoder: string; vae: string };
  constructor(owned: (character: string) => boolean, models = { diffusion: 'dry_edit.safetensors', encoder: 'dry_encoder.safetensors', vae: 'dry_vae.safetensors' }) {
    this.owned = owned;
    this.models = models;
  }

  discover() {
    const nodes = Object.fromEntries(['LoadImage', 'UNETLoader', 'QwenImage21Cache', 'CLIPLoader', 'VAELoader', 'TextEncodeQwenImage21', 'KSampler', 'VAEDecode', 'SaveImage',
      'PreviewImage', 'BiRefNetRMBG', 'RMBG', 'DWPreprocessor', 'ImageScale', 'ImageScaleBy', 'ImageCompositeMasked', 'EmptyLatentImage', 'VAEEncode', 'CheckpointLoaderSimple',
      'CLIPTextEncode', 'LoraLoader', 'UpscaleModelLoader', 'ImageUpscaleWithModel', 'SamplerCustomAdvanced', 'BasicGuider', 'KSamplerSelect', 'ManualSigmas', 'RandomNoise',
      'ModelSamplingAuraFlow', 'TextEncodeQwenImageEditPlus', 'FluxKontextMultiReferenceLatentMethod', 'ReferenceLatent', 'ImageStitch', 'JoinImageWithAlpha', 'SplitImageWithAlpha'].map((node) => [node, { input: { required: {}, ...(node === 'TextEncodeQwenImage21' ? { optional: { 'images.image_1': ['IMAGE'], 'images.image_2': ['IMAGE'] } } : {}) } }]));
    const file = (name: string) => ({ name, sha256: sha256(name), size: 1 });
    return { nodes, embeddings: [], checkpoints: ['waiIllustriousSDXL_dry.safetensors'], diffusionModels: [this.models.diffusion], textEncoders: [this.models.encoder], vaes: [this.models.vae],
      loras: [], upscalers: ['dry_anime_upscale.pth'], alpha: [{ id: 'dry_alpha', node: 'BiRefNetRMBG', model: 'BiRefNet_dry', files: [file('BiRefNet/dry.safetensors')] }] };
  }

  private render(graph: Record<string, any>) {
    const nodes = Object.values(graph) as Array<{ class_type?: string; inputs?: Record<string, unknown> }>;
    const loads = nodes.filter((node) => node.class_type === 'LoadImage').map((node) => this.references.get(String(node.inputs?.image ?? ''))).filter((bytes): bytes is Buffer => Boolean(bytes));
    const cutout = nodes.some((node) => /RMBG/.test(String(node.class_type)));
    const latent = nodes.find((node) => node.class_type === 'EmptyLatentImage')?.inputs;
    const first = loads[0] ? decodePng(loads[0]) : null;
    const output = first && !cutout ? editPatch(first) : figure(Number(latent?.width ?? first?.width ?? 832), Number(latent?.height ?? first?.height ?? 1216), this.counter);
    const pose = nodes.some((node) => node.class_type === 'DWPreprocessor') ? bodyPose(output.width, output.height) : undefined;
    return { data: encodePng(output).toString('base64'), format: 'png', ...(pose ? { pose } : {}) };
  }

  private list(character: string) {
    return [...(this.sets.get(character)?.entries() ?? [])].map(([set, labels]) => ({ owner: 'story-orchestrator', version: 1, character, set,
      labels: Object.fromEntries([...labels.entries()].map(([label, row]) => [label, { key: row.key, sha256: row.sha256, recipe: row.recipe, qa: row.qa, inputs: row.inputs, createdAt: row.createdAt, status: row.status }])) }));
  }

  file(path: string): FakeReply | null {
    const match = /^\/characters\/([^/]+)\/([^/]+)\/([^/?]+)\.png$/.exec(path.split('?')[0]);
    if (!match) return null;
    const [character, set, label] = match.slice(1).map(decodeURIComponent);
    const row = this.sets.get(character)?.get(set)?.get(label);
    return row ? { status: 200, body: row.bytes, contentType: 'image/png' } : null;
  }

  spriteListing(name: string): Array<{ label: string; path: string }> {
    const [character, set] = name.split('/');
    if (!set) return [];
    return [...(this.sets.get(character)?.get(set)?.entries() ?? [])].map(([label, row]) => ({ label, path: `/characters/${encodeURIComponent(character)}/${set}/${label}.png?t=${row.sha256.slice(0, 12)}` }));
  }

  inventory() {
    const rows: unknown[] = [];
    for (const [character, sets] of this.sets) for (const [set, labels] of sets) for (const [label, row] of labels) {
      rows.push({ character, set, label, sha256: row.sha256, actualHash: row.sha256, story: (row.inputs as any)?.story ?? null });
    }
    return { trusted: true, rows, references: [...this.references.entries()].map(([name, bytes]) => ({ name, unused: true, sha256: sha256(bytes), set: null, character: null, story: null })) };
  }

  handle(method: string, path: string, body: any): FakeReply {
    this.calls.push({ at: new Date().toISOString(), method, path });
    const ok = (json: unknown): FakeReply => ({ status: 200, json });
    if (path === '/status') return ok({ ready: true, comfyUrl: 'dry://fake-comfy', comfyUrlFrom: 'dry', fingerprints: ['diffusionModels', 'textEncoders', 'vaes', 'backgroundModels'] });
    if (path === '/discover') return ok(this.discover());
    if (path === '/fingerprint') return ok({ name: body.name, sha256: sha256(String(body.name)), size: 1 });
    if (path === '/reference') {
      const data = String(body.data ?? '').replace(/^data:image\/png;base64,/, '');
      const name = `so-dry-${++this.counter}.png`;
      this.references.set(name, Buffer.from(data, 'base64'));
      return ok({ name });
    }
    if (path === '/reference/release') { this.references.delete(String(body.name)); return ok({ released: true, prune: { removed: [String(body.name)], errors: [] } }); }
    if (path === '/prune') return ok({ removed: [], errors: [] });
    if (path === '/queue') return ok({ queue_running: [], queue_pending: [] });
    if (path === '/jobs' && method === 'POST') {
      const id = String(body.id);
      this.counter += 1;
      this.jobs.set(id, { status: 'complete', result: this.render(body.graph ?? {}), graph: body.graph ?? {} });
      return ok({ id, status: 'complete' });
    }
    const job = /^\/jobs\/([^/]+)(\/result|\/cancel)?$/.exec(path);
    if (job) {
      const row = this.jobs.get(job[1]);
      if (!row) return { status: 404, json: { error: 'no such job' } };
      if (job[2] === '/cancel') { row.status = row.status === 'complete' ? row.status : 'cancelled'; return ok({ status: row.status }); }
      if (job[2] === '/result') return row.result ? ok(row.result) : { status: 409, json: { error: 'not complete' } };
      return ok({ id: job[1], status: row.status });
    }
    if (path === '/sprites/save') {
      const character = String(body.character), set = String(body.set), label = String(body.label);
      if (!this.owned(character)) return { status: 400, json: { error: `dry fake refuses a sprite for an unowned character: ${character}` } };
      const bytes = Buffer.from(String(body.data), 'base64'), hash = sha256(bytes);
      const labels = (this.sets.get(character) ?? this.sets.set(character, new Map()).get(character)!);
      const rows = labels.get(set) ?? labels.set(set, new Map()).get(set)!;
      const existing = rows.get(label);
      if (existing && existing.sha256 !== hash && body.expectedHash !== existing.sha256) return { status: 400, json: { error: 'Confirm replacing this generated sprite after reviewing it.' } };
      rows.set(label, { bytes, sha256: hash, key: String(body.key), recipe: body.recipe, qa: body.qa, inputs: body.inputs, createdAt: new Date().toISOString(), status: 'complete' });
      return ok({ path: `/characters/${encodeURIComponent(character)}/${set}/${label}.png?t=${hash.slice(0, 12)}`, sha256: hash, manifest: this.list(character).find((row) => row.set === set) });
    }
    if (path === '/sprites/read') return ok(this.list(String(body.character)).find((row) => row.set === body.set) ?? null);
    if (path === '/sprites/list') return ok(this.list(String(body.character)));
    if (path === '/sprites/inventory') return ok(this.inventory());
    if (path === '/sprites/reference-sets') return ok(['', ...[...(this.sets.get(String(body.character))?.keys() ?? [])].filter((set) => /^[a-z0-9_]{1,80}$/.test(set)).sort()]);
    if (path === '/sprites/reference-pack') {
      const rows = this.sets.get(String(body.character))?.get(String(body.set));
      const files = [...(rows?.entries() ?? [])].map(([label, row]) => {
        const image = decodePng(row.bytes);
        return { label, path: `/characters/${encodeURIComponent(String(body.character))}/${body.set}/${label}.png`, sha256: row.sha256, width: image.width, height: image.height };
      });
      return ok({ character: body.character, set: body.set, sha256: sha256(JSON.stringify(files)), files });
    }
    if (path === '/sprites/delete') {
      const rows = this.sets.get(String(body.character))?.get(String(body.set));
      const row = rows?.get(String(body.label));
      if (!row || row.sha256 !== body.expectedHash) return { status: 400, json: { error: 'This sprite is not an owned file at the confirmed version.' } };
      rows!.delete(String(body.label));
      return ok({ deleted: true });
    }
    if (path === '/sprites/remove-story') {
      const removed = { sets: [] as string[], labels: [] as string[] };
      for (const [character, sets] of this.sets) for (const [set, labels] of sets) for (const [label, row] of [...labels]) {
        if ((row.inputs as any)?.story === body.story) { labels.delete(label); removed.labels.push(`${character}/${set}/${label}`); }
      }
      return ok(removed);
    }
    if (path === '/landmarks') return ok({ ok: false, reason: 'unavailable' });
    return { status: 404, json: { error: `dry fake media plugin has no route ${method} ${path}` } };
  }

  ownedFiles(): number {
    let count = 0;
    for (const sets of this.sets.values()) for (const labels of sets.values()) count += labels.size;
    return count;
  }

  clear(): void { this.sets.clear(); this.references.clear(); this.jobs.clear(); }
}

export function sseStream(text: string, chunks = 12): string {
  const parts: string[] = [];
  const size = Math.max(1, Math.ceil(text.length / chunks));
  for (let at = 0; at < text.length; at += size) parts.push(`data: ${JSON.stringify({ choices: [{ text: text.slice(at, at + size), index: 0, finish_reason: null }], content: text.slice(at, at + size) })}\n\n`);
  parts.push(`data: ${JSON.stringify({ choices: [{ text: '', index: 0, finish_reason: 'stop' }] })}\n\n`, 'data: [DONE]\n\n');
  return parts.join('');
}

export const DRY_REPLIES = [
  '*glances up from the logbook and smiles* Come in, come in. The kettle has just boiled, and the wind will only get worse tonight.',
  '*sets a chipped mug down by the stove* Sit. Forty years this light has burned, and it has not gone dark once on my watch.',
  '*pushes her glasses up and leans closer* The boxes? Ship manifests, mostly. Every vessel that ever passed this rock is written down somewhere.',
  '*the shutters rattle and she laughs nervously* That one was close. We should check the lower door before the next gust.',
] as const;

export function harnessStatusFake(model: string) {
  return { pluginVersion: 'dry', harnesses: { opencode: { installed: true, version: 'dry', problem: null, loggedIn: true, fresh: true, loginProblem: null, blocked: null, offered: true,
    isolation: 'dry', models: [{ id: model, context: 200000, image: true, available: true }], quotaUntil: null, spawns: 0, loginState: 'ok', agentBridge: false } } };
}

export function harnessCompleteFake(body: any): { ok: true; text: string; finish: string; effortApplied: boolean; usage: { input: number; output: number; costUsd: number }; spawnMs: number } {
  const size = /(\d{2,5})\s*[x×]\s*(\d{2,5})/.exec(String(body?.prompt ?? ''));
  const width = size ? Number(size[1]) : 320, height = size ? Number(size[2]) : 448;
  return { ok: true, text: JSON.stringify({ landmarks: syntheticLandmarks(width, height) }), finish: 'stop', effortApplied: false, usage: { input: 0, output: 0, costUsd: 0 }, spawnMs: 0 };
}
