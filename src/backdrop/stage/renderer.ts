import type { BackdropAssets, BackdropBase, BackdropBaseModifier, BackdropCamera, BackdropFrame, BackdropLayer, BackdropLayerContext, BackdropLayerSpec } from "../types";
import { registeredLayer } from "./registry";
import { BASE_FS, DIM_FS, QUAD_VS } from "./shaders";
import { coverTransform, type Cover } from "./cover";
import { BACKDROP_VERTEX_SHADER } from "./vertex";
import { log } from "@utils/log";

export type BaseSource = HTMLImageElement | HTMLVideoElement;

interface BaseSlot {
  allocated: boolean;
  base: BackdropBase;
  texture: WebGLTexture;
  source: BaseSource;
  cover: Cover;
  width: number;
  height: number;
}

export const CROSSFADE_MS = 1200;

export const crossfadeMix = (elapsed: number): number => {
  const t = Math.min(1, Math.max(0, elapsed / CROSSFADE_MS));
  return t * t * (3 - 2 * t);
};

const sourceSize = (source: BaseSource): { width: number; height: number } => source instanceof HTMLVideoElement
  ? { width: source.videoWidth, height: source.videoHeight } : { width: source.naturalWidth, height: source.naturalHeight };

export const mergeModifiers = (parts: ReadonlyArray<BackdropBaseModifier | null | undefined>): BackdropBaseModifier =>
  parts.reduce<BackdropBaseModifier>((merged, part) => ({ ...merged, ...(part ?? {}) }), {});

export class BackdropRenderer {
  readonly gl: WebGL2RenderingContext;
  private readonly quad: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly programs = new Map<string, WebGLProgram>();
  private readonly textures = new Map<string, Promise<WebGLTexture | null>>();
  private readonly owned = new Set<WebGLTexture>();
  private readonly base: WebGLProgram;
  private readonly dim: WebGLProgram;
  private readonly blank: WebGLTexture;
  private readonly uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private current: BaseSlot | null = null;
  private previous: BaseSlot | null = null;
  private fadeStart = 0;
  private layers: Array<{ spec: BackdropLayerSpec; layer: BackdropLayer }> = [];
  private assets: BackdropAssets = {};
  private lastVideoUpload = -1;
  private lost = false;
  private quietBand: [number, number, number] = [0, 0, 0];
  private disposed = false;
  width = 1;
  height = 1;

