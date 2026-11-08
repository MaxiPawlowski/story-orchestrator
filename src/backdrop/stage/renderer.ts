import type { BackdropAssets, BackdropBase, BackdropCamera, BackdropFrame, BackdropLayer, BackdropLayerContext, BackdropLayerSpec } from "../types";
import { registeredLayer } from "./registry";
import { BASE_FS, DIM_FS, QUAD_VS } from "./shaders";
import { coverTransform, type Cover } from "./cover";
import { BACKDROP_VERTEX_SHADER } from "./vertex";

export type BaseSource = HTMLImageElement | HTMLVideoElement;

interface BaseSlot {
  base: BackdropBase;
  texture: WebGLTexture;
  source: BaseSource;
  cover: Cover;
  width: number;
  height: number;
}

export const CROSSFADE_MS = 900;

const sourceSize = (source: BaseSource): { width: number; height: number } => source instanceof HTMLVideoElement
  ? { width: source.videoWidth, height: source.videoHeight } : { width: source.naturalWidth, height: source.naturalHeight };

export class BackdropRenderer {
  readonly gl: WebGL2RenderingContext;
  private readonly quad: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly programs = new Map<string, WebGLProgram>();
  private readonly textures = new Map<string, Promise<WebGLTexture | null>>();
  private readonly owned = new Set<WebGLTexture>();
  private readonly base: WebGLProgram;
  private readonly dim: WebGLProgram;
  private readonly uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private current: BaseSlot | null = null;
  private previous: BaseSlot | null = null;
  private fadeStart = 0;
  private layers: Array<{ spec: BackdropLayerSpec; layer: BackdropLayer }> = [];
  private assets: BackdropAssets = {};
  private lastVideoUpload = -1;
  width = 1;
  height = 1;

  constructor(readonly canvas: HTMLCanvasElement, private readonly loadImage: (url: string) => Promise<HTMLImageElement>) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!gl) throw new Error("WebGL2 is not available");
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
  }

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

  private makeTexture(source: TexImageSource | null): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.owned.add(texture);
    return texture;
  }

  texture(url: string): Promise<WebGLTexture | null> {
    const cached = this.textures.get(url);
    if (cached) return cached;
    const loading = this.loadImage(url).then((image) => this.makeTexture(image)).catch(() => null);
    this.textures.set(url, loading);
    return loading;
  }

  setBase(base: BackdropBase, source: BaseSource, now: number): void {
    const size = sourceSize(source);
    const slot: BaseSlot = { base, source, texture: this.makeTexture(source instanceof HTMLVideoElement ? null : source), ...size,
      cover: coverTransform(size.width, size.height, this.width, this.height) };
    if (this.previous && this.previous !== this.current) this.release(this.previous);
    this.previous = this.current;
    this.current = slot;
    this.fadeStart = this.previous ? now : now - CROSSFADE_MS;
    this.lastVideoUpload = -1;
  }

  private release(slot: BaseSlot): void {
    this.gl.deleteTexture(slot.texture);
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
    };
  }

  setLayers(specs: readonly BackdropLayerSpec[], assets: BackdropAssets): void {
    this.assets = assets;
    const keep: typeof this.layers = [];
    for (const entry of this.layers) {
      const next = specs.find((spec) => spec.id === entry.spec.id && spec.kind === entry.spec.kind);
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

  layerKinds(): string[] { return this.layers.map((entry) => entry.layer.kind); }

  camera(frame: BackdropFrame): BackdropCamera {
    return this.layers.reduce<BackdropCamera>((camera, entry) => entry.layer.adjustCamera?.(camera, frame) ?? camera, { x: 0, y: 0, zoom: 1 });
  }

  private uploadVideo(slot: BaseSlot): void {
    const video = slot.source as HTMLVideoElement;
    if (video.readyState < 2) return;
    const time = video.currentTime;
    if (time === this.lastVideoUpload && slot === this.current) return;
    if (slot.width !== video.videoWidth || slot.height !== video.videoHeight) {
      slot.width = video.videoWidth;
      slot.height = video.videoHeight;
      slot.cover = coverTransform(slot.width, slot.height, this.width, this.height);
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, slot.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    if (slot === this.current) this.lastVideoUpload = time;
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
    if (!this.layers.some((entry) => entry.layer.replacesBase)) {
      gl.useProgram(this.base);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, current.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, (previous ?? current).texture);
      gl.uniform1i(this.uniform(this.base, "uA"), 0);
      gl.uniform1i(this.uniform(this.base, "uB"), 1);
      gl.uniform4fv(this.uniform(this.base, "uCoverA"), current.cover);
      gl.uniform4fv(this.uniform(this.base, "uCoverB"), (previous ?? current).cover);
      gl.uniform1f(this.uniform(this.base, "uMix"), previous ? Math.min(1, (now - this.fadeStart) / CROSSFADE_MS) : 1);
      gl.uniform3f(this.uniform(this.base, "uCam"), camera.x, camera.y, camera.zoom);
      gl.uniform3fv(this.uniform(this.base, "uTint"), frame.tint);
      gl.uniform1f(this.uniform(this.base, "uVignette"), 0.12 + frame.state.tension * 0.25);
      gl.bindVertexArray(this.quad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.activeTexture(gl.TEXTURE0);
    }
    if (!previous && this.previous) { this.release(this.previous); this.previous = null; }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const entry of this.layers) entry.layer.draw(full);
    if (dim && dim.amount > 0) {
      gl.useProgram(this.dim);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(this.uniform(this.dim, "uBand"), dim.left, dim.right);
      gl.uniform1f(this.uniform(this.dim, "uAmount"), dim.amount);
      gl.uniform1f(this.uniform(this.dim, "uSoft"), 0.04);
      gl.bindVertexArray(this.quad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    return full;
  }

  dispose(): void {
    this.layers.forEach((entry) => entry.layer.dispose());
    this.layers = [];
    for (const slot of [this.current, this.previous]) if (slot) this.release(slot);
    this.current = this.previous = null;
    const gl = this.gl;
    this.owned.forEach((texture) => gl.deleteTexture(texture));
    this.owned.clear();
    this.programs.forEach((program) => gl.deleteProgram(program));
    this.programs.clear();
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.quad);
  }
}
