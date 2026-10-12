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
import { deformInto, eyeVertexY, headGrid, type HeadMesh } from "./geometry";
import { VS, FS } from "./shaders";

interface LayerResources { layer: HeadLayer; mesh: HeadMesh; vao: WebGLVertexArrayObject; position: WebGLBuffer; texture: WebGLTexture; buffers: WebGLBuffer[]; eye: number; part: string }

const ERROR_CHECK_EVERY = 120;

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

  constructor(private readonly canvas: HTMLCanvasElement, private readonly manifest: HeadManifest) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) throw new Error("WebGL2 is unavailable.");
    this.gl = gl;
    const eyes = manifest.rig.eyes;
    this.eyeBox = new Float32Array(eyes.flatMap((eye) => [eye.x0, eye.x1, 0, 0]));
    this.eyeTop = new Float32Array(eyes.flatMap((eye) => eye.top));
    this.eyeBot = new Float32Array(eyes.flatMap((eye) => eye.bot));
    this.cheeks = new Float32Array(manifest.rig.cheeks.flat());
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

  add(layer: HeadLayer, image: HTMLImageElement): void {
    const gl = this.gl, rig = this.manifest.rig;
    if (image.naturalWidth !== layer.rect[2] || image.naturalHeight !== layer.rect[3]) throw new Error("Layer image dimensions differ from the rig.");
    const cell = layer.name === "base" ? Math.min(rig.mesh.baseCell, rig.mesh.fine.cell) : layer.name.endsWith("ball") ? rig.mesh.eyeBallCell : rig.mesh.eyeCell;
    const mesh = headGrid(layer.rect, cell), vao = gl.createVertexArray(), texture = gl.createTexture();
    const position = gl.createBuffer(), uv = gl.createBuffer(), index = gl.createBuffer();
    if (!vao || !texture || !position || !uv || !index) {
      gl.deleteVertexArray(vao); gl.deleteTexture(texture); [position, uv, index].forEach((buffer) => gl.deleteBuffer(buffer));
      throw new Error("Could not allocate mesh resources.");
    }
    const eye = /^eye([01])_(.+)$/.exec(layer.name);
    this.layers.push({ layer, mesh, vao, texture, position, buffers: [position, uv, index], eye: eye ? Number(eye[1]) : -1, part: eye?.[2] ?? "" });
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, position); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uv); gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.triangles, gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindVertexArray(null);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("Layer texture upload failed.");
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }

  draw(p: HeadParameters): void {
    const gl = this.gl, canvas = this.canvas, rig = this.manifest.rig;
    if (this.closed || gl.isContextLost()) throw new Error("Live head context was lost.");
    if (canvas.parentElement?.parentElement?.classList.contains("so-framed")) canvas.style.width = `${canvas.clientHeight * rig.image.width / rig.image.height}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, 1024 / Math.max(1, canvas.clientWidth, canvas.clientHeight));
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr)), height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const scale = Math.min(width / rig.image.width, height / rig.image.height);
    gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(this.program);
    gl.uniform2f(this.uniform("uScale"), 2 * scale / width, -2 * scale / height);
    gl.uniform2f(this.uniform("uOffset"), -rig.image.width * scale / width, 1 - 2 * (height - rig.image.height * scale) / height);
    gl.uniform1i(this.uniform("uTex"), 0);
    gl.uniform4fv(this.uniform("uEyeBox"), this.eyeBox);
    gl.uniform1fv(this.uniform("uEyeTop"), this.eyeTop); gl.uniform1fv(this.uniform("uEyeBot"), this.eyeBot);
    const state = this.eyeState;
    state[0] = p.eyeOpen; state[1] = p.eyeSmile; state[2] = p.gazeX * 7; state[3] = -p.gazeY * 4.2;
    state[4] = p.eyeOpen; state[5] = p.eyeSmile; state[6] = p.gazeX * 5.95; state[7] = -p.gazeY * 4.2;
    gl.uniform4fv(this.uniform("uEyeState"), state);
    gl.uniform4f(this.uniform("uMouth"), rig.mouth.cx, rig.mouth.cy, rig.mouth.angle, rig.mouth.halfLen);
    gl.uniform4f(this.uniform("uMouthState"), p.mouthOpen, p.mouthForm, rig.mouth.bow, Math.max(8, rig.face.jaw.cy + rig.face.jaw.ry - rig.mouth.cy));
    gl.uniform4fv(this.uniform("uCheeks"), this.cheeks); gl.uniform1f(this.uniform("uCheek"), p.blush);
    gl.activeTexture(gl.TEXTURE0);
    for (const resource of this.layers) {
      const { layer, mesh } = resource;
      const part = resource.part, rest = mesh.rest, pos = mesh.pos;
      if (resource.eye >= 0) {
        const eye = rig.eyes[resource.eye];
        for (let i = 0; i < rest.length; i += 2) deformInto(rig, rest[i], eyeVertexY(eye, part, rest[i], rest[i + 1], p.eyeOpen, p.eyeSmile), p, pos, i);
      } else {
        for (let i = 0; i < rest.length; i += 2) deformInto(rig, rest[i], rest[i + 1], p, pos, i);
      }
      gl.bindVertexArray(resource.vao); gl.bindBuffer(gl.ARRAY_BUFFER, resource.position); gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.pos);
      gl.bindTexture(gl.TEXTURE_2D, resource.texture); gl.uniform4fv(this.uniform("uRect"), layer.rect);
      gl.uniform1i(this.uniform("uFace"), part === "ball" ? 2 + resource.eye : layer.name === "base" ? 1 : 0);
      const blink = Math.min(1, Math.max(0, 1 - p.eyeOpen));
      gl.uniform1f(this.uniform("uAlpha"), part === "low" ? 1 - Math.min(1, blink * p.eyeSmile * 1.2) : part === "crease" ? 1 - 0.45 * blink : 1);
      gl.drawElements(gl.TRIANGLES, mesh.triangles.length, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    this.frames += 1;
    if ((this.frames <= 3 || this.frames % ERROR_CHECK_EVERY === 0) && gl.getError() !== gl.NO_ERROR) throw new Error("Live head draw failed.");
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    for (const layer of this.layers) {
      this.gl.deleteTexture(layer.texture); this.gl.deleteVertexArray(layer.vao); layer.buffers.forEach((buffer) => this.gl.deleteBuffer(buffer));
    }
    this.layers.length = 0; this.gl.deleteProgram(this.program); this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
