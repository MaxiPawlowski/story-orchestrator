import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { editGraph, editInstruction } from './lib/poseS0Graph.mts';
import { ARMS, armOf, packPrompt, PACK_VIEWS, rgbaPrompt, t2iGraph, WHO, type PackView } from './lib/poseS0Models.mts';
import { readDwpose, posePck, shapePck, headToHipRatio, poseHead, retarget, median, percentile, quote, peakFromSamples, verdict, type Keypoints, type PoseLike, type Box } from './lib/poseS0.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const COMFY = process.env.SO_COMFY_URL ?? 'http://127.0.0.1:8188';
const WORK = process.env.SO_S0_DIR ?? 'C:/dev/so-s0';
const PY = process.env.SO_COMFY_PY ?? 'C:/dev/tools/story-orchestrator-local/comfy-cu130/Scripts/python.exe';
const PIXELS = path.join(here, 'lib', 'poseS0Pixels.py');
const SEED = Number(process.env.SO_S0_SEED ?? 1234);
const ARM = armOf(process.env.SO_S0_ARM);
const MODELS = ARM.models;
const STEPS = ARM.steps;
const RUN = process.env.SO_S0_RUN ?? 'r1';
const BASES = process.env.SO_S0_BASES ?? path.join(WORK, 'bases');
const PACKDIR = process.env.SO_S0_PACKDIR;
const CUTOUT = { id: 'birefnet_toonout', node: 'BiRefNetRMBG', model: 'BiRefNet_toonout', files: [] };
const PREFIX = `so-s0-${ARM.id}`;
const VARIANT = RUN === 'r1' ? {} : { variant: RUN };

export const MEMBERS: Record<string, string> = {
    m1: 'Full-body anime character sprite, a young woman adventurer with short red hair and green eyes, green tunic with a brown belt, brown leather boots, standing relaxed, front view, whole body visible from head to feet, plain white background',
    m2: 'Full-body anime character sprite, a tall man knight with short black hair, silver plate armour and a blue cape, steel boots, standing relaxed, front view, whole body visible from head to feet, plain white background',
    m3: 'Full-body anime character sprite, a small girl mage with long silver hair and violet eyes, purple robe with gold trim, pointed hat, standing relaxed, front view, whole body visible from head to feet, plain white background',
};
const PILOT_POSES = ['stand_arms_crossed', 'sit_chair', 'kneel_one', 'fight_swing'];
const FULL_POSES = ['stand_arms_crossed', 'sit_chair', 'kneel_one', 'fight_swing', 'cast_two_hands', 'crouch', 'walk', 'lie_side'];
export const POSES = process.env.SO_S0_POSES === 'full' ? FULL_POSES : process.env.SO_S0_POSES ? process.env.SO_S0_POSES.split(',') : PILOT_POSES;
export const EXPRESSIONS = ['happy', 'angry'];
const ARM_IDS = (process.env.SO_S0_PARMS ?? 'p2,p3').split(',') as ('p2' | 'p3')[];
const ARMS_P = ARM_IDS;
type Arm = 'p2' | 'p3';
const CHAIN_EXPRESSIONS = ['neutral', 'happy', 'angry', 'worried'];
const FRAMES = [{ id: 'blink', text: 'the eyes closed in a blink' }, { id: 'talk', text: 'the mouth open as if speaking' }];
const LOOK_TEXT = 'a dark hooded travel cloak worn over the current outfit';

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
const readJson = async (file: string) => JSON.parse(await fs.readFile(file, 'utf8'));

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

