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
import type { HeadParameters } from "../drivers";
import { headGrid, type HairInput, type HeadMesh } from "../geometry";
import { HairPhysics, MAX_STRAND_NODES, strandWeights, type HairHost } from "../hair";
import { VS, FS } from "../shaders";
import { ARM_HANG, ArmPose, BODY_STRIDE, BodyFrame, armForeWeights, bodyWeights, bodyWeightsInto, deformBody, deformBodyPoint } from "./geometry";
import type { BodyLayer, BodyManifest, BodyRig } from "./types";

interface Resources { layer: BodyLayer; mesh: HeadMesh; vao: WebGLVertexArrayObject; position: WebGLBuffer; texture: WebGLTexture; buffers: WebGLBuffer[] }
interface BaseResources extends Resources { weights: Float64Array; hair: HairInput | null }
interface ArmResources extends Resources { pose: ArmPose; fore: Float64Array; side: number; upper: number; velocity: number; foreAngle: number; settled: boolean }

const ARM_K = 40, ARM_DAMP = 2 * 0.6 * Math.sqrt(ARM_K), MAX_DT = 0.05, ERROR_CHECK_EVERY = 120;

export function bodyHairHost(rig: BodyRig, frame: BodyFrame): HairHost {
  const strands = (rig.strands ?? []).filter((strand) => strand.nodes.length >= 2 && strand.nodes.length <= MAX_STRAND_NODES);
  const weights = new Float64Array(Math.max(1, strands.length * MAX_STRAND_NODES * BODY_STRIDE)), nodes = new Float64Array(Math.max(2, strands.length * MAX_STRAND_NODES * 2));
  strands.forEach((strand, s) => strand.nodes.forEach(([x, y], j) => {
    bodyWeightsInto(rig, x, y, weights, (s * MAX_STRAND_NODES + j) * BODY_STRIDE);
    nodes[(s * MAX_STRAND_NODES + j) * 2] = x; nodes[(s * MAX_STRAND_NODES + j) * 2 + 1] = y;
  }));
  return {
    strands,
    anchor: (_x, _y, _p, out, at) => deformBodyPoint(rig, frame, nodes, at, weights, at / 2 * BODY_STRIDE, out, at),
    roll: (p) => -p.angleZ / 30 * rig.head.maxRoll - p.bodyAngleZ / 10 * rig.torso.maxRoll,
  };
}

