/*! Adapted from mesh-avatar-studio 6f6d362.
MIT License

Copyright (c) 2026 Yuki Shindo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import type { HeadManifest, HeadLayer } from "./manifest";
import type { HeadParameters } from "./drivers";
import type { Eye } from "./types";
import { deformInto, deformWeighted, eyeVertexY, headGrid, vertexWeights, type HairInput, type HeadMesh } from "./geometry";
import { HairPhysics, strandField } from "./hair";
import { HandBones, handWeights } from "./hand";
import { VS, FS } from "./shaders";
import { GAZE_TRAVEL, eyeTone, gazeLimits, irisSpan, limitGaze, type IrisSpan, type Tone } from "./gaze";
import { DrawnDirector, mouthInner, squashVertex, type DrawnSprite, type DrawnState } from "./drawn";
import { MeshMouth, meshMouthMode, mouthRegionProblem, type MeshMouthMode } from "./meshMouth";
import { DEFAULT_MOUTH_CONFIG, type MouthConfig } from "../mouthConfig";
import type { PixelImage } from "../builder/pixels";
import type { PreparedLook } from "./expressions";

interface LayerResources {
  layer: HeadLayer; mesh: HeadMesh; vao: WebGLVertexArrayObject; position: WebGLBuffer; texture: WebGLTexture; buffers: WebGLBuffer[];
  eye: number; part: string; lidded: boolean; weights: Float64Array | null; hair: HairInput | null;
}

interface HandResources { layer: HeadLayer; mesh: HeadMesh; vao: WebGLVertexArrayObject; position: WebGLBuffer; texture: WebGLTexture; buffers: WebGLBuffer[]; weights: Float64Array; bones: HandBones }

interface DrawnResources {
  sprite: DrawnSprite; mesh: HeadMesh; vao: WebGLVertexArrayObject; position: WebGLBuffer; texture: WebGLTexture; buffers: WebGLBuffer[];
  weights: Float64Array | null; inner: Float32Array | null; eye: number; dirty: boolean; squash: number; width: number;
}

interface Look {
  name: string | null; textures: Map<string, WebGLTexture>; drawn: DrawnResources[]; director: DrawnDirector | null;
  sclera: Float32Array; iris: Float32Array; limits: Array<[number, number] | null>; gaze: [boolean, boolean]; toned: boolean;
}

const ERROR_CHECK_EVERY = 120;
export const LOOK_FADE_MS = 220;

const newLook = (name: string | null, gaze: [boolean, boolean] = [true, true]): Look =>
  ({ name, textures: new Map(), drawn: [], director: null, sclera: new Float32Array(8), iris: new Float32Array(8), limits: [null, null], gaze, toned: false });

function ballPixels(image: PixelImage, rect: HeadLayer["rect"], eye: Eye | undefined): { tone: Tone; span: IrisSpan | null } {
  const tone = eyeTone(image.data);
  return { tone, span: eye ? irisSpan(image, rect, eye, tone) : null };
}

function readBall(image: HTMLImageElement, rect: HeadLayer["rect"], eye: Eye | undefined): { tone: Tone; span: IrisSpan | null } | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  try {
    const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight), context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    return ballPixels({ width: image.naturalWidth, height: image.naturalHeight, data: context.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data }, rect, eye);
  } catch { return null; }
}

export class HeadRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly layers: LayerResources[] = [];
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private closed = false;
  private frames = 0;
  private readonly eyeBox: Float32Array;
  private readonly eyeTop: Float32Array;
  private readonly eyeBot: Float32Array;
  private readonly cheeks: Float32Array;
  private readonly eyeState = new Float32Array(8);
  private readonly base = newLook(null);
  private readonly looks = new Map<string, Look>();
  private target: Look = this.base;
  private from: Look | null = null;
  private fade = 1;
  private toneSent = false;
  private readonly uploaded = new Float64Array(14).fill(Number.NaN);
  private hair: HairPhysics | null = null;
  private hairShown = false;
  private hand: HandResources | null = null;
  private lastTime = Number.NaN;
  private readonly meshMouth: MeshMouth;
  private readonly mouthBroken: boolean;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly manifest: HeadManifest, private readonly mouth: MouthConfig = DEFAULT_MOUTH_CONFIG) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) throw new Error("WebGL2 is unavailable.");
    this.gl = gl;
    const eyes = manifest.rig.eyes;
    this.eyeBox = new Float32Array(eyes.flatMap((eye) => [eye.x0, eye.x1, 0, 0]));
    this.eyeTop = new Float32Array(eyes.flatMap((eye) => eye.top));
    this.eyeBot = new Float32Array(eyes.flatMap((eye) => eye.bot));
    this.cheeks = new Float32Array(manifest.rig.cheeks.flat());
    this.mouthBroken = mouthRegionProblem(manifest.rig) !== null;
    this.meshMouth = new MeshMouth(meshMouthMode(manifest.rig, false, mouth), mouth);
    const program = gl.createProgram();
    if (!program) { gl.getExtension("WEBGL_lose_context")?.loseContext(); throw new Error("Could not allocate a WebGL program."); }
    this.program = program;
    try {
      for (const [kind, text] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error("Could not allocate a shader.");
        gl.shaderSource(shader, text); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const reason = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(reason ?? "Shader failed.");
        }
        gl.attachShader(program, shader); gl.deleteShader(shader);
      }
      gl.bindAttribLocation(program, 0, "aPos"); gl.bindAttribLocation(program, 1, "aUv"); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Link failed.");
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } catch (error) { this.destroy(); throw error; }
  }

  private allocate(rect: HeadLayer["rect"], cell: number) {
    const gl = this.gl, mesh = headGrid(rect, cell), vao = gl.createVertexArray(), texture = gl.createTexture();
    const position = gl.createBuffer(), uv = gl.createBuffer(), index = gl.createBuffer();
    if (!vao || !texture || !position || !uv || !index) {
      gl.deleteVertexArray(vao); gl.deleteTexture(texture); [position, uv, index].forEach((buffer) => gl.deleteBuffer(buffer));
      throw new Error("Could not allocate mesh resources.");
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, position); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uv); gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.triangles, gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    return { mesh, vao, texture, position, buffers: [position, uv, index] };
  }

  private sampling(): void {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindVertexArray(null);
  }

  add(layer: HeadLayer, image: HTMLImageElement): void {
    const rig = this.manifest.rig;
    if (image.naturalWidth !== layer.rect[2] || image.naturalHeight !== layer.rect[3]) throw new Error("Layer image dimensions differ from the rig.");
    if (layer.name === "hand") {
      if (!rig.hand || this.hand) return;
      const resources = this.allocate(layer.rect, rig.mesh.handCell);
      this.hand = { layer, ...resources, weights: handWeights(rig.hand, resources.mesh.rest), bones: new HandBones(rig, rig.hand) };
      this.upload(image);
      return;
    }
    const cell = layer.name === "base" ? Math.min(rig.mesh.baseCell, rig.mesh.fine.cell) : layer.name.endsWith("ball") ? rig.mesh.eyeBallCell : rig.mesh.eyeCell;
    const resources = this.allocate(layer.rect, cell);
    const eye = /^eye([01])_(.+)$/.exec(layer.name);
    const part = eye?.[2] ?? "", lidded = part === "lash" || part === "low" || part === "crease";
    const hair = layer.name === "base" ? strandField(rig, resources.mesh.rest) : null;
    if (hair && !this.hair) this.hair = new HairPhysics(rig, hair.offsets);
    this.layers.push({ layer, ...resources, eye: eye ? Number(eye[1]) : -1, part, lidded, weights: lidded ? null : vertexWeights(rig, resources.mesh.rest), hair });
    const index = Number(eye?.[1]), ball = part === "ball" ? readBall(image, layer.rect, rig.eyes[index]) : null;
    if (ball) this.tone(this.base, index, ball);
    this.upload(image);
  }

  private tone(look: Look, index: number, ball: { tone: Tone; span: IrisSpan | null }): void {
    look.sclera.set([...ball.tone, 1], index * 4); look.toned = true;
    if (ball.span) { look.iris.set([ball.span[0], ball.span[1], 1, 0], index * 4); look.limits[index] = gazeLimits(this.manifest.rig.eyes[index], ball.span); }
  }

  addLook(prepared: PreparedLook): void {
    if (this.closed || this.looks.has(prepared.name)) return;
    const gl = this.gl, rig = this.manifest.rig, look = newLook(prepared.name, prepared.gaze);
    try {
      for (const resource of this.layers) {
        const cut = prepared.layers.find((layer) => layer.name === resource.layer.name);
        if (!cut || cut.rect.some((value, k) => value !== resource.layer.rect[k]) || cut.image.width !== cut.rect[2] || cut.image.height !== cut.rect[3])
          throw new Error("Expression layers differ from the rig.");
        const texture = gl.createTexture();
        if (!texture) throw new Error("Could not allocate an expression texture.");
        look.textures.set(resource.layer.name, texture);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cut.rect[2], cut.rect[3], 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(cut.image.data.buffer, cut.image.data.byteOffset, cut.image.data.length));
        this.sampling();
        if (resource.part === "ball") this.tone(look, resource.eye, ballPixels(cut.image, cut.rect, rig.eyes[resource.eye]));
      }
      this.addSprites(look, prepared.sprites);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("Expression texture upload failed.");
    } catch (error) { this.release(look); throw error; }
    this.looks.set(prepared.name, look);
  }

  showLook(name: string | null, cut: boolean): void {
    const next = name === null ? this.base : this.looks.get(name);
    if (!next) return;
    if (next === this.target) { if (cut) { this.from = null; this.fade = 1; } return; }
    this.from = cut ? null : this.target; this.fade = cut ? 1 : 0; this.target = next;
    this.meshMouth.mode = meshMouthMode(this.manifest.rig, next.director?.hasMouth() ?? false, this.mouth);
  }

  shownLook(): string | null { return this.target.name; }

  private upload(image: HTMLImageElement): void {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.sampling();
    if (gl.getError() !== gl.NO_ERROR) throw new Error("Layer texture upload failed.");
  }

  holdHair(x: number | null, y = 0): void { this.hair?.hold(x, y); }

  motionParts(): { strands: number; hand: boolean } { return { strands: this.hair?.strands.length ?? 0, hand: this.hand !== null }; }

  addDrawn(sprites: readonly DrawnSprite[]): void {
    this.addSprites(this.base, sprites);
    if (this.target === this.base) this.meshMouth.mode = meshMouthMode(this.manifest.rig, this.base.director?.hasMouth() ?? false, this.mouth);
  }

  private addSprites(look: Look, sprites: readonly DrawnSprite[]): void {
    const gl = this.gl, rig = this.manifest.rig;
    for (const sprite of sprites) {
      const resources = this.allocate(sprite.rect, rig.mesh.spriteCell), rest = resources.mesh.rest, mouth = sprite.name.startsWith("mouth");
      const inner = mouth ? new Float32Array(rest.length / 2).map((_, k) => mouthInner(rig, rest[k * 2], rest[k * 2 + 1])) : null;
      look.drawn.push({ sprite, ...resources, weights: mouth ? null : vertexWeights(rig, rest), inner, eye: sprite.name === "eyes_closed_1" ? 1 : sprite.name === "eyes_closed_0" ? 0 : -1,
        dirty: true, squash: Number.NaN, width: Number.NaN });
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sprite.rect[2], sprite.rect[3], 0, gl.RGBA, gl.UNSIGNED_BYTE, sprite.pixels);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      this.sampling();
      if (gl.getError() !== gl.NO_ERROR) throw new Error("Drawn sprite upload failed.");
    }
    look.director = look.drawn.length ? new DrawnDirector(new Set(look.drawn.map((entry) => entry.sprite.name)), this.mouth) : null;
  }

  drawnNames(): string[] { return this.base.drawn.map((entry) => entry.sprite.name); }

  mouthMode(): MeshMouthMode { return this.meshMouth.mode; }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }

  draw(input: HeadParameters, now = Number.NaN): void {
    const gl = this.gl, canvas = this.canvas, rig = this.manifest.rig;
    const dt = Number.isFinite(now - this.lastTime) ? now - this.lastTime : 0, p = this.meshMouth.apply(input, dt), look = this.target;
    const mix = this.stepFade(dt), from = this.from;
    const drawn = look.director?.update(this.mouthBroken ? p : input, dt) ?? null;
    this.lastTime = now;
    if (this.closed || gl.isContextLost()) throw new Error("Live head context was lost.");
    if (canvas.parentElement?.parentElement?.classList.contains("so-framed")) canvas.style.width = `${canvas.clientHeight * rig.image.width / rig.image.height}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, 1024 / Math.max(1, canvas.clientWidth, canvas.clientHeight));
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr)), height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const scale = Math.min(width / rig.image.width, height / rig.image.height);
    gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(this.program);
    gl.uniform2f(this.uniform("uScale"), 2 * scale / width, -2 * scale / height);
    gl.uniform2f(this.uniform("uOffset"), -rig.image.width * scale / width, 1 - 2 * (height - rig.image.height * scale) / height);
    gl.uniform1i(this.uniform("uTex"), 0); gl.uniform1i(this.uniform("uTex2"), 1);
    this.faceUniforms(look, p);
    const { deformed, lids, hand: handMoved } = this.changes(p);
    const hair = this.hair, hairMoving = this.stepHair(p, dt);
    for (const resource of this.layers) {
      const { layer, mesh } = resource;
      const part = resource.part, rest = mesh.rest, pos = mesh.pos;
      gl.bindVertexArray(resource.vao);
      if (resource.lidded ? lids : deformed || (hairMoving && resource.hair !== null)) {
        if (resource.weights) deformWeighted(rig, rest, resource.weights, p, pos, hair?.active ? resource.hair : null);
        else {
          const eye = rig.eyes[resource.eye];
          for (let i = 0; i < rest.length; i += 2) deformInto(rig, rest[i], eyeVertexY(eye, part, rest[i], rest[i + 1], p.eyeOpen, p.eyeSmile), p, pos, i);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, resource.position); gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.pos);
      }
      const texture = look.textures.get(layer.name) ?? resource.texture, before = from ? from.textures.get(layer.name) ?? resource.texture : texture;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, before);
      gl.uniform1f(this.uniform("uMix"), before === texture ? 0 : mix); gl.uniform4fv(this.uniform("uRect"), layer.rect);
      gl.uniform1i(this.uniform("uFace"), part === "ball" ? 2 + resource.eye : layer.name === "base" ? 1 : 0);
      const blink = Math.min(1, Math.max(0, 1 - p.eyeOpen));
      gl.uniform1f(this.uniform("uAlpha"), part === "low" ? 1 - Math.min(1, blink * p.eyeSmile * 1.2) : part === "crease" ? 1 - 0.45 * blink : 1);
      if (!drawn || resource.eye < 0 || !drawn.covered[resource.eye]) gl.drawElements(gl.TRIANGLES, mesh.triangles.length, gl.UNSIGNED_INT, 0);
    }
    gl.uniform1f(this.uniform("uMix"), 0);
    if (drawn) this.drawSprites(look, p, drawn, deformed);
    if (this.hand) this.drawHand(p, handMoved);
    gl.bindVertexArray(null);
    this.frames += 1;
    if ((this.frames <= 3 || this.frames % ERROR_CHECK_EVERY === 0) && gl.getError() !== gl.NO_ERROR) throw new Error("Live head draw failed.");
  }

  private stepFade(dt: number): number {
    if (!this.from) return 0;
    this.fade = dt > 0 ? Math.min(1, this.fade + dt / LOOK_FADE_MS) : 1;
    if (this.fade >= 1) { this.from = null; return 0; }
    return this.fade * this.fade * (3 - 2 * this.fade);
  }

  private faceUniforms(look: Look, p: HeadParameters): void {
    const gl = this.gl, rig = this.manifest.rig, state = this.eyeState;
    gl.uniform4fv(this.uniform("uEyeBox"), this.eyeBox);
    gl.uniform1fv(this.uniform("uEyeTop"), this.eyeTop); gl.uniform1fv(this.uniform("uEyeBot"), this.eyeBot);
    const g0 = look.gaze[0] ? 1 : 0, g1 = look.gaze[1] ? 1 : 0;
    state[0] = p.eyeOpen; state[1] = p.eyeSmile; state[2] = g0 * limitGaze(p.gazeX * GAZE_TRAVEL.x[0], look.limits[0]); state[3] = -g0 * p.gazeY * GAZE_TRAVEL.y;
    state[4] = p.eyeOpen; state[5] = p.eyeSmile; state[6] = g1 * limitGaze(p.gazeX * GAZE_TRAVEL.x[1], look.limits[1]); state[7] = -g1 * p.gazeY * GAZE_TRAVEL.y;
    gl.uniform4fv(this.uniform("uEyeState"), state);
    if (look.toned || this.toneSent) { gl.uniform4fv(this.uniform("uSclera"), look.sclera); gl.uniform4fv(this.uniform("uIris"), look.iris); this.toneSent = true; }
    gl.uniform4f(this.uniform("uMouth"), rig.mouth.cx, rig.mouth.cy, rig.mouth.angle, rig.mouth.halfLen);
    gl.uniform4f(this.uniform("uMouthState"), look.director?.hasMouth() ? 0 : p.mouthOpen, p.mouthForm, rig.mouth.bow, Math.max(8, rig.face.jaw.cy + rig.face.jaw.ry - rig.mouth.cy));
    gl.uniform4fv(this.uniform("uCheeks"), this.cheeks); gl.uniform1f(this.uniform("uCheek"), p.blush);
  }

  private drawSprites(look: Look, p: HeadParameters, drawn: DrawnState, deformed: boolean): void {
    const gl = this.gl, rig = this.manifest.rig;
    gl.uniform1i(this.uniform("uFace"), 0);
    for (const entry of look.drawn) {
      const name = entry.sprite.name, alpha = entry.eye >= 0 ? drawn.eyes[entry.eye] : name === drawn.mouth ? drawn.mouthAlpha : name === drawn.mouthFrom ? drawn.mouthFromAlpha : 0;
      const reshaped = entry.inner !== null && alpha > 0 && (entry.squash !== drawn.squash || entry.width !== drawn.width);
      if (deformed || reshaped) entry.dirty = true;
      if (alpha <= 0.001) continue;
      gl.bindVertexArray(entry.vao);
      if (entry.dirty) {
        const rest = entry.mesh.rest, pos = entry.mesh.pos;
        if (entry.weights) deformWeighted(rig, rest, entry.weights, p, pos);
        else if (entry.inner) {
          for (let i = 0; i < rest.length; i += 2) {
            squashVertex(rig, rest[i], rest[i + 1], entry.inner[i / 2], drawn.squash, drawn.width, pos, i);
            deformInto(rig, pos[i], pos[i + 1], p, pos, i);
          }
          entry.squash = drawn.squash; entry.width = drawn.width;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, entry.position); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
        entry.dirty = false;
      }
      gl.bindTexture(gl.TEXTURE_2D, entry.texture); gl.uniform4fv(this.uniform("uRect"), entry.sprite.rect);
      gl.uniform1f(this.uniform("uAlpha"), alpha);
      gl.drawElements(gl.TRIANGLES, entry.mesh.triangles.length, gl.UNSIGNED_INT, 0);
    }
  }

  private readonly changed = { deformed: false, lids: false, hand: false };

  private changes(p: HeadParameters): { deformed: boolean; lids: boolean; hand: boolean } {
    const seen = this.uploaded, out = this.changed;
    out.deformed = seen[0] !== p.breath || seen[1] !== p.angleX || seen[2] !== p.angleY || seen[3] !== p.angleZ
      || seen[4] !== p.browY || seen[5] !== p.browAngle || seen[6] !== p.mouthOpen || seen[9] !== p.bodyAngleX || seen[10] !== p.bodyAngleZ;
    out.lids = out.deformed || seen[7] !== p.eyeOpen || seen[8] !== p.eyeSmile;
    out.hand = out.deformed || seen[11] !== p.armAngle || seen[12] !== p.handAngle || seen[13] !== p.fingerTap;
    seen[0] = p.breath; seen[1] = p.angleX; seen[2] = p.angleY; seen[3] = p.angleZ; seen[4] = p.browY; seen[5] = p.browAngle;
    seen[6] = p.mouthOpen; seen[7] = p.eyeOpen; seen[8] = p.eyeSmile; seen[9] = p.bodyAngleX; seen[10] = p.bodyAngleZ;
    seen[11] = p.armAngle; seen[12] = p.handAngle; seen[13] = p.fingerTap;
    return out;
  }

  private stepHair(p: HeadParameters, dtMs: number): boolean {
    const hair = this.hair;
    if (!hair) return false;
    hair.step(p, dtMs / 1000);
    const moving = hair.active || this.hairShown;
    this.hairShown = hair.active;
    return moving;
  }

  private drawHand(p: HeadParameters, moved: boolean): void {
    const gl = this.gl, hand = this.hand;
    if (!hand) return;
    gl.bindVertexArray(hand.vao);
    if (moved) {
      hand.bones.frame(p); hand.bones.deform(hand.mesh.rest, hand.weights, p, hand.mesh.pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, hand.position); gl.bufferSubData(gl.ARRAY_BUFFER, 0, hand.mesh.pos);
    }
    gl.bindTexture(gl.TEXTURE_2D, hand.texture); gl.uniform4fv(this.uniform("uRect"), hand.layer.rect);
    gl.uniform1i(this.uniform("uFace"), 0); gl.uniform1f(this.uniform("uAlpha"), 1);
    gl.drawElements(gl.TRIANGLES, hand.mesh.triangles.length, gl.UNSIGNED_INT, 0);
  }

  private release(look: Look): void {
    for (const texture of look.textures.values()) this.gl.deleteTexture(texture);
    for (const entry of look.drawn) { this.gl.deleteTexture(entry.texture); this.gl.deleteVertexArray(entry.vao); entry.buffers.forEach((buffer) => this.gl.deleteBuffer(buffer)); }
    look.textures.clear(); look.drawn.length = 0; look.director = null;
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    for (const layer of [...this.layers, ...(this.hand ? [this.hand] : [])]) {
      this.gl.deleteTexture(layer.texture); this.gl.deleteVertexArray(layer.vao); layer.buffers.forEach((buffer) => this.gl.deleteBuffer(buffer));
    }
    for (const look of [this.base, ...this.looks.values()]) this.release(look);
    this.looks.clear(); this.target = this.base; this.from = null;
    this.layers.length = 0; this.hand = null; this.hair = null;
    this.gl.deleteProgram(this.program); this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
