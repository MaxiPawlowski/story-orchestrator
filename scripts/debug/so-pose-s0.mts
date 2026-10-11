import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { editGraph, editInstruction } from './lib/poseS0Graph.mts';
import { readDwpose, posePck, shapePck, headToHipRatio, poseHead, retarget, median, percentile, quote, peakFromSamples, verdict, type Keypoints, type PoseLike, type Box } from './lib/poseS0.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const COMFY = process.env.SO_COMFY_URL ?? 'http://127.0.0.1:8188';
const WORK = process.env.SO_S0_DIR ?? 'C:/dev/so-s0';
const PY = process.env.SO_COMFY_PY ?? 'C:/dev/tools/story-orchestrator-local/comfy-cu130/Scripts/python.exe';
const PIXELS = path.join(here, 'lib', 'poseS0Pixels.py');
const SEED = Number(process.env.SO_S0_SEED ?? 1234);
const STEPS = 25;
const MODELS = { diffusion: { name: 'qwen_image_2.1_int8_convrot.safetensors' }, encoder: { name: 'qwen3vl_8b_int8_convrot.safetensors' }, vae: { name: 'qwen_image_2.1_vae_bf16.safetensors' } };
const CUTOUT = { id: 'birefnet_toonout', node: 'BiRefNetRMBG', model: 'BiRefNet_toonout', files: [] };
const PREFIX = 'so-s0';

export const MEMBERS: Record<string, string> = {
    m1: 'Full-body anime character sprite, a young woman adventurer with short red hair and green eyes, green tunic with a brown belt, brown leather boots, standing relaxed, front view, whole body visible from head to feet, plain white background',
    m2: 'Full-body anime character sprite, a tall man knight with short black hair, silver plate armour and a blue cape, steel boots, standing relaxed, front view, whole body visible from head to feet, plain white background',
    m3: 'Full-body anime character sprite, a small girl mage with long silver hair and violet eyes, purple robe with gold trim, pointed hat, standing relaxed, front view, whole body visible from head to feet, plain white background',
};
export const POSES = ['stand_arms_crossed', 'sit_chair', 'kneel_one', 'fight_swing'];
export const EXPRESSIONS = ['happy', 'angry'];
const ARMS = ['p2', 'p3'] as const;
type Arm = typeof ARMS[number];

const dwposeGraph = (reference: string) => ({
    '1': { class_type: 'LoadImage', inputs: { image: reference } },
    '2': { class_type: 'DWPreprocessor', inputs: { image: ['1', 0], detect_hand: 'disable', detect_body: 'enable', detect_face: 'disable', resolution: 1024,
        bbox_detector: 'yolox_l.onnx', pose_estimator: 'dw-ll_ucoco_384.onnx', scale_stick_for_xinsr_cn: 'disable' } },
    '3': { class_type: 'PreviewImage', inputs: { images: ['2', 0] } },
});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = (file: string) => fs.access(file).then(() => true, () => false);
const dir = (...parts: string[]) => path.join(WORK, ...parts);
const log = (...parts: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...parts);