  constructor(readonly canvas: HTMLCanvasElement, private readonly loadImage: (url: string) => Promise<HTMLImageElement>) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!gl || gl.isContextLost()) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.quad = gl.createVertexArray() as WebGLVertexArrayObject;
    this.buffer = gl.createBuffer() as WebGLBuffer;
    gl.bindVertexArray(this.quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.base = this.program(QUAD_VS, BASE_FS);
    this.dim = this.program(QUAD_VS, DIM_FS);
    this.blank = this.makeTexture(null, false);
  }

  markLost(): void { this.lost = true; }

  program(vertex: string, fragment: string): WebGLProgram {
    const key = `${vertex}\u0000${fragment}`;
    const cached = this.programs.get(key);
    if (cached) return cached;
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type) as WebGLShader;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`backdrop shader: ${gl.getShaderInfoLog(shader) ?? "compile failed"}`);
      return shader;
    };
    const program = gl.createProgram() as WebGLProgram;
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`backdrop program: ${gl.getProgramInfoLog(program) ?? "link failed"}`);
    this.programs.set(key, program);
    return program;
  }

  uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let table = this.uniforms.get(program);
    if (!table) { table = new Map(); this.uniforms.set(program, table); }
    if (!table.has(name)) table.set(name, this.gl.getUniformLocation(program, name));
    return table.get(name) ?? null;
  }

  private makeTexture(source: TexImageSource | null, mipmaps: boolean): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture() as WebGLTexture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    this.owned.add(texture);
    return texture;
  }

  texture(url: string): Promise<WebGLTexture | null> {
    const cached = this.textures.get(url);
    if (cached) return cached;
    const loading = this.loadImage(url).then((image) => (this.lost || this.disposed ? null : this.makeTexture(image, false))).catch(() => { this.textures.delete(url); return null; });
    this.textures.set(url, loading);
    return loading;
  }

  setPlaying(playing: boolean): void {
    for (const slot of [this.current, this.previous]) {
      if (!(slot?.source instanceof HTMLVideoElement)) continue;
      if (playing) void slot.source.play().catch((error: unknown) => log.warn("The backdrop loop could not resume", error)); else slot.source.pause();
    }
  }

  setBase(base: BackdropBase, source: BaseSource, now: number, instant = false): void {
    const size = sourceSize(source);
    const slot: BaseSlot = { allocated: !(source instanceof HTMLVideoElement), base, source, texture: this.makeTexture(source instanceof HTMLVideoElement ? null : source, true), ...size,
      cover: coverTransform(size.width, size.height, this.width, this.height) };
    const visible = this.previous && this.fading(now) && crossfadeMix(now - this.fadeStart) < 0.5 ? this.previous : this.current;
    for (const old of [this.previous, this.current]) if (old && old !== visible) this.release(old);
    this.previous = visible;
    this.current = slot;
    if (instant && this.previous) { this.release(this.previous); this.previous = null; }
    this.fadeStart = this.previous ? now : now - CROSSFADE_MS;
    this.lastVideoUpload = -1;
  }

  private release(slot: BaseSlot): void {
    if (!this.lost) this.gl.deleteTexture(slot.texture);
    this.owned.delete(slot.texture);
    if (slot.source instanceof HTMLVideoElement) { slot.source.pause(); slot.source.removeAttribute("src"); slot.source.load(); }
  }

  get shownBase(): BackdropBase | null { return this.current?.base ?? null; }

  fading(now: number): boolean { return Boolean(this.previous) && now - this.fadeStart < CROSSFADE_MS; }

  hasVideo(): boolean { return this.current?.source instanceof HTMLVideoElement || this.previous?.source instanceof HTMLVideoElement; }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    for (const slot of [this.current, this.previous]) if (slot) slot.cover = coverTransform(slot.width, slot.height, this.width, this.height);
  }

  private bindScene(program: WebGLProgram, camera: BackdropCamera, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.current?.texture ?? this.blank);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uniform(program, "uScene"), unit);
    gl.uniform4fv(this.uniform(program, "uSceneCover"), this.current?.cover ?? [1, 1, 0, 0]);
    gl.uniform3f(this.uniform(program, "uSceneCam"), camera.x, camera.y, camera.zoom);
    gl.uniform3fv(this.uniform(program, "uQuiet"), this.quietBand);
  }

  private context(): BackdropLayerContext {
    return {
      gl: this.gl, base: this.current?.base ?? null, assets: this.assets,
      baseTexture: () => this.current?.texture ?? null,
      baseSize: () => ({ width: this.current?.width ?? 0, height: this.current?.height ?? 0 }),
      vertexShader: BACKDROP_VERTEX_SHADER,
      program: (vertex, fragment) => this.program(vertex, fragment),
      texture: (url) => this.texture(url),
      drawQuad: () => { this.gl.bindVertexArray(this.quad); this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4); },
      coverTransform: () => this.current?.cover ?? [1, 1, 0, 0],
      bindScene: (program, camera, unit) => this.bindScene(program, camera, unit),
    };
  }

  setLayers(specs: readonly BackdropLayerSpec[], assets: BackdropAssets): void {
    const changed = JSON.stringify(assets) !== JSON.stringify(this.assets);
    if (changed) this.forgetTextures(assets);
    this.assets = assets;
    const keep: typeof this.layers = [];
    for (const entry of this.layers) {
      const next = changed && entry.layer.usesAssets ? undefined : specs.find((spec) => spec.id === entry.spec.id && spec.kind === entry.spec.kind);
      if (next) { entry.layer.update?.(next); keep.push({ spec: next, layer: entry.layer }); }
      else entry.layer.dispose();
    }
    for (const spec of specs) {
      if (keep.some((entry) => entry.spec.id === spec.id)) continue;
      const registered = registeredLayer(spec.kind);
      if (registered) keep.push({ spec, layer: registered.factory(this.context(), spec) });
    }
    this.layers = keep.sort((left, right) => left.layer.order - right.layer.order);
  }

  private forgetTextures(assets: BackdropAssets): void {
    const wanted = new Set(Object.values(assets).filter((url): url is string => typeof url === "string"));
    for (const [url, loading] of [...this.textures]) {
      if (wanted.has(url)) continue;
      this.textures.delete(url);
      void loading.then((texture) => { if (!texture) return; this.owned.delete(texture); if (!this.lost) this.gl.deleteTexture(texture); });
    }
  }

  layerKinds(): string[] { return this.layers.map((entry) => entry.layer.kind); }

  settle(): void {
    if (!this.previous) return;
    this.release(this.previous);
    this.previous = null;
  }

  frameRate(): number {
    if (this.hasVideo()) return 60;
    const rates = this.layers.map((entry) => entry.layer.fps ?? 60);
    return rates.length ? Math.max(...rates) : 60;
  }

  camera(frame: BackdropFrame): BackdropCamera {
    return this.layers.reduce<BackdropCamera>((camera, entry) => entry.layer.adjustCamera?.(camera, frame) ?? camera, { x: 0, y: 0, zoom: 1 });
  }

  private uploadVideo(slot: BaseSlot): void {
    const video = slot.source as HTMLVideoElement;
    if (video.readyState < 2) return;
    const time = video.currentTime;
    if (time === this.lastVideoUpload && slot === this.current) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, slot.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (!slot.allocated || slot.width !== video.videoWidth || slot.height !== video.videoHeight) {
      slot.allocated = true;
      slot.width = video.videoWidth;
      slot.height = video.videoHeight;
      slot.cover = coverTransform(slot.width, slot.height, this.width, this.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (slot === this.current) this.lastVideoUpload = time;
  }

  private drawBase(current: BaseSlot, previous: BaseSlot | null, frame: BackdropFrame, now: number): void {
    const gl = this.gl;
    const camera = frame.camera;
    const modifier = mergeModifiers(this.layers.map((entry) => entry.layer.modifyBase?.(frame)));
    const depth = modifier.depth?.texture ?? modifier.fog?.texture ?? null;
    const u = (name: string) => this.uniform(this.base, name);
    gl.useProgram(this.base);
    const bind = (unit: number, texture: WebGLTexture, name: string) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1i(u(name), unit); };
    bind(0, current.texture, "uA");
    bind(1, (previous ?? current).texture, "uB");
    bind(2, depth ?? this.blank, "uDepth");
    bind(3, modifier.ripple?.texture ?? this.blank, "uMask");
    bind(4, modifier.flow?.texture ?? this.blank, "uFlowMask");
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform4fv(u("uCoverA"), current.cover);
    gl.uniform4fv(u("uCoverB"), (previous ?? current).cover);
    gl.uniform1f(u("uMix"), previous ? crossfadeMix(now - this.fadeStart) : 1);
    gl.uniform3f(u("uCam"), camera.x, camera.y, camera.zoom);
    gl.uniform3fv(u("uTint"), frame.tint);
    gl.uniform3fv(u("uGrade"), frame.grade ?? [1, 1, 0]);
    gl.uniform1f(u("uVignette"), 0.1 + frame.state.tension * 0.2);
    gl.uniform1i(u("uHasDepth"), depth ? 1 : 0);
    gl.uniform2fv(u("uOffset"), modifier.depth?.offset ?? [0, 0]);
    gl.uniform1f(u("uScale"), modifier.depth?.scale ?? 1);
    gl.uniform1f(u("uFocus"), modifier.depth?.focus ?? 0.5);
    gl.uniform1f(u("uFog"), modifier.fog?.density ?? 0);
    gl.uniform3fv(u("uFogColor"), modifier.fog?.color ?? [0.8, 0.82, 0.86]);
    gl.uniform1f(u("uFogTime"), modifier.fog?.time ?? 0);
    gl.uniform1i(u("uRipple"), modifier.ripple ? 1 : 0);
    gl.uniform1i(u("uRippleChannel"), modifier.ripple?.channel === "sky" ? 0 : modifier.ripple?.channel === "all" ? 2 : 1);
    gl.uniform1f(u("uRippleAmount"), (modifier.ripple?.amount ?? 0) * frame.dpr);
    gl.uniform1f(u("uRippleTime"), modifier.ripple?.time ?? 0);
    gl.uniform1i(u("uFlow"), modifier.flow ? 1 : 0);
    gl.uniform1f(u("uFlowStrength"), modifier.flow?.strength ?? 0);
    gl.uniform1f(u("uFlowTime"), modifier.flow?.time ?? 0);
    gl.uniform1f(u("uFlowPeriod"), modifier.flow?.period ?? 1);
    gl.uniform2f(u("uPixel"), current.cover[0] / camera.zoom / this.width, current.cover[1] / camera.zoom / this.height);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  draw(frame: Omit<BackdropFrame, "camera">, dim: { left: number; right: number; amount: number } | null, now: number): BackdropFrame {
    const gl = this.gl;
    const camera = this.camera({ ...frame, camera: { x: 0, y: 0, zoom: 1 } });
    const full: BackdropFrame = { ...frame, camera };
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    const current = this.current;
    if (!current) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); return full; }
    if (current.source instanceof HTMLVideoElement) this.uploadVideo(current);
    const previous = this.fading(now) ? this.previous : null;
    if (previous?.source instanceof HTMLVideoElement) this.uploadVideo(previous);
    this.quietBand = dim && dim.amount > 0 ? [dim.left, dim.right, 0.45] : [0, 0, 0];
    this.drawBase(current, previous, full, now);
    if (!previous && this.previous) { this.release(this.previous); this.previous = null; }
    for (const entry of this.layers) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE0);
      entry.layer.draw(full);
    }
    if (dim && dim.amount > 0) {
      gl.enable(gl.BLEND);
      gl.useProgram(this.dim);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(this.uniform(this.dim, "uBand"), dim.left, dim.right);
      gl.uniform1f(this.uniform(this.dim, "uAmount"), dim.amount);
      gl.uniform1f(this.uniform(this.dim, "uSoft"), 0.07);
      gl.bindVertexArray(this.quad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    return full;
  }

  dispose(): void {
    this.disposed = true;
    this.layers.forEach((entry) => entry.layer.dispose());
    this.layers = [];
    for (const slot of [this.current, this.previous]) if (slot) this.release(slot);
    this.current = this.previous = null;
    if (this.lost) { this.owned.clear(); this.programs.clear(); return; }
    const gl = this.gl;
    this.owned.forEach((texture) => gl.deleteTexture(texture));
    this.owned.clear();
    this.programs.forEach((program) => gl.deleteProgram(program));
    this.programs.clear();
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.quad);
  }
}
