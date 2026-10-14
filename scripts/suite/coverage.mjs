#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLAN = 'docs/plans/v2.8/24-test-plan.md';
const PLAN_DIR = 'docs/plans/v2.8';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const read = (path) => readFileSync(join(ROOT, path), 'utf-8');
const posix = (path) => path.replace(/\\/g, '/');

export function walk(dir, keep, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, keep, out);
    else if (keep(name)) out.push(path);
  }
  return out;
}

export function featureIds(featureDir, judgeSettings) {
  const ids = [];
  for (const file of readdirSync(featureDir).filter((name) => /^(registry|[a-z]+Features)\.ts$/.test(name))) {
    for (const match of readFileSync(join(featureDir, file), 'utf-8').matchAll(/^\s*id: "([a-z0-9-]+)"/gm)) ids.push(match[1]);
  }
  const block = readFileSync(judgeSettings, 'utf-8').match(/JUDGE_USE_KEYS = \[([\s\S]*?)\] as const/);
  for (const match of (block?.[1] ?? '').matchAll(/"([A-Za-z]+)"/g)) ids.push(`judge-use-${match[1].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
  return [...new Set(ids)];
}

export function tableAfter(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return [];
  const rows = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) {
      inTable = true;
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells.every((cell) => /^-+$/.test(cell))) continue;
      rows.push(cells);
    } else if (inTable) break;
    else if (/^#{1,3} /.test(line)) break;
  }
  return rows.slice(1);
}

export function expandRanges(text) {
  return text.replace(/\b([A-Z][A-Za-z]*-?)(\d+)(?:\.(\d+))?[–-]\1?(\d+)(?:\.(\d+))?\b/g, (whole, prefix, a, aSub, b, bSub) => {
    if (aSub !== undefined && bSub !== undefined && Number(b) === Number(a)) {
      const out = [];
      for (let n = Number(aSub); n <= Number(bSub) && out.length < 40; n += 1) out.push(`${prefix}${a}.${n}`);
      return out.join(', ');
    }
    if (aSub !== undefined || bSub !== undefined) return whole;
    const from = Number(a); const to = Number(b);
    if (!(to > from) || to - from > 40) return whole;
    const out = [];
    for (let n = from; n <= to; n += 1) out.push(`${prefix}${n}`);
    return out.join(', ');
  });
}

export function carrierIndex({ root, campaign }) {
  const journeyFiles = walk(join(root, 'test', 'journeys'), (name) => name.endsWith('.journey.json'));
  const journeyChecks = new Set();
  const journeys = new Set();
  for (const file of journeyFiles) {
    const json = JSON.parse(readFileSync(file, 'utf-8'));
    const short = basename(file).match(/^(j\d+|gs\d+)-/i)?.[1]?.toUpperCase();
    if (short) journeys.add(short);
    for (const check of json.checks ?? []) journeyChecks.add(String(check.id));
  }
  const scenarioFiles = walk(join(root, 'test', 'scenarios'), (name) => name.endsWith('.json'));
  const scenarios = new Map(scenarioFiles.map((file) => [basename(file).replace(/\.json$/, ''), posix(relative(root, file))]));
  const scenarioText = scenarioFiles.map((file) => readFileSync(file, 'utf-8'));
  const labFiles = campaign ? walk(join(campaign, 'lab', 'v28'), (name) => name.endsWith('.json')) : [];
  const lab = new Map(labFiles.map((file) => [basename(file).replace(/\.json$/, ''), posix(file)]));
  const testFiles = [
    ...walk(join(root, 'src'), (name) => /\.test\.tsx?$/.test(name)),
    ...walk(join(root, 'server-plugin'), (name) => /\.test\.m?[jt]s$/.test(name)),
    ...walk(join(root, 'scripts'), (name) => /\.test\.m?[jt]s$/.test(name)),
  ].map((file) => posix(relative(root, file)));
  const stories = walk(join(root, 'src'), (name) => name.endsWith('.stories.tsx')).length;
  const manifest = JSON.parse(readFileSync(join(root, 'test', 'phase-c', 'manifest.json'), 'utf-8'));
  const manifestIds = new Set(manifest.rows.map((row) => row.id));
  const plan = readFileSync(join(root, PLAN), 'utf-8');
  const measurementIds = new Set();
  for (const [cell] of tableAfter(plan, '## Measurement rows')) for (const match of cell.matchAll(/\b([MR]\d+)\b/g)) measurementIds.add(match[1]);
  return { journeyChecks, journeys, scenarios, scenarioText, lab, testFiles, stories, manifestIds, measurementIds };
}

const NAMED = {
  'T-R4': (ix) => ix.scenarios.has('live-v28-24-reply-effort') && 'test/scenarios/live-v28-24-reply-effort.json',
  'AS-smoke': (ix) => [...ix.scenarios.keys()].filter((name) => name.startsWith('live-v28-24-smoke-')).length === 9 && 'test/scenarios/live-v28-24-smoke-*.json (9)',
  'commit-model': (ix) => ix.lab.has('v28-adolion-commit-model') && 'campaign lab/v28/v28-adolion-commit-model.json',
  'encounters-model': (ix) => ix.lab.has('v28-adolion-encounters-model') && 'campaign lab/v28/v28-adolion-encounters-model.json',
  'J7-consumers': (ix) => ix.journeys.has('J7') && ix.scenarios.has('v28-40-judge-consumers') && 'J7 journey + test/scenarios/v28-40-judge-consumers.json (live block on the J7 run)',
  'every GS': (ix) => ['GS1', 'GS2', 'GS3', 'GS4'].every((id) => ix.journeys.has(id)) && 'test/journeys/gs1..gs4',
  'Storybook': (ix) => ix.stories > 0 && `${ix.stories} .stories.tsx`,
  'assert-player-clean': () => existsSync(join(ROOT, 'scripts', 'debug', 'so-ui.mts')) && 'so-ui.mts assert-player-clean',
  'run header': () => existsSync(join(ROOT, 'scripts', 'debug', 'so-run-header.mts')) && 'so-run-header.mts capture/diff',
};

const IMAGE_TRACK = /\b(N3|GS5|LI\d|plan 28 LI|plan 29 brokered|32-W\d)/;

const ACCEPTED_NONE = /^(none\b|—$|-$)/;
const DEFERRED = /\bdeferred\b|\bcarried\b|\bv2\.9\b/;

export function resolveSegment(segment, ix) {
  const found = [];
  const text = expandRanges(segment);
  for (const [name, check] of Object.entries(NAMED)) if (text.includes(name)) { const hit = check(ix); if (hit) found.push({ kind: 'named', id: name, where: hit }); }
  if (/\bGS\b(?![\d.])/.test(text) && ['GS1', 'GS2', 'GS3', 'GS4'].every((id) => ix.journeys.has(id))) found.push({ kind: 'journey', id: 'GS1-GS4' });
  for (const match of text.matchAll(/\bGS(\d)(?:\.(\d+))?\b/g)) {
    const id = match[2] ? `GS${match[1]}.${match[2]}` : `GS${match[1]}`;
    if (match[2] ? ix.journeyChecks.has(id) : ix.journeys.has(id)) found.push({ kind: 'journey', id });
  }
  for (const match of text.matchAll(/\bJ(\d+)(?:\.(\d+))?\b/g)) {
    const id = `J${match[1]}`;
    if (ix.journeys.has(id)) found.push({ kind: 'journey', id: match[2] ? `${id}.${match[2]}` : id });
  }
  for (const match of text.matchAll(/[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]/g)) {
    const token = match[0];
    if (ix.manifestIds.has(token)) found.push({ kind: 'manifest', id: token });
    else if (/^[A-Z0-9][A-Za-z0-9-]*$/.test(token) && /\d/.test(token)) {
      const prefixed = [...ix.manifestIds].filter((id) => id.startsWith(`${token}-`));
      if (prefixed.length) found.push({ kind: 'manifest', id: `${token}-* (${prefixed.length})` });
    }
    if (ix.measurementIds.has(token)) found.push({ kind: 'measurement', id: token });
    const scenario = [...ix.scenarios.keys()].find((name) => name === token || (token.length > 6 && name.startsWith(token)));
    if (scenario && /^(v2\d|live-|plan\d|effects-)/.test(token)) found.push({ kind: 'scenario', id: ix.scenarios.get(scenario) });
    const labHit = [...ix.lab.keys()].find((name) => name === token || name.endsWith(token));
    if (labHit && token.length > 6) found.push({ kind: 'campaign-lab', id: labHit });
  }
  const jestWord = text.replace(/^plan \d+ [A-Za-z ]+: /, '').match(/^([A-Za-z][A-Za-z0-9-]*)(?: [A-Za-z]+)? (?:jest|tests?|node:test|suites|review test)\b/);
  if (jestWord) {
    const word = jestWord[1].toLowerCase().replace(/-/g, '').replace(/(ies|y|s)$/, '');
    const hit = word.length >= 3 && ix.testFiles.find((file) => file.toLowerCase().replace(/[-_]/g, '').split('/').some((part) => part.startsWith(word)));
    if (hit) found.push({ kind: 'test', id: hit });
  }
  const scenWord = text.match(/^([A-Za-z_][A-Za-z0-9_]*) scenarios?\b/);
  if (scenWord) {
    const word = scenWord[1];
    if (ix.scenarioText.some((body) => body.includes(word)) || [...ix.scenarios.keys()].some((name) => name.toLowerCase().includes(word.toLowerCase()))) found.push({ kind: 'scenario', id: `scenarios mentioning ${word}` });
  }
  for (const stem of text.match(/\b[a-z][A-Za-z]+(?=\b)/g) ?? []) {
    if (stem.length < 6 || !/[A-Z]/.test(stem)) continue;
    const hit = ix.testFiles.find((file) => basename(file).replace(/\.(review|guard|property)?\.?test\.m?[jt]sx?$/, '') === stem);
    if (hit) found.push({ kind: 'test', id: hit });
  }
  return found;
}

const splitCell = (cell) => cell.split(/[;,]| and /).map((part) => part.trim()).filter(Boolean);

export function matrixCoverage(plan, ix, ids) {
  const rows = tableAfter(plan, '## Feature → validation matrix');
  const byFeature = new Map(rows.map((cells) => [cells[0], cells]));
  const features = [];
  for (const id of ids) {
    const cells = byFeature.get(id);
    if (!cells) { features.push({ id, status: 'red', reason: 'no matrix row' }); continue; }
    const [, tier, dCell, carrierCell] = cells;
    const d = splitCell(dCell).map((segment) => ({ segment, found: resolveSegment(segment, ix) }));
    const carrier = splitCell(carrierCell).map((segment) => ({ segment, found: resolveSegment(segment, ix) }));
    const resolved = [...d, ...carrier].flatMap((entry) => entry.found);
    const carrierResolved = carrier.flatMap((entry) => entry.found);
    const none = ACCEPTED_NONE.test(carrierCell);
    const imageTrack = IMAGE_TRACK.test(carrierCell) && /\bLI\b/.test(tier);
    const deferred = DEFERRED.test(carrierCell);
    const unresolved = [...d, ...carrier].filter((entry) => !entry.found.length && !ACCEPTED_NONE.test(entry.segment)).map((entry) => entry.segment);
    let status = 'green';
    let reason = '';
    if (!resolved.length && imageTrack) { status = 'image-track'; reason = 'image track (rule 12), no D carrier resolves'; }
    else if (!resolved.length) { status = 'red'; reason = 'no carrier resolves'; }
    else if (!carrierResolved.length && !none && !imageTrack && !deferred && /\b(RP|CL|LT)\b/.test(tier)) { status = 'red'; reason = 'real-model carrier does not resolve'; }
    if (status === 'green' && imageTrack) reason = 'image track (rule 12)';
    if (status === 'green' && none) reason = 'no model (stated)';
    features.push({ id, tier, status, reason, carriers: [...new Map(resolved.map((hit) => [`${hit.kind}:${hit.id}`, hit])).values()], unresolved });
  }
  const extra = rows.map((cells) => cells[0]).filter((id) => !ids.includes(id));
  return { features, extra };
}

export function floorTables(text) {
  const lines = text.split(/\r?\n/);
  const ids = [];
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i];
    if (!header.startsWith('|') || !/\|\s*(Floor|Pass)\b/i.test(header) || !/^\|\s*(#|ID)\s*\|/.test(header)) continue;
    for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j += 1) {
      const first = lines[j].split('|')[1]?.trim().replace(/\*\*/g, '');
      if (first && /^[A-Z][A-Za-z0-9.-]*\d[A-Za-z0-9.-]*$/.test(first)) ids.push(first);
    }
  }
  return [...new Set(ids)];
}

export function floorCoverage(plan, planDir) {
  const expanded = expandRanges(plan);
  const lines = [];
  for (const line of expanded.split(/\r?\n/)) {
    if (/^ {2,}\S/.test(line) && lines.length && /^- /.test(lines[lines.length - 1])) lines[lines.length - 1] += ` ${line.trim()}`;
    else lines.push(line);
  }
  const out = [];
  for (const file of readdirSync(planDir).filter((name) => /^\d\d-.*\.md$/.test(name) && !name.startsWith('24-'))) {
    const number = file.slice(0, 2);
    const ids = floorTables(readFileSync(join(planDir, file), 'utf-8'));
    if (!ids.length) continue;
    const n = String(Number(number));
    const context = lines.filter((line) => new RegExp(`(^-\\s+${n}\\b|^\\|\\s*${n}\\b|\\bplan ${n}\\b|\\bplans? [0-9, –-]*\\b${n}\\b|\\bv2\\.8 0?${n}\\b|\\b${number} [A-Z])`).test(line)).join('\n');
    const mapped = ids.filter((id) => new RegExp(`(^|[^A-Za-z0-9-])${id.replace(/\./g, '\\.')}([^A-Za-z0-9]|$)`, 'm').test(context));
    const missing = ids.filter((id) => !mapped.includes(id));
    out.push({ plan: file, floors: ids.length, mapped: mapped.length, missing });
  }
  return out;
}

export function report({ root = ROOT, campaign } = {}) {
  const ix = carrierIndex({ root, campaign });
  const plan = readFileSync(join(root, PLAN), 'utf-8');
  const ids = featureIds(join(root, 'src', 'features'), join(root, 'src', 'judge', 'settings.ts'));
  const matrix = matrixCoverage(plan, ix, ids);
  const floors = floorCoverage(plan, join(root, PLAN_DIR));
  const red = matrix.features.filter((feature) => feature.status === 'red');
  const floorRed = floors.filter((entry) => entry.missing.length);
  return { generatedAt: new Date().toISOString(), registryIds: ids.length, matrixExtra: matrix.extra, features: matrix.features, red, floors, floorRed,
    index: { journeyChecks: ix.journeyChecks.size, journeys: ix.journeys.size, scenarios: ix.scenarios.size, campaignLab: ix.lab.size, testFiles: ix.testFiles.length, manifestRows: ix.manifestIds.size, measurementIds: ix.measurementIds.size } };
}

export function markdown(result) {
  const lines = [`# Coverage report (${result.generatedAt.slice(0, 10)})`, '',
    `- Registry ids: ${result.registryIds}; matrix rows not in the registry: ${result.matrixExtra.length ? result.matrixExtra.join(', ') : 'none'}.`,
    `- Carrier index: ${Object.entries(result.index).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
    `- Features green: ${result.features.filter((f) => f.status === 'green').length}; image track (rule 12): ${result.features.filter((f) => f.status === 'image-track').length}; red: ${result.red.length}.`,
    `- Plan floor tables: ${result.floors.length} plans, ${result.floors.reduce((n, e) => n + e.floors, 0)} floors, unmapped ${result.floors.reduce((n, e) => n + e.missing.length, 0)}.`, '',
    '## Red features', ''];
  for (const feature of result.red) lines.push(`- ${feature.id}: ${feature.reason}${feature.unresolved?.length ? ` (unresolved: ${feature.unresolved.join('; ')})` : ''}`);
  if (!result.red.length) lines.push('- none');
  lines.push('', '## Floors not named in plan 24', '');
  for (const entry of result.floorRed) lines.push(`- ${entry.plan}: ${entry.missing.join(', ')} (${entry.mapped}/${entry.floors} mapped)`);
  if (!result.floorRed.length) lines.push('- none');
  lines.push('', '## Per feature', '', '- id | tier | status | carriers | unresolved segments');
  for (const feature of result.features) lines.push(`- ${feature.id} | ${feature.tier ?? '-'} | ${feature.status}${feature.reason ? ` (${feature.reason})` : ''} | ${(feature.carriers ?? []).map((hit) => `${hit.kind}:${hit.id}`).join(', ') || '-'} | ${(feature.unresolved ?? []).join('; ') || '-'}`);
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = report({ campaign: arg('--campaign', process.env.ADOLION_CAMPAIGN ?? JSON.parse(read('scripts/debug/adolion-fresh.pin.json')).repo) });
  const md = markdown(result);
  const out = arg('--out');
  if (out) writeFileSync(out, md);
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(result, null, 2));
  process.stdout.write(out ? `${result.red.length} red features, ${result.floorRed.reduce((n, e) => n + e.missing.length, 0)} unmapped floors; report ${out}\n` : md);
  process.exit(result.red.length || result.floorRed.length ? 1 : 0);
}
