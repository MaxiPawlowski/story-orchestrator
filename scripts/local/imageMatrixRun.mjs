import fs from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKFLOWS, comfyArgsFor, changesPixels, planCells, estimateMinutes, diffVerdict, DIFF_IDENTICAL, ratingPack, median, switchCost } from './imageMatrix.mjs';

const GEMM_PY = `import json, torch
def run(dtype, acc16=False, tf32=False):
    torch.backends.cuda.matmul.allow_fp16_reduced_precision_reduction = False
    if hasattr(torch.backends.cuda.matmul, 'allow_fp16_accumulation'): torch.backends.cuda.matmul.allow_fp16_accumulation = acc16
    torch.backends.cuda.matmul.allow_tf32 = tf32
    n = 8192
    a = torch.randn(n, n, device='cuda', dtype=dtype); b = torch.randn(n, n, device='cuda', dtype=dtype)
    for _ in range(3): a @ b
    torch.cuda.synchronize(); times = []
    for _ in range(5):
        s = torch.cuda.Event(enable_timing=True); e = torch.cuda.Event(enable_timing=True)
        s.record(); a @ b; e.record(); torch.cuda.synchronize(); times.append(s.elapsed_time(e))
    return round(2 * n ** 3 / (sorted(times)[2] / 1000) / 1e12, 1)
print(json.dumps({'fp16_fp32acc': run(torch.float16), 'bf16': run(torch.bfloat16), 'fp16_fp16acc': run(torch.float16, acc16=True), 'tf32': run(torch.float32, tf32=True), 'torch': torch.__version__, 'cuda': torch.version.cuda}))`;

const RATING_PROMPT = `You rate pairs of images made from the same seed and prompt by two renderer settings. You do not know which is the reference.
For each item, look at A and B and answer one JSON line: {"item":"p001","prefer":"A"|"B"|"tie","faces":-2..2,"eyes":-2..2,"edges":-2..2,"artifacts":-2..2,"flags":["see-through eyes","bright fringe","extra limb","broken hands","text","colour shift"],"note":"<= 20 words"}
Scores are B relative to A (positive = B better). Use tie when you cannot see a difference at 100 % zoom.`;

const exists = (file) => fs.access(file).then(() => true, () => false);
const previewOnly = (graph) => Object.fromEntries(Object.entries(graph).map(([id, node]) => [id, node.class_type === 'SaveImage' ? { class_type: 'PreviewImage', inputs: { images: node.inputs.images } } : node]));

