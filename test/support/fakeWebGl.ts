type Handle = { id: number; kind: string };
type Vao = Handle & { attrib0: Handle | null };

const hashBytes = (hash: number, view: ArrayBufferView): number => {
  const words = view.byteLength % 4 === 0 && view.byteOffset % 4 === 0 ? new Uint32Array(view.buffer, view.byteOffset, view.byteLength / 4) : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  for (let index = 0; index < words.length; index++) hash = Math.imul(hash ^ words[index], 16777619);
  return hash;
};
const hashText = (hash: number, text: string): number => {
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash;
};

export interface FakeGlCounts { bufferSubData: number; bufferData: number; draws: number; clears: number; texImage2D: number }

export class FakeWebGl {
  readonly counts: FakeGlCounts = { bufferSubData: 0, bufferData: 0, draws: 0, clears: 0, texImage2D: 0 };
  readonly frameDigests: string[] = [];
  private next = 1;
  private frame = 2166136261;
  private framed = false;
  private arrayBuffer: Handle | null = null;
  private vao: Vao | null = null;
  private texture: Handle | null = null;
  private readonly contents = new Map<Handle, Float32Array>();
  private readonly textures = new Map<Handle, string>();
  private readonly uniformValues = new Map<string, number[]>();
  private viewportBox: number[] = [];
  lost = false;
  constructor() {
    return new Proxy(this, { get: (target, key, receiver) => {
      if (typeof key === "string" && /^[A-Z][A-Z0-9_]+$/.test(key) && !(key in target)) return key;
      return Reflect.get(target, key, receiver);
    } });
  }
  NO_ERROR = 0;
  private make(kind: string): Handle { return { id: this.next++, kind }; }
  createProgram() { return this.make("program"); }
  createShader() { return this.make("shader"); }
  createBuffer() { return this.make("buffer"); }
  createTexture() { return this.make("texture"); }
  createVertexArray(): Vao { return { ...this.make("vao"), attrib0: null }; }
  shaderSource() {}
  compileShader() {}
  getShaderParameter() { return true; }
  getShaderInfoLog() { return ""; }
  attachShader() {}
  deleteShader() {}
  bindAttribLocation() {}
  linkProgram() {}
  getProgramParameter() { return true; }
  getProgramInfoLog() { return ""; }
  enable() {}
  blendFunc() {}
  useProgram() {}
  activeTexture() {}
  pixelStorei() {}
  texParameteri() {}
  enableVertexAttribArray() {}
  getError() { return 0; }
  isContextLost() { return this.lost; }
  getExtension() { return { loseContext: () => { this.lost = true; } }; }
  deleteTexture() {}
  deleteVertexArray() {}
  deleteBuffer() {}
  deleteProgram() {}
  bindVertexArray(vao: Vao | null) { this.vao = vao; }
  bindBuffer(target: string, buffer: Handle | null) { if (target === "ARRAY_BUFFER") this.arrayBuffer = buffer; }
  bindTexture(_target: string, texture: Handle | null) { this.texture = texture; }
  vertexAttribPointer(index: number) { if (index === 0 && this.vao) this.vao.attrib0 = this.arrayBuffer; }
  bufferData(target: string, data: ArrayBufferView) {
    this.counts.bufferData++;
    if (target === "ARRAY_BUFFER" && this.arrayBuffer && data instanceof Float32Array) this.contents.set(this.arrayBuffer, new Float32Array(data));
  }
  bufferSubData(target: string, offset: number, data: Float32Array) {
    this.counts.bufferSubData++;
    if (target !== "ARRAY_BUFFER" || !this.arrayBuffer) return;
    const held = this.contents.get(this.arrayBuffer);
    if (!held) throw new Error("bufferSubData before bufferData");
    held.set(data, offset / 4);
  }
  texImage2D(...args: unknown[]) {
    this.counts.texImage2D++;
    const source = args.at(-1) as { label?: string; data?: ArrayBufferView } | ArrayBufferView | undefined;
    const pixels = ArrayBuffer.isView(source) ? source : source?.data;
    if (this.texture) this.textures.set(this.texture, pixels ? String(hashBytes(2166136261, pixels) >>> 0) : String((source as { label?: string } | undefined)?.label ?? this.texture.id));
  }
  getUniformLocation(_program: unknown, name: string) { return name; }
  private uniform(name: string | null, values: number[]) { if (name) this.uniformValues.set(name, values); }
  uniform1i(at: string, x: number) { this.uniform(at, [x]); }
  uniform1f(at: string, x: number) { this.uniform(at, [x]); }
  uniform2f(at: string, x: number, y: number) { this.uniform(at, [x, y]); }
  uniform4f(at: string, x: number, y: number, z: number, w: number) { this.uniform(at, [x, y, z, w]); }
  uniform1fv(at: string, values: ArrayLike<number>) { this.uniform(at, Array.from(values)); }
  uniform4fv(at: string, values: ArrayLike<number>) { this.uniform(at, Array.from(values)); }
  viewport(...box: number[]) { this.viewportBox = box; }
  clearColor() {}
  clear() {
    if (this.framed) this.frameDigests.push((this.frame >>> 0).toString(16));
    this.counts.clears++; this.frame = hashText(2166136261, this.viewportBox.join(",")); this.framed = true;
  }
  drawElements(_mode: string, count: number) {
    this.counts.draws++;
    const position = this.vao?.attrib0 ? this.contents.get(this.vao.attrib0) : undefined;
    let hash = hashText(this.frame, `${count}|${this.texture ? this.textures.get(this.texture) : "-"}`);
    if (position) hash = hashBytes(hash, position);
    for (const name of [...this.uniformValues.keys()].sort()) hash = hashBytes(hashText(hash, name), new Float64Array(this.uniformValues.get(name)!.map((value) => value + 0)));
    this.frame = hash;
  }
  finish(): string[] {
    if (this.framed) this.frameDigests.push((this.frame >>> 0).toString(16));
    this.framed = false;
    return this.frameDigests;
  }
}

export function fakeCanvas(gl: FakeWebGl, width = 128, height = 192): HTMLCanvasElement {
  return { clientWidth: width, clientHeight: height, width: 0, height: 0, style: {}, parentElement: null,
    getContext: (kind: string) => (kind === "webgl2" ? gl : null) } as unknown as HTMLCanvasElement;
}

export const fakeLayerImage = (width: number, height: number, label: string): HTMLImageElement =>
  ({ naturalWidth: width, naturalHeight: height, width, height, label }) as unknown as HTMLImageElement;
