import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const savePrefixes = (history, ids) => ids
    .map((id) => ({ id, number: history[id].prompt[0], prefix: Object.values(history[id].prompt[2]).find((node) => node.class_type === 'SaveImage')?.inputs.filename_prefix ?? null }))
    .sort((a, b) => a.number - b.number)
    .map((row) => row.prefix);

export function verifyPrefixes(prefixes) {
    return {
        threeRenders: prefixes.length === 3,
        sceneOnA: prefixes[0] === 'SO_LI_A',
        backgroundOnB: prefixes[1] === 'SO_LI_B',
        unmappedOnSelection: prefixes.length === 3 && !['SO_LI_A', 'SO_LI_B'].includes(prefixes[2]) && prefixes[2] !== null,
    };
}

const hashOf = async (file) => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const selectedIn = async (file) => JSON.parse(await fs.readFile(file, 'utf8')).extension_settings?.sd?.comfy_workflow ?? null;

async function main() {
    const [lane, label, outDir] = process.argv.slice(2);
    if (!lane || !label || !outDir) throw new Error('Usage: node scripts/local/storyWorkflowLi.mjs <lane> <label> <out dir>');
    const comfy = 'http://127.0.0.1:8188';
    const settings = `C:/dev/so-lanes/${lane}/data/default-user/settings.json`;
    const workflowDir = `C:/dev/so-lanes/${lane}/data/default-user/user/workflows`;
    const history = async () => (await fetch(`${comfy}/history`)).json();
    const report = { label, at: new Date().toISOString(), selectedDiskBefore: await selectedIn(settings), ok: false };
    const before = Object.keys(await history());
    const began = Date.now();
    const run = spawnSync(process.execPath, ['scripts/debug/st-lanes.mts', 'run', lane, '--', 'scripts/debug/so-scenario.mts', 'run', 'test/scenarios/live-story-workflows.json', '--sandbox', '--group', 'Group: Arin, DM Narrator'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    report.scenarioExit = run.status;
    report.scenarioMs = Date.now() - began;
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, `${label}-scenario.log`), `${run.stdout}\n${run.stderr}`);
    const after = await history();
    const fresh = Object.keys(after).filter((id) => !before.includes(id));
    report.prefixes = savePrefixes(after, fresh);
    report.floors = verifyPrefixes(report.prefixes);
    report.selectedDiskAfter = await selectedIn(settings);
    report.floors.selectionUnchangedOnDisk = report.selectedDiskAfter === report.selectedDiskBefore;
    report.leakedWorkflowFiles = (await fs.readdir(workflowDir)).filter((name) => name.startsWith('SO-LI-'));
    report.floors.noWorkflowLeak = report.leakedWorkflowFiles.length === 0;
    report.floors.scenarioPassed = run.status === 0;
    report.ok = Object.values(report.floors).every(Boolean);
    await fs.writeFile(path.join(outDir, `${label}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
}


if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