export function imageCommands(ctx) {
    const { argv, option, flag, loadConfig, outRoot, comfyBenchPort, seed, RESERVED, listening, gpuQuery, gpuInfo, Telemetry, killTree, sleep, stamp } = ctx;

    const gemmProbe = (config) => {
        try { return JSON.parse(execFileSync(config.comfyPython, ['-I', '-c', GEMM_PY], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).at(-1)); }
        catch (error) { return { error: String(error.message).slice(0, 300) }; }
    };

    async function quiet(config) {
        if (RESERVED.includes(comfyBenchPort)) throw new Error(`Port ${comfyBenchPort} is reserved.`);
        if (await listening(18888) || await listening(18889)) throw new Error('The local controller is running; stop it first (node scripts/local/cli.mjs stop).');
        for (const p of [8188, comfyBenchPort]) {
            try { await fetch(`http://127.0.0.1:${p}/system_stats`, { signal: AbortSignal.timeout(1500) }); throw new Error(`A ComfyUI answers on ${p}; the image bench needs the card alone.`); }
            catch (error) { if (error.message.startsWith('A ComfyUI')) throw error; }
        }
        const [used] = gpuQuery('memory.used').map(Number);
        const cap = Number(option('max-gpu-used', 2048));
        if (used > cap) throw new Error(`GPU already holds ${used} MiB (cap ${cap}); close other GPU users or pass --max-gpu-used.`);
        if (!config.comfyPython || !config.comfyRoot) throw new Error('config.comfyPython and config.comfyRoot are required.');
    }

    async function modules() {
        const { build } = await import('esbuild');
        const home = fileURLToPath(new URL('../../', import.meta.url));
        const load = async (file) => {
            const bundled = await build({ entryPoints: [path.join(home, file)], bundle: true, format: 'esm', platform: 'node', write: false, tsconfig: path.join(home, 'tsconfig.json'), logLevel: 'silent' });
            return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
        };
        return { ...await load('src/image/graph.ts'), ...await load('src/image/catalog.ts'), ...await load('src/sprites/builder/recipes.ts') };
    }

    const graphFor = (mods, name, seedValue, reference) => {
        const wf = WORKFLOWS[name];
        if (wf.kind === 'qwen') return previewOnly(mods.editGraph({ models: { diffusion: { name: wf.diffusion }, encoder: { name: wf.encoder }, vae: { name: wf.vae } },
            reference, steps: wf.steps, resolution: wf.resolution, seed: seedValue, instruction: mods.editInstruction('expression', 'happy') }));
        const checkpoint = mods.checkpointFor(wf.checkpoint, mods.familyOf(wf.checkpoint) ?? 'sdxl-illustrious');
        const family = mods.FAMILIES[checkpoint.family];
        return mods.buildGraph({ checkpoint, family, loras: [], positive: `${checkpoint.qualityBlock}, ${wf.positive}`, negative: `${checkpoint.negativeBlock}, text, watermark`,
            size: family.sizes[wf.aspect], seed: seedValue, hires: false });
    };

    async function renderOnce(base, graph, file) {
        const t0 = Date.now();
        const queued = await (await fetch(`${base}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph }) })).json();
        if (!queued.prompt_id) throw new Error(`ComfyUI refused the graph: ${JSON.stringify(queued).slice(0, 400)}`);
        let entry = null;
        while (!entry) {
            await sleep(250);
            const history = await (await fetch(`${base}/history/${queued.prompt_id}`)).json();
            entry = history[queued.prompt_id] ?? null;
            if (Date.now() - t0 > 900000) throw new Error('Render timed out.');
        }
        const wallMs = Date.now() - t0;
        const messages = entry.status?.messages ?? [];
        if (entry.status?.status_str === 'error') throw new Error(`Render failed: ${JSON.stringify(messages.find(([n]) => n === 'execution_error')?.[1] ?? {}).slice(0, 600)}`);
        const start = messages.find(([n]) => n === 'execution_start')?.[1]?.timestamp;
        const end = messages.find(([n]) => n === 'execution_success')?.[1]?.timestamp;
        const out = Object.values(entry.outputs ?? {}).flatMap((node) => node.images ?? [])[0];
        if (out) {
            const query = new URLSearchParams({ filename: out.filename, subfolder: out.subfolder ?? '', type: out.type ?? 'temp' });
            await fs.writeFile(file, Buffer.from(await (await fetch(`${base}/view?${query}`)).arrayBuffer()));
        }
        return { wallMs, execMs: start && end ? end - start : null, image: out ? file : null };
    }

    async function uploadReference(base, file) {
        const form = new FormData();
        form.append('image', new Blob([await fs.readFile(file)], { type: 'image/png' }), 'so-bench-reference.png');
        form.append('overwrite', 'true');
        const answer = await (await fetch(`${base}/upload/image`, { method: 'POST', body: form })).json();
        if (!answer.name) throw new Error(`Reference upload failed: ${JSON.stringify(answer).slice(0, 200)}`);
        return answer.subfolder ? `${answer.subfolder}/${answer.name}` : answer.name;
    }

    async function runCell(config, mods, cell, dir, warmup, timed, referenceFile) {
        const wf = WORKFLOWS[cell.workflow];
        const flags = comfyArgsFor(['--cache-ram', '8', '--reserve-vram', '2', ...(config.comfyExtraArgs ?? [])], cell.arm);
        const cellDir = path.join(dir, cell.id);
        await fs.mkdir(cellDir, { recursive: true });
        const logFile = path.join(cellDir, 'comfy.log');
        const fd = openSync(logFile, 'w');
        const began = Date.now();
        const child = spawn(config.comfyPython, ['main.py', '--listen', '127.0.0.1', '--port', String(comfyBenchPort), '--disable-auto-launch', ...flags],
            { cwd: config.comfyRoot, windowsHide: true, stdio: ['ignore', fd, fd] });
        closeSync(fd);
        const base = `http://127.0.0.1:${comfyBenchPort}`;
        const telemetry = new Telemetry(); telemetry.start();
        try {
            while (true) {
                try { const r = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(2000) }); if (r.ok) break; } catch {}
                if (child.exitCode !== null) throw new Error(`ComfyUI exited ${child.exitCode} for ${cell.id}; see ${logFile}`);
                if (Date.now() - began > 240000) throw new Error(`ComfyUI did not start for ${cell.id}.`);
                await sleep(1000);
            }
            const startMs = Date.now() - began;
            const sequence = wf.kind === 'mixed' ? wf.sequence : Array.from({ length: warmup + timed }, () => cell.workflow);
            const reference = sequence.some((name) => WORKFLOWS[name].kind === 'qwen') ? await uploadReference(base, referenceFile) : null;
            const seen = new Set();
            const runs = [];
            for (let i = 0; i < sequence.length; i += 1) {
                const name = sequence[i];
                telemetry.tag = `${cell.id}:${i}`;
                const result = await renderOnce(base, graphFor(mods, name, seed + i, reference), path.join(cellDir, `run-${i}.png`));
                runs.push({ i, workflow: name, warmup: wf.kind !== 'mixed' && i < warmup, cold: !seen.has(name), switched: i > 0 && sequence[i - 1] !== name, ...result, ...telemetry.window(`${cell.id}:${i}`) });
                seen.add(name);
                console.log(`${cell.id} ${i} ${name} wall=${result.wallMs} exec=${result.execMs}`);
            }
            const log = await fs.readFile(logFile, 'utf8');
            const timedRuns = runs.filter((run) => !run.warmup && !run.cold);
            if (timedRuns.some((run) => Number.isFinite(run.execMs) && run.execMs < 1000)) throw new Error(`${cell.id}: a timed render finished in under a second (cache hit); nothing was measured.`);
            return { ...cell, flags, changesPixels: changesPixels(cell.arm), startMs,
                attention: log.match(/Using [^\n]*attention[^\n]*/i)?.[0]?.trim() ?? null,
                vramState: log.match(/Set vram state to:[^\n]*/)?.[0]?.trim() ?? null,
                dynamicVram: log.match(/[^\n]*(dynamic vram|aimdo)[^\n]*/i)?.[0]?.trim() ?? null,
                loads: (log.match(/(Requested to load|loaded completely|loaded partially)/g) ?? []).length,
                medianExecMs: median(timedRuns.map((run) => run.execMs)), medianWallMs: median(timedRuns.map((run) => run.wallMs)), coldWallMs: runs[0]?.wallMs ?? null,
                ...(wf.kind === 'mixed' ? { switchCost: switchCost(runs) } : {}), runs };
        } finally { telemetry.stop(); killTree(child.pid); await sleep(3000); }
    }

    async function runDiff(config, pairs, dir, name) {
        if (!pairs.length) return [];
        const input = path.join(dir, `${name}-pairs.json`);
        const output = path.join(dir, `${name}.json`);
        await fs.writeFile(input, JSON.stringify(pairs));
        execFileSync(config.comfyPython, ['-I', fileURLToPath(new URL('./imageDiff.py', import.meta.url)), input, output], { windowsHide: true });
        return JSON.parse(await fs.readFile(output, 'utf8'));
    }

    const verdictOf = (rows) => {
        const verdicts = rows.map(diffVerdict);
        if (!verdicts.length) return null;
        return verdicts.every((v) => v === DIFF_IDENTICAL) ? 'identical' : verdicts.includes('changed') ? 'changed' : verdicts.includes('unreadable') ? 'unreadable' : 'near';
    };

    async function cellDiffs(config, results, dir) {
        const pairs = [];
        for (const cell of results.filter((row) => row.runs && row.arm !== 'sdpa' && WORKFLOWS[row.workflow].kind !== 'mixed')) {
            const control = results.find((row) => row.runs && row.workflow === cell.workflow && row.arm === 'sdpa');
            if (!control) continue;
            for (const run of cell.runs.filter((row) => !row.warmup && row.image)) {
                const twin = control.runs.find((row) => row.i === run.i && row.image);
                if (twin) pairs.push({ cell: cell.id, run: run.i, a: twin.image, b: run.image });
            }
        }
        return runDiff(config, pairs, dir, 'pixel-diff');
    }

    const summaryRows = (results, diffs) => results.map((cell) => {
        if (cell.skip) return { id: cell.id, skip: cell.skip };
        const control = results.find((row) => row.runs && row.workflow === cell.workflow && row.arm === 'sdpa');
        const mine = diffs.filter((row) => row.cell === cell.id);
        const psnrs = mine.map((row) => row.psnr).filter(Number.isFinite);
        return { id: cell.id, flags: cell.flags.join(' '), attention: cell.attention, medianExecMs: cell.medianExecMs, medianWallMs: cell.medianWallMs, coldWallMs: cell.coldWallMs, startMs: cell.startMs,
            vsBaseline: control?.medianExecMs && cell.medianExecMs ? Number((cell.medianExecMs / control.medianExecMs).toFixed(3)) : null,
            pixels: verdictOf(mine) ?? (cell.arm === 'sdpa' ? 'control' : 'n/a'), worstPsnr: psnrs.length ? Math.min(...psnrs) : null,
            minGpuFreeMiB: Math.min(...cell.runs.map((run) => run.minGpuFreeMiB ?? Infinity)), maxPowerW: Math.max(...cell.runs.map((run) => run.maxPowerW ?? 0)),
            medianSmMHz: median(cell.runs.map((run) => run.medianSmMHz)), loads: cell.loads, switchCost: cell.switchCost ?? null };
    });

    const seconds = (ms) => (Number.isFinite(ms) ? (ms / 1000).toFixed(2) : '');
    const markdownTable = (rows) => ['| cell | median exec s | x baseline | cold wall s | pixels | worst PSNR | min GPU free MiB | max W | SM MHz | attention |', '|---|---|---|---|---|---|---|---|---|---|',
        ...rows.map((row) => (row.skip ? `| ${row.id} | skipped: ${row.skip} | | | | | | | | |`
            : `| ${row.id} | ${seconds(row.medianExecMs)} | ${row.vsBaseline ?? ''} | ${seconds(row.coldWallMs)} | ${row.pixels} | ${row.worstPsnr ?? ''} | ${row.minGpuFreeMiB} | ${row.maxPowerW} | ${row.medianSmMHz} | ${row.attention ?? ''} |`))].join('\n');

    async function matrix() {
        const config = await loadConfig();
        const spec = option('cells') ?? option('plan', 'quick');
        const cells = planCells(spec);
        const warmup = Number(option('warmup', 2));
        const timed = Number(option('runs', 6));
        const label = option('label', 'unlabelled');
        const referenceFile = option('reference') ?? path.join(outRoot, 'image-reference', 'reference.png');
        const needsReference = cells.findIndex((cell) => !cell.skip && ['qwen', 'mixed'].includes(WORKFLOWS[cell.workflow].kind));
        const makesReference = cells.findIndex((cell) => cell.workflow === 'sdxl-portrait' && cell.arm === 'sdpa');
        const haveReference = await exists(referenceFile);
        console.log(JSON.stringify({ label, spec, warmup, timed, estMinutes: estimateMinutes(cells, warmup, timed),
            reference: haveReference ? referenceFile : needsReference < 0 ? null : `made by sdxl-portrait:sdpa -> ${referenceFile}`,
            cells: cells.map((cell) => (cell.skip ? `${cell.id} (skip: ${cell.skip})` : cell.id)) }, null, 1));
        if (needsReference >= 0 && !haveReference && (makesReference < 0 || makesReference > needsReference))
            throw new Error(`Qwen cells need a reference image: pass --reference <png>, or plan sdxl-portrait:sdpa before them (it writes ${referenceFile}).`);
        if (flag('dry-run')) {
            if (!flag('graphs')) return;
            const mods = await modules();
            for (const name of Object.keys(WORKFLOWS).filter((key) => WORKFLOWS[key].kind !== 'mixed')) console.log(name, JSON.stringify(graphFor(mods, name, seed, 'reference.png')));
            return;
        }
        await quiet(config);
        const mods = await modules();
        const dir = path.join(outRoot, `image-matrix-${label}-${stamp()}`);
        await fs.mkdir(dir, { recursive: true });
        const header = { at: new Date().toISOString(), label, spec, warmup, timed, seed, gpu: gpuInfo(), comfyPython: config.comfyPython, comfyRoot: config.comfyRoot,
            comfyExtraArgs: config.comfyExtraArgs ?? [], gemmBefore: flag('gemm') ? gemmProbe(config) : null };
        await fs.writeFile(path.join(dir, 'header.json'), JSON.stringify(header, null, 2));
        const results = [];
        for (const cell of cells) {
            if (cell.skip) { results.push(cell); continue; }
            const result = await runCell(config, mods, cell, dir, warmup, timed, referenceFile);
            results.push(result);
            await fs.writeFile(path.join(dir, 'cells.json'), JSON.stringify(results, null, 1));
            if (cell.workflow === 'sdxl-portrait' && cell.arm === 'sdpa' && !await exists(referenceFile)) {
                const source = result.runs.find((run) => !run.warmup && run.image)?.image;
                if (source) { await fs.mkdir(path.dirname(referenceFile), { recursive: true }); await fs.copyFile(source, referenceFile); }
            }
        }
        const gemmAfter = flag('gemm') ? gemmProbe(config) : null;
        const diffs = await cellDiffs(config, results, dir);
        const rows = summaryRows(results, diffs);
        await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify({ ...header, gemmAfter, rows }, null, 2));
        const md = `# Image matrix ${label}\n\n${header.at}, ${header.gpu.name}, driver ${header.gpu.driver}, power ${header.gpu.powerLimitW} W, seed ${seed}, ${warmup} warm-ups + ${timed} timed\n\n`
            + `GEMM TFLOPS before ${JSON.stringify(header.gemmBefore)} after ${JSON.stringify(gemmAfter)}\n\n${markdownTable(rows)}\n`;
        await fs.writeFile(path.join(dir, 'summary.md'), md);
        console.log(markdownTable(rows));
        console.log(`Wrote ${dir}`);
    }

    async function compare() {
        const config = await loadConfig();
        const [a, b] = argv.slice(1).filter((arg) => !arg.startsWith('--'));
        if (!a || !b) throw new Error('Usage: image-compare <matrix dir before> <matrix dir after>');
        const read = async (dir) => JSON.parse(await fs.readFile(path.join(dir, 'cells.json'), 'utf8'));
        const [before, after] = [await read(a), await read(b)];
        const pairs = [];
        const rows = [];
        for (const cell of after.filter((row) => row.runs)) {
            const twin = before.find((row) => row.id === cell.id && row.runs);
            if (!twin) continue;
            rows.push({ id: cell.id, beforeExecMs: twin.medianExecMs, afterExecMs: cell.medianExecMs,
                speedup: twin.medianExecMs && cell.medianExecMs ? Number((twin.medianExecMs / cell.medianExecMs).toFixed(3)) : null });
            for (const run of cell.runs.filter((row) => row.image)) {
                const old = twin.runs.find((row) => row.i === run.i && row.image);
                if (old) pairs.push({ cell: cell.id, run: run.i, a: old.image, b: run.image });
            }
        }
        const out = path.join(b, `compare-${path.basename(a)}`);
        await fs.mkdir(out, { recursive: true });
        const diffs = await runDiff(config, pairs, out, 'pixel-diff');
        for (const row of rows) row.pixels = verdictOf(diffs.filter((d) => d.cell === row.id)) ?? 'n/a';
        await fs.writeFile(path.join(out, 'compare.json'), JSON.stringify(rows, null, 2));
        console.log(['| cell | before s | after s | speedup | pixels |', '|---|---|---|---|---|',
            ...rows.map((row) => `| ${row.id} | ${seconds(row.beforeExecMs)} | ${seconds(row.afterExecMs)} | ${row.speedup} | ${row.pixels} |`)].join('\n'));
        console.log(`Wrote ${out}`);
    }

    async function ratingPackCommand() {
        const dir = argv[1];
        if (!dir) throw new Error('Usage: image-rating-pack <matrix dir> [--per-cell 3]');
        const perCell = Number(option('per-cell', 3));
        const diffs = JSON.parse(await fs.readFile(path.join(dir, 'pixel-diff.json'), 'utf8'));
        const chosen = [];
        for (const id of new Set(diffs.map((row) => row.cell))) {
            chosen.push(...diffs.filter((row) => row.cell === id && diffVerdict(row) !== DIFF_IDENTICAL).slice(0, perCell).map((row) => ({ cell: id, run: row.run, control: row.a, candidate: row.b })));
        }
        const pack = ratingPack(chosen, path.basename(dir));
        const out = path.join(dir, 'rating-pack');
        await fs.mkdir(out, { recursive: true });
        for (const item of pack) {
            await fs.copyFile(item.a, path.join(out, `${item.item}-A.png`));
            await fs.copyFile(item.b, path.join(out, `${item.item}-B.png`));
        }
        await fs.writeFile(path.join(out, 'items.json'), JSON.stringify(pack.map((item) => ({ item: item.item, a: `${item.item}-A.png`, b: `${item.item}-B.png` })), null, 1));
        await fs.writeFile(path.join(dir, 'rating-key.json'), JSON.stringify(pack.map((item) => ({ item: item.item, ...item.key })), null, 1));
        await fs.writeFile(path.join(out, 'prompt.md'), `${RATING_PROMPT}\n`);
        console.log(`${pack.length} pairs in ${out} (key in ${path.join(dir, 'rating-key.json')}, outside the pack)`);
    }

    return { 'image-matrix': matrix, 'image-compare': compare, 'image-rating-pack': ratingPackCommand };
}