async function run(graph: Record<string, unknown>, timeoutMs = 1800000): Promise<{ outputs: Record<string, any>; seconds: number }> {
    const started = performance.now();
    const response = await fetch(`${COMFY}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: 'so-s0' }) });
    const queued = (await response.json()) as { prompt_id?: string; error?: unknown; node_errors?: unknown };
    if (!queued.prompt_id) throw new Error(`queue refused: ${JSON.stringify(queued).slice(0, 600)}`);
    while (performance.now() - started < timeoutMs) {
        await sleep(500);
        const history = (await (await fetch(`${COMFY}/history/${queued.prompt_id}`)).json()) as Record<string, any>;
        const item = history[queued.prompt_id];
        if (item?.status?.status_str === 'error') throw new Error(`render failed: ${JSON.stringify(item.status.messages ?? '').slice(0, 800)}`);
        if (item?.outputs && item.status?.completed) return { outputs: item.outputs, seconds: (performance.now() - started) / 1000 };
    }
    throw new Error('render timed out');
}

async function fetchImage(ref: { filename: string; subfolder: string; type: string }, to: string): Promise<void> {
    const url = `${COMFY}/view?filename=${encodeURIComponent(ref.filename)}&subfolder=${encodeURIComponent(ref.subfolder)}&type=${ref.type}`;
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.writeFile(to, Buffer.from(await (await fetch(url)).arrayBuffer()));
}

const savedImage = (outputs: Record<string, any>) => Object.values(outputs).flatMap((o: any) => o.images ?? []).find((i: any) => i.type === 'output');

async function appendResult(row: Record<string, unknown>): Promise<void> {
    await fs.appendFile(dir('results.jsonl'), JSON.stringify({ model: ARM.id, recipe: ARM.recipe, run: RUN, seed: SEED, ...row }) + '\n');
}

const upName = (stem: string) => `${PREFIX}-${RUN}-${SEED}-${stem}`;

function baseGraph(prompt: string, seed: number): Record<string, unknown> {
    return t2iGraph({ arm: ARMS.b, prompt, seed, width: 768, height: 1152, cutout: CUTOUT, prefix: `${PREFIX}-base`, ...VARIANT });
}

async function dwpose(image: string): Promise<Keypoints> {
    const name = await upload(image, `${PREFIX}-dw-${path.basename(image)}`);
    const { outputs } = await run(dwposeGraph(name) as Record<string, unknown>, 300000);
    const raw = Object.values(outputs).flatMap((o: any) => o.openpose_json ?? []).find((value: unknown) => typeof value === 'string');
    if (!raw) throw new Error('DWPose returned no keypoints');
    return readDwpose(raw);
}

async function makeBase(member: string): Promise<void> {
    const out = path.join(BASES, `${member}.png`);
    if (await exists(out)) return;
    await fs.mkdir(BASES, { recursive: true });
    const { outputs, seconds } = await run(baseGraph(MEMBERS[member], SEED + Number(member.slice(1))));
    const image = savedImage(outputs);
    await fetchImage(image, out);
    const box = py('alpha-box', { image: out });
    const keypoints = await dwpose(out);
    await fs.writeFile(path.join(BASES, `${member}.dwpose.json`), JSON.stringify({ keypoints, box, ratio: headToHipRatio(keypoints) }));
    await appendResult({ kind: 'base', member, seconds, comfyFile: image.filename });
    log('base', member, `${seconds.toFixed(1)}s`, JSON.stringify(box));
}

async function loadPose(id: string): Promise<PoseLike> {
    return JSON.parse(await fs.readFile(path.join(repo, 'assets', 'poses', `${id}.json`), 'utf8'));
}

const packRefs = (member: string, ids: string[]): string[] => ids.map((id) => path.join(PACKDIR as string, `${member}-s${SEED}-${id}.png`));

async function makeBody(member: string, poseId: string, arm: Arm): Promise<{ seconds: number }> {
    const out = dir('bodies', `${member}-${poseId}-${arm}.png`);
    const metaFile = out.replace(/\.png$/, '.json');
    if (await exists(metaFile)) return JSON.parse(await fs.readFile(metaFile, 'utf8'));
    const pose = await loadPose(poseId);
    const base = path.join(BASES, `${member}.png`);
    const info = JSON.parse(await fs.readFile(path.join(BASES, `${member}.dwpose.json`), 'utf8'));
    const standing = (await loadPose('stand_relaxed')).keypoints;
    const measured: Keypoints | undefined = info.keypoints ? { ...info.keypoints, points: info.keypoints.points.map((p: [number, number] | null) => p ? [Math.round(p[0]), Math.round(p[1])] : null) } : undefined;
    const keypoints = retarget(pose, { canvas: info.box.canvas, box: { x: info.box.x, y: info.box.y, width: info.box.width, height: info.box.height }, headToHip: info.ratio, member: measured }, standing);
    const target = dir('targets', `${member}-${poseId}.json`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(keypoints));
    const reference = await upload(base, upName(`${member}-base.png`));
    let skeleton: string | undefined;
    if (arm === 'p2') {
        const png = dir('targets', `${member}-${poseId}.png`);
        py('skeleton', { points: target, out: png });
        skeleton = await upload(png, upName(`${member}-${poseId}-skeleton.png`));
    }
    const references = PACKDIR ? await Promise.all(packRefs(member, ['bust_front', 'three_quarter', 'side']).map((file, at) => upload(file, upName(`${member}-pack${at}.png`)))) : undefined;
    const graph = editGraph({ models: MODELS as never, steps: STEPS, seed: SEED, reference, instruction: editInstruction('pose', pose.text), cutout: CUTOUT as never, resolution: 1024,
        ...(skeleton ? { skeleton } : {}), secondReference: arm === 'p3', ...(ARM.sigmas ? { sigmas: ARM.sigmas } : {}), ...(references ? { references } : {}), prefix: `${PREFIX}-body` });
    const { outputs, seconds } = await run(graph);
    const image = savedImage(outputs);
    const raw = dir('raw', `${member}-${poseId}-${arm}.png`);
    await fetchImage(image, raw);
    py('resize-to', { base, image: raw, out });
    const qa = py('qa', { image: out });
    const row = { kind: 'body', member, pose: poseId, arm, seconds, qa, comfyFile: image.filename, refs: references?.length ?? 0 };
    await fs.writeFile(metaFile, JSON.stringify(row));
    await appendResult(row);
    log('body', member, poseId, arm, `${seconds.toFixed(1)}s`, qa.ok ? 'qa ok' : `qa FAIL ${qa.reasons.join('; ')}`);
    return row;
}

async function makeHead(member: string, poseId: string, arm: Arm, expression: string, boxFrom: 'target' | 'output' = 'output'): Promise<void> {
    const stem = `${member}-${poseId}-${arm}`;
    const folder = boxFrom === 'output' ? 'heads' : 'heads-target';
    const out = dir(folder, `${stem}-${expression}.png`);
    const metaFile = out.replace(/\.png$/, '.json');
    if (await exists(metaFile)) return;
    const body = dir('bodies', `${stem}.png`);
    const target = JSON.parse(await fs.readFile(dir('targets', `${member}-${poseId}.json`), 'utf8')) as Keypoints;
    let found: Keypoints | null = null;
    if (boxFrom === 'output') {
        const scoreFile = dir('scores', `${stem}.json`);
        if (!await exists(scoreFile)) await scoreBodies();
        found = JSON.parse(await fs.readFile(scoreFile, 'utf8')).found as Keypoints | null;
    }
    const box = (boxFrom === 'output' ? (found ? poseHead(found) : null) : poseHead(target)) as Box | null;
    await fs.mkdir(path.dirname(out), { recursive: true });
    if (!box) {
        const skipped = { kind: 'head-skipped', member, pose: poseId, arm, expression, reason: found ? 'no head joints' : 'no person found' };
        await fs.writeFile(metaFile, JSON.stringify(skipped));
        await appendResult(skipped);
        log('head skipped', stem, expression, skipped.reason);
        return;
    }
    const cropFile = dir(folder, `${stem}-${expression}.crop.png`);
    py('crop', { image: body, box, out: cropFile });
    const reference = await upload(cropFile, upName(`${stem}-${expression}-crop.png`));
    const references = PACKDIR ? await Promise.all(packRefs(member, ['bust_front', 'expr_happy', 'expr_angry']).map((file, at) => upload(file, upName(`${member}-hpack${at}.png`)))) : undefined;
    const graph = editGraph({ models: MODELS as never, steps: STEPS, seed: SEED, reference, instruction: editInstruction('expression', `facial expression: ${expression}`), resolution: 1024,
        ...(ARM.sigmas ? { sigmas: ARM.sigmas } : {}), ...(references ? { references } : {}), prefix: `${PREFIX}-head` });
    const { outputs, seconds } = await run(graph);
    const image = savedImage(outputs);
    const raw = dir('raw', `${stem}-${expression}${boxFrom === 'output' ? '' : '-target'}.png`);
    await fetchImage(image, raw);
    const pasted = py('paste', { base: body, edit: raw, box, out });
    const row = { kind: 'head', member, pose: poseId, arm, expression, seconds, box, boxFrom, changed: pasted.changed, qaOk: pasted.changed >= 5, comfyFile: image.filename };
    await fs.writeFile(metaFile, JSON.stringify(row));
    await appendResult(row);
    log('head', stem, expression, `${seconds.toFixed(1)}s`, `changed ${pasted.changed}`);
}

async function scoreBodies(): Promise<void> {
    for (const member of Object.keys(MEMBERS)) for (const poseId of POSES) for (const arm of ARMS_P) {
        const body = dir('bodies', `${member}-${poseId}-${arm}.png`), file = dir('scores', `${member}-${poseId}-${arm}.json`);
        if (!await exists(body) || await exists(file)) continue;
        const target = JSON.parse(await fs.readFile(dir('targets', `${member}-${poseId}.json`), 'utf8')) as Keypoints;
        let found: Keypoints | null = null, error: string | null = null;
        try { found = await dwpose(body); } catch (e) { error = (e as Error).message; }
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
    const byPose = (arm: string) => Object.fromEntries([...new Set(scores.map((s) => s.pose))].map((pose) => [pose, scores.filter((s) => s.arm === arm && s.pose === pose).reduce((a, s) => a + s.pck, 0) / Math.max(1, scores.filter((s) => s.arm === arm && s.pose === pose).length)]));
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
        model: ARM.id, recipe: ARM.recipe, bodies: bodies.length, heads: heads.length, bodySeconds: { median: median(bodyS), p90: percentile(bodyS, 0.9), min: Math.min(...bodyS), max: Math.max(...bodyS) },
        headSeconds: { median: median(headS), p90: percentile(headS, 0.9) }, peakVramGb: vram, pckMean: { p2: mean(byArm('p2')), p3: mean(byArm('p3')) }, pckByPose: { p2: byPose('p2'), p3: byPose('p3') },
        shapePckMean: { p2: mean(shape('p2')), p3: mean(shape('p3')) },
        qaRate: { p2: rates('p2').filter((b) => b.qa.ok).length / Math.max(1, rates('p2').length), p3: rates('p3').filter((b) => b.qa.ok).length / Math.max(1, rates('p3').length) },
        headQaRate: heads.filter((h) => h.qaOk).length / Math.max(1, heads.length), headsSkipped: all.filter((r) => r.kind === 'head-skipped').length, identity: { p2: idRate('p2'), p3: idRate('p3') }, labelVisible: labelRate, labelVisibleOutputBox: labelOutboxRate,
    };
    const v = verdict({ identity2: result.identity.p2, identity3: result.identity.p3, pck2: result.pckMean.p2, pck3: result.pckMean.p3, qa2: result.qaRate.p2, qa3: result.qaRate.p3,
        medianBody: result.bodySeconds.median, p90Body: result.bodySeconds.p90, peakVramGb: vram, labelVisible: labelRate });
    console.log(JSON.stringify({ result, verdict: v }, null, 2));
    await fs.writeFile(dir('summary.json'), JSON.stringify({ result, verdict: v }, null, 2));
}

async function sheets(): Promise<void> {
    for (const member of Object.keys(MEMBERS)) for (const poseId of POSES) {
        const items = [{ label: `${member} base`, path: path.join(BASES, `${member}.png`) }];
        for (const arm of ARMS_P) {
            const stem = `${member}-${poseId}-${arm}`;
            items.push({ label: `${poseId} ${arm}`, path: dir('bodies', `${stem}.png`) });
        }
        items.push({ label: 'target skeleton', path: dir('targets', `${member}-${poseId}.png`) });
        const heads: { label: string; path: string; box?: Box }[] = [];
        for (const arm of ARMS_P) for (const ex of EXPRESSIONS) {
            const file = dir('heads', `${member}-${poseId}-${arm}-${ex}`);
            const meta = await fs.readFile(`${file}.json`, 'utf8').then(JSON.parse, () => null);
            heads.push({ label: `${arm} ${ex}`, path: `${file}.png`, ...(meta?.box ? { box: meta.box } : {}) });
        }
        await fs.mkdir(dir('sheets'), { recursive: true });
        const present = <T extends { path: string }>(list: T[]) => Promise.all(list.map((i) => exists(i.path))).then((flags) => list.filter((_, at) => flags[at]));
        const [bodyItems, headItems] = [await present(items), await present(heads)];
        if (bodyItems.length > 2) py('sheet', { items: bodyItems, out: dir('sheets', `${member}-${poseId}-bodies.png`), cell: 384 });
        if (headItems.length) py('sheet', { items: headItems, out: dir('sheets', `${member}-${poseId}-heads.png`), cell: 384 });
    }
}

const MODE = process.env.SO_S0_PACK_MODE ?? 'edit';
const NATIVE = process.env.SO_S0_ALPHA === 'native';

async function makePackImage(member: string, view: PackView): Promise<void> {
    const stem = `${member}-s${SEED}-${view.id}`;
    const out = dir('pack', `${stem}.png`);
    const metaFile = dir('pack', `${stem}.json`);
    if (await exists(metaFile)) return;
    const seed = SEED + Number(member.slice(1));
    const cutout = NATIVE ? undefined : CUTOUT;
    let graph: Record<string, unknown>;
    if (MODE === 't2i') {
        const prompt = NATIVE ? rgbaPrompt(packPrompt(member, view)) : packPrompt(member, view);
        graph = t2iGraph({ arm: ARM, prompt, seed, width: view.width, height: view.height, ...(cutout ? { cutout } : {}), prefix: `${PREFIX}-pack`, ...VARIANT });
    } else {
        const reference = await upload(path.join(BASES, `${member}.png`), upName(`${member}-card.png`));
        graph = editGraph({ models: MODELS as never, steps: STEPS, seed, reference, instruction: editInstruction('view', view.edit), resolution: 1024, ...(ARM.sigmas ? { sigmas: ARM.sigmas } : {}),
            ...(cutout ? { cutout } : {}), prefix: `${PREFIX}-pack` });
    }
    const { outputs, seconds } = await run(graph);
    const image = savedImage(outputs);
    await fetchImage(image, out);
    const alpha = py('qa-alpha', { image: out, allowEdge: view.head });
    const row = { kind: 'pack', mode: MODE, native: NATIVE, member, view: view.id, seconds, alpha, comfyFile: image.filename };
    await fs.writeFile(metaFile, JSON.stringify(row));
    await appendResult(row);
    log('pack', member, view.id, `${seconds.toFixed(1)}s`, alpha.ok ? 'alpha ok' : `alpha FAIL ${alpha.reasons.join('; ')}`);
}

async function chainTask(task: string, member: string, produce: () => Promise<{ file: string; seconds: number; extra?: Record<string, unknown> }>): Promise<string> {
    const metaFile = dir('chain', `${member}-${task}.json`);
    if (await exists(metaFile)) return (await readJson(metaFile)).file;
    await fs.mkdir(dir('chain'), { recursive: true });
    const made = await produce();
    const row = { kind: 'task', task, member, seconds: made.seconds, file: made.file, ...made.extra };
    await fs.writeFile(metaFile, JSON.stringify(row));
    await appendResult(row);
    log('task', task, member, `${made.seconds.toFixed(1)}s`);
    return made.file;
}

async function editStep(parts: { stem: string; refs: string[]; instruction: string; cutout?: boolean; latent?: { width: number; height: number }; negative?: string }): Promise<{ file: string; seconds: number }> {
    const names = await Promise.all(parts.refs.map((file, at) => upload(file, upName(`${parts.stem}-ref${at}.png`))));
    const graph = editGraph({ models: MODELS as never, steps: STEPS, seed: SEED, reference: names[0], references: names.slice(1), instruction: parts.instruction, resolution: 1024,
        ...(ARM.sigmas ? { sigmas: ARM.sigmas } : {}), ...(parts.cutout ? { cutout: CUTOUT as never } : {}), ...(parts.latent ? { latent: parts.latent } : {}),
        ...(parts.negative ? { negative: parts.negative } : {}), prefix: `${PREFIX}-${parts.stem}` });
    const { outputs, seconds } = await run(graph);
    const file = dir('chain', `${parts.stem}.png`);
    await fetchImage(savedImage(outputs), file);
    return { file, seconds };
}

async function headEdit(member: string, source: string, stem: string, text: string, packIds: string[]): Promise<{ file: string; seconds: number; extra: Record<string, unknown> }> {
    const info = await readJson(dir('chain', `${member}-head-box.json`)).catch(async () => {
        const keypoints = await dwpose(source);
        const box = poseHead(keypoints);
        if (!box) throw new Error(`no head found on ${source}`);
        await fs.writeFile(dir('chain', `${member}-head-box.json`), JSON.stringify({ box }));
        return { box };
    });
    const box = info.box as Box;
    const cropFile = dir('chain', `${stem}.crop.png`);
    py('crop', { image: source, box, out: cropFile });
    const refs = [cropFile, ...(PACKDIR ? packRefs(member, packIds) : [])];
    const edited = await editStep({ stem: `${stem}-edit`, refs, instruction: editInstruction('expression', text) });
    const out = dir('chain', `${stem}.png`);
    const pasted = py('paste', { base: source, edit: edited.file, box, out });
    return { file: out, seconds: edited.seconds, extra: { changed: pasted.changed, box } };
}

async function chain(): Promise<void> {
    const cardDir = process.env.SO_S0_CARDART;
    if (!cardDir) throw new Error('SO_S0_CARDART must hold <member>-s<seed>-bust_front.png card art');
    const members = Object.keys(MEMBERS);
    for (const member of members) {
        const art = dir('chain', `${member}-card.png`);
        await fs.mkdir(dir('chain'), { recursive: true });
        if (!await exists(art)) py('flatten', { image: path.join(cardDir, `${member}-s${SEED}-bust_front.png`), out: art });
        const shared = process.env.SO_S0_CHAIN_BASE;
        const baseFile = await chainTask('card_base', member, async () => {
            if (shared) { const from = path.join(shared, 'chain', `${member}-card_base.png`); const meta = await readJson(path.join(shared, 'chain', `${member}-card_base.json`)); await fs.copyFile(from, dir('chain', `${member}-card_base.png`)); return { file: dir('chain', `${member}-card_base.png`), seconds: 0, extra: { shared: true, sharedSeconds: meta.seconds } }; }
            const made = await editStep({ stem: `${member}-card_base`, refs: [art], instruction: editInstruction('view', 'a full-body neutral standing sprite, front view, whole body visible from head to feet, relaxed pose'), cutout: true });
            return made;
        });
        const sprites: Record<string, string> = {};
        for (const label of CHAIN_EXPRESSIONS) {
            sprites[label] = label === 'neutral' ? baseFile : await chainTask(`expr_${label}`, member, () => headEdit(member, baseFile, `${member}-expr_${label}`, `facial expression: ${label}`, ['bust_front', 'expr_happy', 'expr_angry']));
        }
        for (const frame of FRAMES) await chainTask(`frame_${frame.id}`, member, () => headEdit(member, sprites.happy, `${member}-frame_${frame.id}`, frame.text, ['bust_front', 'expr_happy', 'expr_angry']));
        await chainTask('look', member, async () => editStep({ stem: `${member}-look`, refs: [baseFile, ...(PACKDIR ? packRefs(member, ['bust_front', 'three_quarter', 'side']) : [])], instruction: editInstruction('look', LOOK_TEXT), cutout: true }));
    }
    const [a, b] = members.slice(0, 2);
    const sceneRefs = (member: string) => [dir('chain', `${member}-card_base.png`), ...(PACKDIR ? packRefs(member, ['bust_front']) : [])];
    const refsA = sceneRefs(a), refsB = sceneRefs(b);
    const refs = PACKDIR ? [refsA[0], refsB[0], refsA[1], refsB[1]] : [refsA[0], refsB[0]];
    const text = PACKDIR ? 'Image 1 and image 3 show the same first character; image 2 and image 4 show the same second character. ' : 'Image 1 shows the first character and image 2 the second character. ';
    await chainTask('scene', 'm1m2', async () => editStep({ stem: 'scene', refs, instruction: editInstruction('scene', `${text}Show both characters standing side by side in an old stone courtyard at dusk, full bodies visible, anime illustration, no text.`), latent: { width: 1152, height: 768 } }));
}

async function latency(): Promise<void> {
    const all = await rows();
    const groups = new Map<string, number[]>();
    for (const r of all) {
        if (typeof r.seconds !== 'number') continue;
        const key = r.kind === 'task' ? `task:${String(r.task).replace(/_(neutral|happy|angry|worried|blink|talk)$/, '')}` : r.kind === 'pack' ? `pack:${r.view}` : `${r.kind}`;
        groups.set(key, [...(groups.get(key) ?? []), r.seconds]);
    }
    const out = Object.fromEntries([...groups].map(([key, values]) => [key, { n: values.length, median: Number(median(values).toFixed(1)), p90: Number(percentile(values, 0.9).toFixed(1)) }]));
    console.log(JSON.stringify({ model: ARM.id, recipe: ARM.recipe, run: RUN, seed: SEED, latency: out }, null, 2));
}

const PACK_PROMPT = (labels: string[]) => `You are an independent rater for an AI character-art pipeline. The attached grid has a first row "reference" with one panel: the original character art, then ${labels.length} rows labelled ${labels.join(', ')}. Each of those rows is a set of six images made by one generator, in this column order: neutral full body, front bust, three-quarter full body, side full body, happy head, angry head (the column captions are printed). Judge only from the pictures.
For each row answer: consistent_within_row (true only if all six images clearly show one and the same character); same_as_reference (an array of six booleans, true only if hair, face and outfit clearly match the reference art); view_ok (six booleans: the column's requested view or expression is shown); clean (six booleans: plain light background, no halo, fringe, leftover shadow or cropped limbs).
For each column also rank the rows from best to worst overall visual quality (anatomy, clean line art, appeal), as an array of row labels.
Reply with one JSON object only, no prose, in exactly this shape: {"rows":{"R1":{"consistent_within_row":true,"same_as_reference":[true,true,true,true,true,true],"view_ok":[true,true,true,true,true,true],"clean":[true,true,true,true,true,true]}},"rank_by_column":[["R1"],["R1"],["R1"],["R1"],["R1"],["R1"]]}`;

const hashOf = (text: string): number => [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const shuffled = <T,>(items: T[], key: string): T[] => items.map((item, at) => ({ item, at, k: hashOf(`${key}:${at}`) })).sort((a, b) => a.k - b.k).map((x) => x.item);

async function packGrids(): Promise<void> {
    const spec = (process.env.SO_S0_PACKARMS ?? '').split(';').filter(Boolean).map((entry) => { const [name, ...rest] = entry.split('='); return { name, pattern: rest.join('=') }; });
    if (!spec.length) throw new Error('SO_S0_PACKARMS=name=dir{seed};name=dir{seed}');
    const seeds = (process.env.SO_S0_SEEDS ?? '1234,5678').split(',').map(Number);
    await fs.mkdir(dir('packsheets'), { recursive: true });
    const jobs: string[] = [];
    for (const member of Object.keys(MEMBERS)) for (const seed of seeds) {
        const key = `${member}-s${seed}`;
        const order = shuffled(spec, key);
        const labels = order.map((_, at) => `R${at + 1}`);
        const rowsOut = [{ label: 'reference', items: [{ label: 'card art', path: path.join(BASES, `${member}.png`) }] }, ...order.map((arm, at) => ({
            label: labels[at],
            items: PACK_VIEWS.map((view) => ({ label: view.id, path: path.join(arm.pattern.replace('{seed}', String(seed)), 'pack', `${member}-s${seed}-${view.id}.png`) })),
        }))];
        const out = dir('packsheets', `${key}.png`);
        py('grid', { rows: rowsOut, out, cell: 288 });
        await fs.writeFile(dir('packsheets', `${key}.map.json`), JSON.stringify(Object.fromEntries(order.map((arm, at) => [labels[at], arm.name]))));
        jobs.push(JSON.stringify({ key: `pack/${key}`, path: out, prompt: PACK_PROMPT(labels) }));
    }
    await fs.writeFile(dir('jobs-pack.jsonl'), jobs.join('\n') + '\n');
    log('pack grids', jobs.length);
}

const CHAIN_HEADS_PROMPT = `You are an independent rater for an AI sprite pipeline. The attached contact sheet has seven panels left to right: "reference card art", then six head crops of one generated sprite captioned neutral, happy, angry, worried, blink, talk. Judge from the pictures only.
For each of the six crops answer same_character (true only if hair, face and colours clearly match the reference art) and label_visible (true only if the caption plainly reads: neutral = calm neutral face; happy = smiling or joyful; angry = angry; worried = worried or anxious; blink = both eyes closed; talk = mouth open as if speaking), and artifact (true if the crop has a visible seam, smeared face or duplicated features).
Reply with one JSON object only, no prose, in exactly this shape: {"crops":{"neutral":{"same_character":true,"label_visible":true,"artifact":false},"happy":{},"angry":{},"worried":{},"blink":{},"talk":{}}}`;
const CHAIN_BODY_PROMPT = `You are an independent rater for an AI sprite pipeline. The attached sheet has three panels: "reference card art", "card base sprite" (a full-body neutral standing sprite made from the card art), and "look" (the same sprite re-dressed in a dark hooded travel cloak worn over the outfit). Judge from the pictures only.
Answer: base_same_character (true only if hair, face and outfit colours clearly match the reference), base_full_body (whole body visible, plain background), look_same_character (true only if the face and hair match the reference), look_applied (a dark hooded cloak over the outfit is visible), defects (array from "extra_limb","missing_limb","cropped","background_not_plain","deformed_hands","none").
Reply with one JSON object only, no prose, in exactly this shape: {"base_same_character":true,"base_full_body":true,"look_same_character":true,"look_applied":true,"defects":["none"]}`;
const SCENE_PROMPT = `You are an independent rater for an AI sprite pipeline. The attached sheet has three panels: "character A", "character B" and "scene" (a generated scene that should show both characters standing side by side). Judge from the pictures only.
Answer: both_present (true only if exactly two people are in the scene), a_same_character and b_same_character (true only if hair, face and outfit clearly match that reference), merged (true if the two characters' features are blended into each other), text_or_watermark (true if any text or watermark appears), defects (array from "extra_limb","missing_limb","cropped","deformed_hands","none").
Reply with one JSON object only, no prose, in exactly this shape: {"both_present":true,"a_same_character":true,"b_same_character":true,"merged":false,"text_or_watermark":false,"defects":["none"]}`;

async function chainSheets(): Promise<void> {
    await fs.mkdir(dir('chainsheets'), { recursive: true });
    const jobs: string[] = [];
    for (const member of Object.keys(MEMBERS)) {
        const info = await readJson(dir('chain', `${member}-head-box.json`)).catch(() => null);
        const box = info?.box as Box | undefined;
        const heads: { label: string; path: string; box?: Box }[] = [{ label: 'reference', path: dir('chain', `${member}-card.png`) }];
        for (const task of ['card_base', 'expr_happy', 'expr_angry', 'expr_worried', 'frame_blink', 'frame_talk']) {
            heads.push({ label: task === 'card_base' ? 'neutral' : task.replace(/^(expr|frame)_/, ''), path: dir('chain', `${member}-${task}.png`), ...(box ? { box } : {}) });
        }
        const headsOut = dir('chainsheets', `${member}-heads.png`);
        py('sheet', { items: heads, out: headsOut, cell: 288 });
        jobs.push(JSON.stringify({ key: `chain-heads/${member}`, path: headsOut, prompt: CHAIN_HEADS_PROMPT }));
        const bodyOut = dir('chainsheets', `${member}-body.png`);
        py('sheet', { items: [{ label: 'reference card art', path: dir('chain', `${member}-card.png`) }, { label: 'card base sprite', path: dir('chain', `${member}-card_base.png`) }, { label: 'look', path: dir('chain', `${member}-look.png`) }], out: bodyOut, cell: 512 });
        jobs.push(JSON.stringify({ key: `chain-body/${member}`, path: bodyOut, prompt: CHAIN_BODY_PROMPT }));
    }
    const sceneOut = dir('chainsheets', 'scene.png');
    py('sheet', { items: [{ label: 'character A', path: dir('chain', 'm1-card_base.png') }, { label: 'character B', path: dir('chain', 'm2-card_base.png') }, { label: 'scene', path: dir('chain', 'scene.png') }], out: sceneOut, cell: 512 });
    jobs.push(JSON.stringify({ key: 'chain-scene', path: sceneOut, prompt: SCENE_PROMPT }));
    await fs.writeFile(dir('jobs-chain.jsonl'), jobs.join('\n') + '\n');
    log('chain sheets', jobs.length);
}

const iou = (a: Box, b: Box): number => {
    const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)), h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return (w * h) / Math.max(1, a.width * a.height + b.width * b.height - w * h);
};

async function poseReport(): Promise<void> {
    const out: Record<string, any> = {};
    for (const f of await fs.readdir(dir('scores')).catch(() => [])) {
        const s = JSON.parse(await fs.readFile(dir('scores', f), 'utf8'));
        const target = await readJson(dir('targets', `${s.member}-${s.pose}.json`)) as Keypoints;
        const found = s.found as Keypoints | null;
        const wanted = target.points.filter(Boolean).length;
        const missing = found ? target.points.filter((p, i) => p && !found.points[i]).length : wanted;
        const want = poseHead(target), got = found ? poseHead(found) : null;
        const row = (out[`${s.pose} ${s.arm}`] ??= { n: 0, pck: 0, shape: 0, shapeN: 0, missing: 0, noPerson: 0, headIou: 0, headIouN: 0, headCentreInTarget: 0, headCentreN: 0 });
        row.n += 1; row.pck += s.pck; row.missing += missing; row.noPerson += found ? 0 : 1;
        if (found) { row.shape += shapePck(found, target); row.shapeN += 1; }
        if (want && got) {
            row.headIou += iou(want, got); row.headIouN += 1;
            const cx = got.x + got.width / 2, cy = got.y + got.height / 2;
            row.headCentreN += 1; row.headCentreInTarget += cx >= want.x && cx <= want.x + want.width && cy >= want.y && cy <= want.y + want.height ? 1 : 0;
        }
    }
    const rounded = Object.fromEntries(Object.entries(out).sort().map(([key, r]: [string, any]) => [key, {
        n: r.n, pck: Number((r.pck / r.n).toFixed(3)), shapePck: r.shapeN ? Number((r.shape / r.shapeN).toFixed(3)) : null, missingJointsPerBody: Number((r.missing / r.n).toFixed(2)), noPerson: r.noPerson,
        headIou: r.headIouN ? Number((r.headIou / r.headIouN).toFixed(3)) : null, headCentreInTargetBox: r.headCentreN ? Number((r.headCentreInTarget / r.headCentreN).toFixed(3)) : null }]));
    console.log(JSON.stringify(rounded, null, 2));
    await fs.writeFile(dir('pose-report.json'), JSON.stringify(rounded, null, 2));
}

async function main(): Promise<void> {
    const [command = 'help', ...rest] = process.argv.slice(2);
    await fs.mkdir(WORK, { recursive: true });
    for (const sub of ['bodies', 'heads', 'targets', 'raw', 'scores']) await fs.mkdir(dir(sub), { recursive: true });
    if (command === 'bases') { for (const member of Object.keys(MEMBERS)) await makeBase(member); return; }
    if (command === 'body') { await makeBody(rest[0], rest[1], rest[2] as Arm); return; }
    if (command === 'quote') {
        const all = await rows();
        const deadline = new Date(); const [h, m] = (rest[0] ?? '12:40').split(':').map(Number); deadline.setHours(h, m, 0, 0);
        const bodies = Object.keys(MEMBERS).length * POSES.length * ARMS_P.length;
        const q = quote({ bodySeconds: all.filter((r) => r.kind === 'body').map((r) => r.seconds), headSeconds: all.filter((r) => r.kind === 'head').map((r) => r.seconds), bodies, heads: bodies * EXPRESSIONS.length, deadlineMs: deadline.getTime(), nowMs: Date.now() });
        console.log(JSON.stringify({ bodies, heads: bodies * EXPRESSIONS.length, ...q, finishesAt: new Date(q.finishesAtMs).toTimeString().slice(0, 8) }));
        return;
    }
    if (command === 'bodies') {
        for (const poseId of POSES) for (const member of Object.keys(MEMBERS)) for (const arm of ARMS_P) await makeBody(member, poseId, arm);
        return;
    }
    if (command === 'head') { await makeHead(rest[0], rest[1], rest[2] as Arm, rest[3], (rest[4] as 'target' | 'output' | undefined) ?? 'output'); return; }
    if (command === 'heads') {
        const limit = Number(rest[0] ?? Infinity);
        let n = 0;
        for (const poseId of POSES) for (const member of Object.keys(MEMBERS)) for (const arm of ARMS_P) for (const ex of EXPRESSIONS) { if (n++ >= limit) return; await makeHead(member, poseId, arm, ex); }
        return;
    }
    if (command === 'score') { await scoreBodies(); return; }
    if (command === 'sheets') { await sheets(); return; }
    if (command === 'summary') { await summary(rest[0] ? Number(rest[0]) : null); return; }
    if (command === 'pack') { for (const member of Object.keys(MEMBERS)) for (const view of PACK_VIEWS) await makePackImage(member, view); return; }
    if (command === 'chain') { await chain(); return; }
    if (command === 'latency') { await latency(); return; }
    if (command === 'posereport') { await poseReport(); return; }
    if (command === 'packgrid') { await packGrids(); return; }
    if (command === 'chainsheets') { await chainSheets(); return; }
    if (command === 'smoke') {
        const view = PACK_VIEWS[Number(rest[0] ?? 0)];
        await makePackImage(rest[1] ?? 'm1', view);
        return;
    }
    if (command === 'vram') {
        const out = dir('vram.csv');
        const child = spawn('nvidia-smi', ['--query-gpu=timestamp,memory.used', '--format=csv,noheader,nounits', '-lms', '500'], { stdio: ['ignore', (await fs.open(out, 'a')).fd, 'ignore'], detached: true });
        child.unref();
        console.log(`sampling pid ${child.pid}`);
        return;
    }
    if (command === 'vram-peak') { console.log(peakFromSamples(await fs.readFile(dir('vram.csv'), 'utf8')) ?? 'none'); return; }
    console.log('commands: bases | body <m> <pose> <arm> | bodies | heads [n] | score | sheets | summary [vramGb] | quote [HH:MM] | pack | packgrid | chain | chainsheets | latency | posereport | smoke [view] [member] | vram | vram-peak');
    console.log('env: SO_S0_ARM b|q21|turbo|q2512, SO_S0_DIR, SO_S0_BASES, SO_S0_SEED, SO_S0_RUN, SO_S0_POSES, SO_S0_PARMS, SO_S0_PACK_MODE edit|t2i, SO_S0_ALPHA native|cutout, SO_S0_PACKDIR, SO_S0_CARDART, SO_S0_CHAIN_BASE');
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exit(1); });