function py(command: string, args: unknown): any {
    const result = spawnSync(PY, [PIXELS, command, JSON.stringify(args)], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (result.status !== 0) throw new Error(`pixels ${command}: ${result.stderr.slice(-400)}`);
    return JSON.parse(result.stdout.trim().split('\n').at(-1) as string);
}

async function upload(file: string, name: string): Promise<string> {
    const form = new FormData();
    form.append('image', new Blob([await fs.readFile(file)], { type: 'image/png' }), name);
    form.append('overwrite', 'true');
    const response = await fetch(`${COMFY}/upload/image`, { method: 'POST', body: form });
    if (!response.ok) throw new Error(`upload ${name}: ${response.status}`);
    return ((await response.json()) as { name: string }).name;
}

async function run(graph: Record<string, unknown>, timeoutMs = 900000): Promise<{ outputs: Record<string, any>; seconds: number }> {
    const started = performance.now();
    const response = await fetch(`${COMFY}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: 'so-s0' }) });
    const queued = (await response.json()) as { prompt_id?: string; error?: unknown; node_errors?: unknown };
    if (!queued.prompt_id) throw new Error(`queue refused: ${JSON.stringify(queued).slice(0, 600)}`);
    while (performance.now() - started < timeoutMs) {
        await sleep(1000);
        const history = (await (await fetch(`${COMFY}/history/${queued.prompt_id}`)).json()) as Record<string, any>;
        const item = history[queued.prompt_id];
        if (item?.status?.status_str === 'error') throw new Error(`render failed: ${JSON.stringify(item.status.messages ?? '').slice(0, 800)}`);
        if (item?.outputs && item.status?.completed) return { outputs: item.outputs, seconds: (performance.now() - started) / 1000 };
    }
    throw new Error('render timed out');
}

async function fetchImage(ref: { filename: string; subfolder: string; type: string }, to: string): Promise<void> {
    const url = `${COMFY}/view?filename=${encodeURIComponent(ref.filename)}&subfolder=${encodeURIComponent(ref.subfolder)}&type=${ref.type}`;
    await fs.writeFile(to, Buffer.from(await (await fetch(url)).arrayBuffer()));
}

const savedImage = (outputs: Record<string, any>) => Object.values(outputs).flatMap((o: any) => o.images ?? []).find((i: any) => i.type === 'output');

async function appendResult(row: Record<string, unknown>): Promise<void> {
    await fs.appendFile(dir('results.jsonl'), JSON.stringify(row) + '\n');
}

function baseGraph(prompt: string, seed: number): Record<string, unknown> {
    const node = (class_type: string, inputs: Record<string, unknown>) => ({ class_type, inputs });
    return {
        '1': node('UNETLoader', { unet_name: MODELS.diffusion.name, weight_dtype: 'default' }),
        '2': node('QwenImage21Cache', { model: ['1', 0], device: 'auto', dtype: 'default' }),
        '3': node('CLIPLoader', { clip_name: MODELS.encoder.name, type: 'qwen_image', device: 'default' }),
        '4': node('VAELoader', { vae_name: MODELS.vae.name }),
        '5': node('TextEncodeQwenImage21', { clip: ['3', 0], prompt, negative_prompt: 'text, watermark, deformed face, cropped, extra limbs, multiple characters', vae: ['4', 0], resolution: 1024 }),
        '6': node('EmptySD3LatentImage', { width: 768, height: 1152, batch_size: 1 }),
        '7': node('KSampler', { model: ['2', 0], seed, steps: STEPS, cfg: 1, sampler_name: 'euler', scheduler: 'simple', positive: ['5', 0], negative: ['5', 1], latent_image: ['6', 0], denoise: 1 }),
        '8': node('VAEDecode', { samples: ['7', 0], vae: ['4', 0] }),
        '9': node('SplitImageWithAlpha', { image: ['8', 0] }),
        '10': node(CUTOUT.node, { image: ['9', 0], model: CUTOUT.model, background: 'Alpha', sensitivity: 1, mask_blur: 0, mask_offset: 0, invert_output: false, refine_foreground: false, background_color: '#ffffff' }),
        '11': node('SaveImage', { filename_prefix: `${PREFIX}-base`, images: ['10', 0] }),
    };
}

async function dwpose(image: string): Promise<Keypoints> {
    const name = await upload(image, `${PREFIX}-dw-${path.basename(image)}`);
    const { outputs } = await run(dwposeGraph(name) as Record<string, unknown>, 300000);
    const raw = Object.values(outputs).flatMap((o: any) => o.openpose_json ?? []).find((value: unknown) => typeof value === 'string');
    if (!raw) throw new Error('DWPose returned no keypoints');
    return readDwpose(raw);
}

async function makeBase(member: string): Promise<void> {
    const out = dir('bases', `${member}.png`);
    if (await exists(out)) return;
    const { outputs, seconds } = await run(baseGraph(MEMBERS[member], SEED + Number(member.slice(1))));
    const image = savedImage(outputs);
    await fetchImage(image, out);
    const box = py('alpha-box', { image: out });
    const keypoints = await dwpose(out);
    await fs.writeFile(dir('bases', `${member}.dwpose.json`), JSON.stringify({ keypoints, box, ratio: headToHipRatio(keypoints) }));
    await appendResult({ kind: 'base', member, seconds, comfyFile: image.filename });
    log('base', member, `${seconds.toFixed(1)}s`, JSON.stringify(box));
}

async function loadPose(id: string): Promise<PoseLike> {
    return JSON.parse(await fs.readFile(path.join(repo, 'assets', 'poses', `${id}.json`), 'utf8'));
}

async function makeBody(member: string, poseId: string, arm: Arm): Promise<{ seconds: number }> {
    const out = dir('bodies', `${member}-${poseId}-${arm}.png`);
    const metaFile = out.replace(/\.png$/, '.json');
    if (await exists(metaFile)) return JSON.parse(await fs.readFile(metaFile, 'utf8'));
    const pose = await loadPose(poseId);
    const base = dir('bases', `${member}.png`);
    const info = JSON.parse(await fs.readFile(dir('bases', `${member}.dwpose.json`), 'utf8'));
    const keypoints = retarget(pose, { canvas: info.box.canvas, box: { x: info.box.x, y: info.box.y, width: info.box.width, height: info.box.height }, headToHip: info.ratio });
    const target = dir('targets', `${member}-${poseId}.json`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(keypoints));
    const reference = await upload(base, `${PREFIX}-${member}-base.png`);
    let skeleton: string | undefined;
    if (arm === 'p2') {
        const png = dir('targets', `${member}-${poseId}.png`);
        py('skeleton', { points: target, out: png });
        skeleton = await upload(png, `${PREFIX}-${member}-${poseId}-skeleton.png`);
    }
    const graph = editGraph({ models: MODELS as never, steps: STEPS, seed: SEED, reference, instruction: editInstruction('pose', pose.text), cutout: CUTOUT as never, resolution: 1024,
        ...(skeleton ? { skeleton } : {}), secondReference: arm === 'p3' });
    const { outputs, seconds } = await run(graph);
    const image = savedImage(outputs);
    const raw = dir('raw', `${member}-${poseId}-${arm}.png`);
    await fs.mkdir(path.dirname(raw), { recursive: true });
    await fetchImage(image, raw);
    py('resize-to', { base, image: raw, out });
    const qa = py('qa', { image: out });
    const row = { kind: 'body', member, pose: poseId, arm, seconds, qa, comfyFile: image.filename };
    await fs.writeFile(metaFile, JSON.stringify(row));
    await appendResult(row);
    log('body', member, poseId, arm, `${seconds.toFixed(1)}s`, qa.ok ? 'qa ok' : `qa FAIL ${qa.reasons.join('; ')}`);
    return row;
}

async function makeHead(member: string, poseId: string, arm: Arm, expression: string, boxFrom: 'target' | 'output' = 'target'): Promise<void> {
    const stem = `${member}-${poseId}-${arm}`;
    const folder = boxFrom === 'output' ? 'heads-outbox' : 'heads';
    const out = dir(folder, `${stem}-${expression}.png`);
    const metaFile = out.replace(/\.png$/, '.json');
    if (await exists(metaFile)) return;
    const body = dir('bodies', `${stem}.png`);
    const target = JSON.parse(await fs.readFile(dir('targets', `${member}-${poseId}.json`), 'utf8')) as Keypoints;
    const found = boxFrom === 'output' ? (JSON.parse(await fs.readFile(dir('scores', `${stem}.json`), 'utf8')).found as Keypoints | null) : null;
    const box = (found ? poseHead(found) : poseHead(target)) as Box;
    const cropFile = dir(folder, `${stem}-${expression}.crop.png`);
    await fs.mkdir(path.dirname(out), { recursive: true });
    py('crop', { image: body, box, out: cropFile });
    const reference = await upload(cropFile, `${PREFIX}-${stem}-${expression}-crop.png`);
    const graph = editGraph({ models: MODELS as never, steps: STEPS, seed: SEED, reference, instruction: editInstruction('expression', `facial expression: ${expression}`), resolution: 1024 });
    const { outputs, seconds } = await run(graph);
    const image = savedImage(outputs);
    const raw = dir('raw', `${stem}-${expression}${boxFrom === 'output' ? '-outbox' : ''}.png`);
    await fetchImage(image, raw);
    const pasted = py('paste', { base: body, edit: raw, box, out });
    const row = { kind: boxFrom === 'output' ? 'head-outbox' : 'head', member, pose: poseId, arm, expression, seconds, box, changed: pasted.changed, qaOk: pasted.changed >= 5, comfyFile: image.filename };
    await fs.writeFile(metaFile, JSON.stringify(row));
    await appendResult(row);
    log('head', stem, expression, `${seconds.toFixed(1)}s`, `changed ${pasted.changed}`);
}

async function scoreBodies(): Promise<void> {
    for (const member of Object.keys(MEMBERS)) for (const poseId of POSES) for (const arm of ARMS) {
        const body = dir('bodies', `${member}-${poseId}-${arm}.png`), file = dir('scores', `${member}-${poseId}-${arm}.json`);
        if (!await exists(body) || await exists(file)) continue;
        const target = JSON.parse(await fs.readFile(dir('targets', `${member}-${poseId}.json`), 'utf8')) as Keypoints;
        const raw = dir('raw', `${member}-${poseId}-${arm}.png`);
        let found: Keypoints | null = null, error: string | null = null;
        try { found = await dwpose(await exists(raw) ? body : body); } catch (e) { error = (e as Error).message; }
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify({ member, pose: poseId, arm, pck: found ? posePck(found, target) : 0, error, found }));
        log('score', member, poseId, arm, found ? posePck(found, target).toFixed(2) : `none (${error})`);
    }
}

async function rows(): Promise<any[]> {
    const text = await fs.readFile(dir('results.jsonl'), 'utf8').catch(() => '');
    return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

async function summary(vram: number | null): Promise<void> {
    const all = await rows();
    const bodies = all.filter((r) => r.kind === 'body'), heads = all.filter((r) => r.kind === 'head');
    const scores: any[] = [];
    for (const f of await fs.readdir(dir('scores')).catch(() => [])) scores.push(JSON.parse(await fs.readFile(dir('scores', f), 'utf8')));
    const byArm = (arm: string) => scores.filter((s) => s.arm === arm).map((s) => s.pck);
    const shape = (arm: string) => scores.filter((x) => x.arm === arm && x.found).map((x) => shapePck(x.found, JSON.parse(readFileSync(dir('targets', `${x.member}-${x.pose}.json`), 'utf8'))));
    const mean = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
    const rates = (arm: string) => bodies.filter((b) => b.arm === arm);
    const identity = JSON.parse(await fs.readFile(dir('ratings.json'), 'utf8').catch(() => 'null'));
    const idRate = (arm: string) => identity ? Object.values<any>(identity.identity).filter((x) => x.arm === arm).reduce((a, x) => a + (x.same ? 1 : 0), 0) / Math.max(1, Object.values<any>(identity.identity).filter((x) => x.arm === arm).length) : null;
    const labels = identity ? Object.values<any>(identity.labels) : [];
    const labelRate = labels.length ? labels.filter((x) => x.visible).length / labels.length : null;
    const outbox = identity?.labelsOutbox ?? {};
    const labelOutboxRate = labels.length ? Object.entries<any>(identity.labels).filter(([key, x]) => (key in outbox ? outbox[key] : x.visible)).length / labels.length : null;
    const bodyS = bodies.map((b) => b.seconds), headS = heads.map((h) => h.seconds);
    const result = {
        bodies: bodies.length, heads: heads.length, bodySeconds: { median: median(bodyS), p90: percentile(bodyS, 0.9), min: Math.min(...bodyS), max: Math.max(...bodyS) },
        headSeconds: { median: median(headS), p90: percentile(headS, 0.9) }, peakVramGb: vram, pckMean: { p2: mean(byArm('p2')), p3: mean(byArm('p3')) }, shapePckMean: { p2: mean(shape('p2')), p3: mean(shape('p3')) },
        qaRate: { p2: rates('p2').filter((b) => b.qa.ok).length / Math.max(1, rates('p2').length), p3: rates('p3').filter((b) => b.qa.ok).length / Math.max(1, rates('p3').length) },
        headQaRate: heads.filter((h) => h.qaOk).length / Math.max(1, heads.length), identity: { p2: idRate('p2'), p3: idRate('p3') }, labelVisible: labelRate, labelVisibleOutputBox: labelOutboxRate,
    };
    const v = verdict({ identity2: result.identity.p2, identity3: result.identity.p3, pck2: result.pckMean.p2, pck3: result.pckMean.p3, qa2: result.qaRate.p2, qa3: result.qaRate.p3,
        medianBody: result.bodySeconds.median, p90Body: result.bodySeconds.p90, peakVramGb: vram, labelVisible: labelRate });
    console.log(JSON.stringify({ result, verdict: v }, null, 2));
    await fs.writeFile(dir('summary.json'), JSON.stringify({ result, verdict: v }, null, 2));
}

async function sheets(): Promise<void> {
    for (const member of Object.keys(MEMBERS)) for (const poseId of POSES) {
        const items = [{ label: `${member} base`, path: dir('bases', `${member}.png`) }];
        for (const arm of ARMS) {
            const stem = `${member}-${poseId}-${arm}`;
            items.push({ label: `${poseId} ${arm}`, path: dir('bodies', `${stem}.png`) });
        }
        items.push({ label: 'target skeleton', path: dir('targets', `${member}-${poseId}.png`) });
        const heads: { label: string; path: string; box?: Box }[] = [];
        for (const arm of ARMS) for (const ex of EXPRESSIONS) {
            const file = dir('heads', `${member}-${poseId}-${arm}-${ex}`);
            const meta = await fs.readFile(`${file}.json`, 'utf8').then(JSON.parse, () => null);
            heads.push({ label: `${arm} ${ex}`, path: `${file}.png`, ...(meta ? { box: meta.box } : {}) });
        }
        await fs.mkdir(dir('sheets'), { recursive: true });
        const present = <T extends { path: string }>(list: T[]) => Promise.all(list.map((i) => exists(i.path))).then((flags) => list.filter((_, at) => flags[at]));
        const [bodyItems, headItems] = [await present(items), await present(heads)];
        if (bodyItems.length > 2) py('sheet', { items: bodyItems, out: dir('sheets', `${member}-${poseId}-bodies.png`), cell: 384 });
        if (headItems.length) py('sheet', { items: headItems, out: dir('sheets', `${member}-${poseId}-heads.png`), cell: 384 });
    }
}

async function main(): Promise<void> {
    const [command = 'help', ...rest] = process.argv.slice(2);
    await fs.mkdir(WORK, { recursive: true });
    for (const sub of ['bases', 'bodies', 'heads', 'targets', 'raw', 'scores']) await fs.mkdir(dir(sub), { recursive: true });
    if (command === 'bases') { for (const member of Object.keys(MEMBERS)) await makeBase(member); return; }
    if (command === 'body') { await makeBody(rest[0], rest[1], rest[2] as Arm); return; }
    if (command === 'quote') {
        const all = await rows();
        const deadline = new Date(); const [h, m] = (rest[0] ?? '12:40').split(':').map(Number); deadline.setHours(h, m, 0, 0);
        const bodies = Object.keys(MEMBERS).length * POSES.length * ARMS.length;
        const q = quote({ bodySeconds: all.filter((r) => r.kind === 'body').map((r) => r.seconds), headSeconds: all.filter((r) => r.kind === 'head').map((r) => r.seconds), bodies, heads: bodies * EXPRESSIONS.length, deadlineMs: deadline.getTime(), nowMs: Date.now() });
        console.log(JSON.stringify({ bodies, heads: bodies * EXPRESSIONS.length, ...q, finishesAt: new Date(q.finishesAtMs).toTimeString().slice(0, 8) }));
        return;
    }
    if (command === 'bodies') {
        for (const poseId of POSES) for (const member of Object.keys(MEMBERS)) for (const arm of ARMS) await makeBody(member, poseId, arm);
        return;
    }
    if (command === 'heads-outbox') {
        const ratings = JSON.parse(await fs.readFile(dir('ratings.json'), 'utf8')).labels as Record<string, { visible: boolean }>;
        for (const [key, value] of Object.entries(ratings)) if (!value.visible) {
            const [member, poseId, arm, expression] = key.split('-');
            await makeHead(member, poseId, arm as Arm, expression, 'output');
        }
        return;
    }
    if (command === 'head') { await makeHead(rest[0], rest[1], rest[2] as Arm, rest[3]); return; }
    if (command === 'heads') {
        const limit = Number(rest[0] ?? Infinity);
        let n = 0;
        for (const poseId of POSES) for (const member of Object.keys(MEMBERS)) for (const arm of ARMS) for (const ex of EXPRESSIONS) { if (n++ >= limit) return; await makeHead(member, poseId, arm, ex); }
        return;
    }
    if (command === 'score') { await scoreBodies(); return; }
    if (command === 'sheets') { await sheets(); return; }
    if (command === 'summary') { await summary(rest[0] ? Number(rest[0]) : null); return; }
    if (command === 'vram') {
        const out = dir('vram.csv');
        const child = spawn('nvidia-smi', ['--query-gpu=timestamp,memory.used', '--format=csv,noheader,nounits', '-lms', '500'], { stdio: ['ignore', (await fs.open(out, 'a')).fd, 'ignore'], detached: true });
        child.unref();
        console.log(`sampling pid ${child.pid}`);
        return;
    }
    if (command === 'vram-peak') { console.log(peakFromSamples(await fs.readFile(dir('vram.csv'), 'utf8')) ?? 'none'); return; }
    console.log('commands: bases | body <m> <pose> <arm> | bodies | heads [n] | score | sheets | summary [vramGb] | quote [HH:MM] | vram | vram-peak');
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exit(1); });
