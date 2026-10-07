import { SpriteBuilder, type SpriteBuildRequest } from '../../../src/sprites/builder/builder';
import { decodeImage, encodeImage, cropReference, resizeEdit } from '../../../src/sprites/builder/images';
import { EDIT_RECIPE } from '../../../src/sprites/builder/recipes';
import { SpriteBatchLease } from '../../../src/sprites/builder/batchLease';
import { mintToken, tokenMatches } from '../../../src/runtime/runToken';

async function start() {
  const csrf = await (await fetch('/csrf-token')).json();
  const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token };
  const controller = new AbortController();
  const context = { chatId: null, storyId: 'adolion-saga', storyHash: 'h21', sessionEpoch: 1, windowRevision: 0 };
  addEventListener('beforeunload', () => { context.sessionEpoch++; controller.abort(); }, { once: true });
  const rpc = async (plugin: string, route: string, body?: unknown, signal?: AbortSignal) => {
    const response = await fetch(`/api/plugins/${plugin}/${route}`, { headers, signal,
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? `Request refused ${response.status}`);
    return value;
  };
  const status = () => rpc('story-orchestrator-gpu', 'status');
  const batch = new SpriteBatchLease({ current: () => !controller.signal.aborted,
    mayRetain: async () => { const s = await status(); return s.adapter === 'managed' && !s.activeText && !s.waitingText
      && s.telemetry.gpus[0].freeMiB >= 2048 && s.telemetry.host.availableMiB >= 4096; },
    waitForText: async () => {
      const deadline = Date.now() + 600000;
      while (Date.now() < deadline) {
        controller.signal.throwIfAborted();
        const s = await status();
        if (!s.activeText && !s.waitingText) return;
        await new Promise((done) => setTimeout(done, 250));
      }
      throw new Error('Text did not finish before the batch deadline.');
    }, schedule: (work, ms) => setTimeout(work, ms), unschedule: (timer) => clearTimeout(timer as number), failed: console.error });
  const models = {
    diffusion: await rpc('story-orchestrator-media', 'fingerprint', { kind: 'diffusionModels', name: 'qwen_image_2.1_int8_convrot.safetensors' }),
    encoder: await rpc('story-orchestrator-media', 'fingerprint', { kind: 'textEncoders', name: 'qwen3vl_8b_int8_convrot.safetensors' }),
    vae: await rpc('story-orchestrator-media', 'fingerprint', { kind: 'vaes', name: 'qwen_image_2.1_vae_bf16.safetensors' }),
  };
  const builder = new SpriteBuilder({ ownership: { mint: () => mintToken(context), check: (token) => tokenMatches(context, token), signal: () => controller.signal },
    decode: decodeImage, encode: encodeImage, crop: cropReference, resize: resizeEdit,
    uploadReference: async (data, signal, scope) => (await rpc('story-orchestrator-media', 'reference', { data, scope }, signal)).name,
    releaseReference: async (name) => { const result = await rpc('story-orchestrator-media', 'reference/release', { name }); if (!result.released) throw new Error('Reference cleanup unconfirmed.'); },
    lease: async (request, signal) => {
      const ratio = request.box.width / request.box.height;
      const width = Math.max(32, Math.round(Math.sqrt(1024 ** 2 * ratio) / 32) * 32);
      const height = Math.max(32, Math.round(Math.sqrt(1024 ** 2 / ratio) / 32) * 32);
      const workflowKey = JSON.stringify({ recipe: EDIT_RECIPE, family: 'face', width, height });
      return batch.acquire(workflowKey, async () => {
        const grant = await rpc('story-orchestrator-gpu', 'lease', { workflowKey, width, height,
          modelFiles: [{ kind: 'diffusionModels', name: models.diffusion.name }, { kind: 'textEncoders', name: models.encoder.name }, { kind: 'vaes', name: models.vae.name }] }, signal);
        const renew = async () => { const result = await rpc('story-orchestrator-gpu', 'renew', { lease: grant.lease }); if (!result.renewed) throw new Error('Batch lease expired.'); };
        const timer = setInterval(() => { void renew().catch(console.error); }, 30000);
        return { renew, release: async () => { clearInterval(timer); const result = await rpc('story-orchestrator-gpu', 'release', { lease: grant.lease }); if (!result.released) throw new Error('Batch release unconfirmed.'); } };
      });
    },
    render: async (graph, signal) => {
      const id = crypto.randomUUID();
      const cancel = () => { void rpc('story-orchestrator-media', `jobs/${id}/cancel`, {}).catch(console.error); };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        let job = await rpc('story-orchestrator-media', 'jobs', { id, graph }, signal);
        const deadline = Date.now() + 900000;
        while (job.status !== 'complete') {
          if (['failed', 'cancelled'].includes(job.status)) throw new Error(job.error ?? 'Render refused.');
          if (Date.now() >= deadline) { cancel(); throw new Error('Render deadline exceeded.'); }
          await new Promise((done) => setTimeout(done, 500));
          job = await rpc('story-orchestrator-media', `jobs/${id}`, undefined, signal);
        }
        return rpc('story-orchestrator-media', `jobs/${id}/result`, undefined, signal);
      } catch (error) { cancel(); throw error; }
      finally { signal.removeEventListener('abort', cancel); }
    },
    save: (candidate) => rpc('story-orchestrator-media', 'sprites/save', { character: candidate.request.character,
      set: `anim-${candidate.request.set}`, label: `${candidate.request.label}.${candidate.request.kind}`, data: candidate.data,
      key: candidate.key, recipe: EDIT_RECIPE, qa: candidate.qa, inputs: candidate.inputs }),
  });
  return { build: async (input: Omit<SpriteBuildRequest, 'models'>) => {
    const existing = await rpc('story-orchestrator-media', 'sprites/read', { character: input.character, set: `anim-${input.set}` });
    if (existing?.labels?.[`${input.label}.${input.kind}`]) throw new Error('This frame already exists; audit it instead of rendering again.');
    const candidate = await builder.build({ ...input, models });
    const saved = await builder.save(candidate);
    return { data: candidate.data, saved, timings: candidate.timings, qa: candidate.qa, raw: candidate.rawData, reference: candidate.referenceData };
  }, close: async () => { builder.close(); await batch.close(); controller.abort(); } };
}

(globalThis as any).lowMemorySpriteBuilder = { start };