export class BodyRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly frame: BodyFrame;
  private base: BaseResources | null = null;
  private readonly arms: ArmResources[] = [];
  private hair: HairPhysics | null = null;
  private hairShown = false;
  private readonly seen = new Float64Array(6).fill(Number.NaN);
  private lastTime = Number.NaN;
  private closed = false;
  private frames = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly manifest: BodyManifest) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) throw new Error("WebGL2 is unavailable.");
    this.gl = gl;
    this.frame = new BodyFrame(manifest.rig);
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

  private allocate(layer: BodyLayer, cell: number): Resources {
    const gl = this.gl, mesh = headGrid(layer.rect, cell), vao = gl.createVertexArray(), texture = gl.createTexture();
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
    return { layer, mesh, vao, texture, position, buffers: [position, uv, index] };
  }

  add(layer: BodyLayer, image: HTMLImageElement): void {
    const rig = this.manifest.rig, gl = this.gl;
    if (image.naturalWidth !== layer.rect[2] || image.naturalHeight !== layer.rect[3]) throw new Error("Layer image dimensions differ from the rig.");
    if (layer.name === "base") {
      if (this.base) return;
      const resources = this.allocate(layer, rig.mesh.baseCell), host = bodyHairHost(rig, this.frame);
      const hair = strandWeights(host.strands, resources.mesh.rest, (rig.eyes ?? []).map((eye) => ({ ...eye, rx: eye.rx * 1.15, ry: eye.ry * 1.3 })));
      if (hair) this.hair = new HairPhysics(host, hair.offsets);
      this.base = { ...resources, weights: bodyWeights(rig, resources.mesh.rest), hair };
    } else {
      const arm = rig.arms?.[Number(layer.name.slice(3))];
      if (!arm || arm.state !== "free" || this.arms.some((entry) => entry.layer.name === layer.name)) return;
      const resources = this.allocate(layer, rig.mesh.armCell);
      this.arms.push({ ...resources, pose: new ArmPose(rig, arm), fore: armForeWeights(arm, resources.mesh.rest), side: arm.side === "left" ? 1 : -1,
        upper: 0, velocity: 0, foreAngle: 0, settled: false });
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindVertexArray(null);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("Layer texture upload failed.");
  }

  holdHair(x: number | null, y = 0): void { this.hair?.hold(x, y); }

  motionParts(): { strands: number; arms: string[] } { return { strands: this.hair?.strands.length ?? 0, arms: this.arms.map((arm) => arm.layer.name) }; }

  meshes(): HeadMesh[] { return [...(this.base ? [this.base.mesh] : []), ...this.arms.map((arm) => arm.mesh)]; }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }

  private changed(p: HeadParameters): boolean {
    const seen = this.seen;
    const moved = seen[0] !== p.breath || seen[1] !== p.angleX || seen[2] !== p.angleY || seen[3] !== p.angleZ || seen[4] !== p.bodyAngleX || seen[5] !== p.bodyAngleZ;
    seen[0] = p.breath; seen[1] = p.angleX; seen[2] = p.angleY; seen[3] = p.angleZ; seen[4] = p.bodyAngleX; seen[5] = p.bodyAngleZ;
    return moved;
  }

  private swing(arm: ArmResources, p: HeadParameters, dt: number): boolean {
    const a = arm.pose.arm, target = -this.frame.roll * arm.pose.torsoWeight() * ARM_HANG + p.armAngle / 10 * a.swing * arm.side;
    const fore = p.handAngle / 10 * a.bend * arm.side, before = arm.upper, beforeFore = arm.foreAngle;
    if (p.hair <= 0 || !arm.settled || dt <= 0) { arm.upper = target; arm.velocity = 0; arm.settled = p.hair > 0; }
    else {
      arm.velocity += (ARM_K * (target - arm.upper) - ARM_DAMP * arm.velocity) * dt;
      arm.upper += arm.velocity * dt;
    }
    arm.foreAngle = fore;
    return arm.upper !== before || arm.foreAngle !== beforeFore;
  }

  draw(p: HeadParameters, now = Number.NaN): void {
    const gl = this.gl, canvas = this.canvas, rig = this.manifest.rig;
    const dtMs = Number.isFinite(now - this.lastTime) ? now - this.lastTime : 0, dt = Math.min(MAX_DT, Math.max(0, dtMs / 1000));
    this.lastTime = now;
    if (this.closed || gl.isContextLost()) throw new Error("Live body context was lost.");
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, 1024 / Math.max(1, canvas.clientWidth, canvas.clientHeight));
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr)), height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const scale = Math.min(width / rig.image.width, height / rig.image.height);
    gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(this.program);
    gl.uniform2f(this.uniform("uScale"), 2 * scale / width, -2 * scale / height);
    gl.uniform2f(this.uniform("uOffset"), -rig.image.width * scale / width, 1 - 2 * (height - rig.image.height * scale) / height);
    gl.uniform1i(this.uniform("uTex"), 0); gl.uniform1i(this.uniform("uFace"), 0); gl.uniform1f(this.uniform("uAlpha"), 1);
    gl.activeTexture(gl.TEXTURE0);
    const moved = this.changed(p), frame = this.frame.set(p);
    const hair = this.hair;
    let hairMoving = false;
    if (hair) { hair.step(p, dt); hairMoving = hair.active || this.hairShown; this.hairShown = hair.active; }
    const base = this.base;
    if (base) {
      gl.bindVertexArray(base.vao);
      if (moved || (hairMoving && base.hair !== null)) {
        deformBody(rig, frame, base.mesh.rest, base.weights, base.mesh.pos, hair?.active ? base.hair : null);
        gl.bindBuffer(gl.ARRAY_BUFFER, base.position); gl.bufferSubData(gl.ARRAY_BUFFER, 0, base.mesh.pos);
      }
      gl.bindTexture(gl.TEXTURE_2D, base.texture); gl.uniform4fv(this.uniform("uRect"), base.layer.rect);
      gl.drawElements(gl.TRIANGLES, base.mesh.triangles.length, gl.UNSIGNED_INT, 0);
    }
    for (const arm of this.arms) {
      const swung = this.swing(arm, p, dt);
      gl.bindVertexArray(arm.vao);
      if (moved || swung || this.frames === 0) {
        arm.pose.set(frame, arm.upper, arm.foreAngle);
        arm.pose.deform(arm.mesh.rest, arm.fore, arm.mesh.pos);
        gl.bindBuffer(gl.ARRAY_BUFFER, arm.position); gl.bufferSubData(gl.ARRAY_BUFFER, 0, arm.mesh.pos);
      }
      gl.bindTexture(gl.TEXTURE_2D, arm.texture); gl.uniform4fv(this.uniform("uRect"), arm.layer.rect);
      gl.drawElements(gl.TRIANGLES, arm.mesh.triangles.length, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    this.frames += 1;
    if ((this.frames <= 3 || this.frames % ERROR_CHECK_EVERY === 0) && gl.getError() !== gl.NO_ERROR) throw new Error("Live body draw failed.");
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    for (const layer of [...(this.base ? [this.base] : []), ...this.arms]) {
      this.gl.deleteTexture(layer.texture); this.gl.deleteVertexArray(layer.vao); layer.buffers.forEach((buffer) => this.gl.deleteBuffer(buffer));
    }
    this.base = null; this.arms.length = 0; this.hair = null;
    this.gl.deleteProgram(this.program); this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
