export function installLiveHeadProbe() {
  const root = globalThis as any;
  const state = root.__lh = { frames: [] as number[], vectors: [] as string[], mouths: [] as number[], sample: false, parameterSample: true,
    contexts: new Set<WebGL2RenderingContext>(), resources: new Set<unknown>(), peak: 0, draws: 0, failure: '',
    decodeStarted: false, releaseDecode: [] as Array<() => void>, publications: [] as HTMLCanvasElement[], staleCanvas: null as HTMLCanvasElement | null, rafTime: 0 };
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (fn) => raf.call(window, (time) => { state.rafTime = time; fn(time); });
  const context = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind: any, options?: any): any {
    if (kind === 'webgl2' && this.classList.contains('so-live-head') && state.failure === 'webgl') return null;
    const gl = context.call(this, kind, options) as any;
    if (kind !== 'webgl2' || !gl || !this.classList.contains('so-live-head') || state.contexts.has(gl)) return gl;
    state.contexts.add(gl); state.peak = Math.max(state.peak, state.contexts.size);
    for (const [create, remove] of [['createProgram', 'deleteProgram'], ['createShader', 'deleteShader'], ['createBuffer', 'deleteBuffer'], ['createTexture', 'deleteTexture'], ['createVertexArray', 'deleteVertexArray']]) {
      const make = gl[create].bind(gl), drop = gl[remove].bind(gl);
      gl[create] = (...args: any[]) => { const resource = make(...args); if (resource) state.resources.add(resource); return resource; };
      gl[remove] = (resource: unknown) => { state.resources.delete(resource); return drop(resource); };
    }
    this.addEventListener('webglcontextlost', () => state.contexts.delete(gl));
    const clear = gl.clear.bind(gl), buffer = gl.bufferSubData.bind(gl), uniform = gl.uniform4f.bind(gl), location = gl.getUniformLocation.bind(gl);
    let mouth: unknown = null, vector = 2166136261, buffered = false;
    gl.getUniformLocation = (program: unknown, name: string) => { const value = location(program, name); if (name === 'uMouthState') mouth = value; return value; };
    gl.uniform4f = (at: unknown, ...values: number[]) => { if (state.sample && at === mouth) state.mouths.push(values[0]); return uniform(at, ...values); };
    gl.bufferSubData = (...args: any[]) => {
      if (state.sample && state.parameterSample) {
        const data = args[2] as Float32Array;
        const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
        for (const word of words) vector = Math.imul(vector ^ word, 16777619);
        buffered = true;
      }
      return buffer(...args);
    };
    gl.clear = (...args: any[]) => {
      if (state.sample) { if (buffered) state.vectors.push(String(vector)); state.frames.push(state.rafTime); }
      vector = 2166136261; buffered = false;
      state.draws++; return clear(...args);
    };
    return gl;
  } as any;
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
  Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(value: string) {
    if (value.includes('/SOLH/layer/')) {
      if (state.failure === 'image') value = 'data:image/png;base64,AAAA';
      if (state.failure === 'decode') {
        state.decodeStarted = true;
        const element = this;
        state.releaseDecode.push(() => src.set!.call(element, value));
        return;
      }
    }
    src.set!.call(this, value);
  } });
  const observer = new MutationObserver((entries) => {
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      if (element.dataset.liveHeadReady === 'true') {
        const canvas = element.querySelector<HTMLCanvasElement>('canvas.so-live-head');
        if (canvas) state.publications.push(canvas);
      }
    }
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-live-head-ready'] });
  root.__lhWhy = () => ({
    staleConnected: !!state.staleCanvas?.isConnected,
    sprites: [...document.querySelectorAll<HTMLElement>('#so-vn-stage .so-sprite')].map((sprite) => ({
      canvas: !!sprite.querySelector('canvas'),
      images: [...sprite.querySelectorAll<HTMLImageElement>('img.so-sprite-top, img.so-sprite-under')].map((image) => {
        const box = image.getBoundingClientRect(), style = getComputedStyle(image);
        return { complete: image.complete, natural: image.naturalWidth, box: [Math.round(box.width), Math.round(box.height)], visibility: style.visibility, opacity: style.opacity, cls: image.className };
      }),
    })),
  });
  root.__lhStatic = (switching = false) => {
    const sprites = [...document.querySelectorAll<HTMLElement>('#so-vn-stage .so-sprite')];
    return sprites.length === 3 && sprites.every((sprite) => {
      const images = [...sprite.querySelectorAll<HTMLImageElement>('img.so-sprite-top, img.so-sprite-under')];
      const canvas = sprite.querySelector('canvas');
      return images.some((image) => {
        const box = image.getBoundingClientRect(), style = getComputedStyle(image);
        return image.complete && image.naturalWidth > 0 && !!box.width && !!box.height && style.visibility !== 'hidden' && style.opacity === '1';
      })
        && (switching ? !state.staleCanvas?.isConnected : !canvas || getComputedStyle(canvas).visibility === 'hidden');
    });
  };
}

export function resetLiveHeadSamples() {
  const state = (globalThis as any).__lh;
  state.frames = []; state.vectors = []; state.mouths = []; state.sample = true;
}

export function readLiveHeadSamples() {
  const state = (globalThis as any).__lh;
  state.sample = false;
  const intervals = state.frames.slice(1).map((time: number, at: number) => time - state.frames[at]);
  return { frames: state.frames, intervals, vectors: [...new Set(state.vectors)], mouths: [...new Set(state.mouths)],
    draws: state.draws, contexts: state.contexts.size, resources: state.resources.size, peak: state.peak };
}
