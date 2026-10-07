import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { assertDevBundle } from './lib/bundleFlavour.mts';
import { requiredGroup, requiresOf, membersToEnable } from './lib/scenarioRequires.mts';
import { enableGroupMembers, readRequiresFacts } from './lib/scenarioRequiresHost.mts';
import { bundleWarning, captureHeader } from './so-run-header.mts';
import { runScenario } from './so-scenario.mts';
import { describeReport, diffCases, NORMALISE_RULES, renderNormalised, validateDeclarations, type PayloadCapture, type PayloadCase } from './lib/payloadGolden.mts';

const USAGE = `Usage: node scripts/debug/so-payload-golden.mts <capture|diff> ...

  capture --label <name> --out <dir> [--cases a,b] [--group <id|name>] [--run-header <file>] [--force]
      On the open lane, runs every case in test/scenarios/payload/*.json (or --cases) as a so-scenario
      --sandbox run and records the dry-run prompt ST would send (GENERATE_AFTER_COMBINE_PROMPTS /
      CHAT_COMPLETION_PROMPT_READY) plus every story_* extension block, resting and per drafted member.
      No model call: the fixtures script every turn (/send compact, /sendas) and pin extraction and the
      curator, and an in-page tripwire fails the case on any /generate or judge-plugin request.
      Writes <dir>/<case>.json, <dir>/run-header.json (unless --run-header names one) and <dir>/index.json
      (served bundle sha256, manifest bundle sha256, run-header pointer, normalisation rule ids). Raw
      text is stored; normalisation happens at diff time. A failed case writes <dir>/capture-failed.json
      and no index, so a partial directory can never serve as a baseline. Refuses a <dir> that already
      holds an index unless --force.

  diff <baseline-dir> <candidate-dir> [--declared <file.json>] [--out <report.json>]
      Per case and capture, byte comparison after normalisation (${NORMALISE_RULES.map((rule) => rule.id).join(', ')},
      plus each side's own sandbox chat ids), then line hunks. A hunk passes only when every changed line
      is consumed by a declaration of that case (and label, when given):
        {"declarations": [{"case", "label"?, "plan", "owner", "added"?: [pattern], "removed"?: [pattern], "why"?}]}
      pattern = "substring" | {"contains": "..."} | {"regex": "...", "flags"?: "imsu"}.
      Exit 1 on an undeclared hunk, on a declaration (or one of its patterns) that never happened
      (stale), on a case missing from either side, or on a fixture whose sha256 changed.
      Writes the report to --out, default <candidate-dir>/payload-diff.json.`;

const PAYLOAD_DIR = resolve(PROJECT_ROOT, 'test', 'scenarios', 'payload');

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : null;
}

const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const rel = (path: string) => relative(PROJECT_ROOT, path).replace(/\\/g, '/');

async function caseFiles(selected: string | null): Promise<string[]> {
  const all = (await readdir(PAYLOAD_DIR)).filter((name) => name.endsWith('.json')).sort();
  if (!selected) return all.map((name) => resolve(PAYLOAD_DIR, name));
  const wanted = selected.split(',').map((name) => name.trim()).filter(Boolean).map((name) => (name.endsWith('.json') ? name : `${name}.json`));
  const unknown = wanted.filter((name) => !all.includes(name));
  if (unknown.length) throw new Error(`unknown payload case(s) ${unknown.join(', ')}; known: ${all.join(', ')}`);
  return wanted.map((name) => resolve(PAYLOAD_DIR, name));
}

export async function installPayloadProbe(page) {
  return evaluateInST(page, () => {
    const g = globalThis as any;
    const state = g.__soPayloadGolden ??= { captures: [], modelCalls: [], chatIds: [] };
    state.captures = [];
    state.modelCalls = [];
    state.chatIds = [];
    if (!state.wrapped) {
      const MODEL_CALL = /\/api\/(?:backends\/[a-z-]+\/generate|novelai\/generate|horde\/generate|plugins\/story-orchestrator-[a-z-]+\/(?!status))/;
      const original = g.fetch;
      g.fetch = function payloadGoldenFetch(input: any) {
        const url = String(typeof input === 'string' ? input : input?.url ?? '');
        if (MODEL_CALL.test(url)) g.__soPayloadGolden.modelCalls.push({ url, at: new Date().toISOString() });
        return original.apply(this, arguments as any);
      };
      state.wrapped = true;
    }
    state.capture = async (label: string, options: { member?: string } = {}) => {
      const ctx = g.SillyTavern.getContext();
      const rt = g.storyOrchestratorRuntime;
      if (!ctx.groupId) throw new Error(`${label}: payload goldens are group chats only (v2.7 16 rule 5)`);
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(label)) throw new Error(`${label}: a capture label is lower-case [a-z0-9._-]`);
      if (state.captures.some((entry) => entry.label === label)) throw new Error(`${label}: captured twice in one case`);
      if (state.modelCalls.length) throw new Error(`${label}: a model call happened before this capture: ${JSON.stringify(state.modelCalls.slice(0, 3))}`);
      if (ctx.chatId && !state.chatIds.includes(String(ctx.chatId))) state.chatIds.push(String(ctx.chatId));
      const member = options.member ?? null;
      const chid = member === null ? -1 : (ctx.characters ?? []).findIndex((card) => card?.name === member);
      if (member !== null && chid < 0) throw new Error(`${label}: ${member} is not a character here`);
      rt.clearPrivateInjection();
      if (member !== null) rt.onMemberDrafted(chid);
      let prompt: string | null = null;
      let promptKind: 'text' | 'chat' | null = null;
      let blocks: any[] = [];
      const text = (data) => { if (data?.dryRun && typeof data.prompt === 'string') { prompt = data.prompt; promptKind = 'text'; } };
      const chat = (data) => {
        if (!data?.dryRun || !Array.isArray(data.chat)) return;
        prompt = data.chat.map((message) => [`### ${message?.role ?? '?'}${message?.name ? ` (${message.name})` : ''}`, typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? null)].join('\n')).join('\n');
        promptKind = 'chat';
      };
      ctx.eventSource.on(ctx.eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, text);
      ctx.eventSource.on(ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY, chat);
      try {
        await ctx.generate('normal', {}, true);
        blocks = Object.entries(ctx.extensionPrompts ?? {})
          .filter(([key]) => key.startsWith('story_'))
          .map(([key, value]: [string, any]) => ({ key, value: String(value?.value ?? ''), position: Number.isFinite(value?.position) ? value.position : null, depth: Number.isFinite(value?.depth) ? value.depth : null, role: Number.isFinite(value?.role) ? value.role : null, scan: typeof value?.scan === 'boolean' ? value.scan : null }))
          .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      } finally {
        ctx.eventSource.removeListener(ctx.eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, text);
        ctx.eventSource.removeListener(ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY, chat);
        if (member !== null) rt.clearPrivateInjection();
      }
      if (typeof prompt !== 'string') throw new Error(`${label}: the dry-run prompt was not captured (main API ${ctx.mainApi})`);
      const entry = { label, member, mainApi: ctx.mainApi ?? null, promptKind, checkpoint: rt.getActiveCheckpointInfo?.()?.id ?? null, prompt, blocks };
      state.captures.push(entry);
      return { label, member, promptChars: (prompt as string).length, blocks: blocks.length };
    };
    return { installed: true };
  });
}

async function readProbe(page) {
  return evaluateInST(page, () => {
    const state = (globalThis as any).__soPayloadGolden;
    return { captures: state?.captures ?? [], modelCalls: state?.modelCalls ?? [], chatIds: state?.chatIds ?? [] };
  }) as Promise<{ captures: PayloadCapture[]; modelCalls: Array<{ url: string; at: string }>; chatIds: string[] }>;
}

async function readServedManifest(page) {
  return evaluateInST(page, async () => {
    try {
      const response = await fetch('/scripts/extensions/third-party/story-orchestrator/dist/manifest.json', { cache: 'no-store' });
      if (!response.ok) return { http: response.status };
      const manifest = await response.json();
      return { http: response.status, bundleSha256: manifest?.bundle?.sha256 ?? null, version: manifest?.extension?.version ?? null, flavor: manifest?.flavor ?? null, commit: manifest?.source?.commit ?? null, sourceSha256: manifest?.source?.sha256 ?? null, builtAt: manifest?.builtAt ?? null };
    } catch (error) {
      return { http: 0, error: String(error) };
    }
  });
}

async function restoreCast(page, requires, group: string | null) {
  if (!requires.members?.length) return null;
  const facts = await readRequiresFacts(page, { members: requires.members });
  if (group && !(facts.groupId === group || (facts.groupName ?? '').trim().toLowerCase() === group.trim().toLowerCase())) return { skipped: `the open group is ${facts.groupName ?? 'none'} (${facts.groupId}), not ${group}` };
  const avatars = membersToEnable(requires, facts);
  return enableGroupMembers(page, avatars);
}

async function capture(page, args: string[]) {
  const label = argValue(args, '--label');
  const outArg = argValue(args, '--out');
  if (!label || !outArg) throw new Error('capture needs --label <name> and --out <dir>');
  const out = resolve(PROJECT_ROOT, outArg);
  if (existsSync(resolve(out, 'index.json')) && !args.includes('--force')) throw new Error(`${rel(out)} already holds index.json: goldens are not overwritten without --force`);
  await assertDevBundle(page);
  await mkdir(out, { recursive: true });
  const files = await caseFiles(argValue(args, '--cases'));
  const cliGroup = argValue(args, '--group');

  const headerArg = argValue(args, '--run-header');
  let runHeader: { path: string; sha256: string; captured: boolean };
  let servedSha: string | null = null;
  if (headerArg) {
    const path = resolve(PROJECT_ROOT, headerArg);
    const raw = await readFile(path, 'utf-8');
    servedSha = JSON.parse(raw)?.bundle?.served?.sha256 ?? null;
    runHeader = { path: rel(path), sha256: sha256(raw), captured: false };
  } else {
    const header = await captureHeader(page, `payload-${label}`);
    const raw = JSON.stringify(header, null, 2);
    await writeFile(resolve(out, 'run-header.json'), raw, 'utf-8');
    servedSha = header?.bundle?.served?.sha256 ?? null;
    runHeader = { path: rel(resolve(out, 'run-header.json')), sha256: sha256(raw), captured: true };
  }
  const served = await readServedManifest(page);
  const stale = bundleWarning(servedSha, served.bundleSha256);
  if (stale) throw new Error(`refusing to capture: ${stale}; run node scripts/debug/st-session.mts reload`);

  const cases: Array<{ case: string; file: string; fixture: string; fixtureSha256: string; captures: number; renderedSha256: string }> = [];
  for (const file of files) {
    const name = basename(file, '.json');
    const raw = await readFile(file, 'utf-8');
    const requires = requiresOf(JSON.parse(raw));
    const group = requiredGroup(requires, cliGroup).group;
    await installPayloadProbe(page);
    console.log(`case ${name}: running ${rel(file)}${group ? ` in group ${group}` : ''}`);
    const result: any = await runScenario(page, rel(file), { sandbox: true, keep: false, group });
    const probe = await readProbe(page);
    const cast = await restoreCast(page, requires, group).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    const failure = !result?.ok ? `the scenario failed: ${result?.error ?? 'unknown'}`
      : probe.modelCalls.length ? `a model call happened during the case: ${JSON.stringify(probe.modelCalls.slice(0, 3))}`
      : !probe.captures.length ? 'the case captured nothing'
      : cast && 'error' in cast ? `could not re-enable the cast after cleanup: ${cast.error}`
      : null;
    if (failure) {
      await writeFile(resolve(out, 'capture-failed.json'), JSON.stringify({ label, case: name, failure, result, modelCalls: probe.modelCalls, cast }, null, 2), 'utf-8');
      throw new Error(`case ${name}: ${failure} (details in ${rel(resolve(out, 'capture-failed.json'))})`);
    }
    const payloadCase: PayloadCase = { case: name, fixture: rel(file), fixtureSha256: sha256(raw), chatIds: probe.chatIds, captures: probe.captures };
    await writeFile(resolve(out, `${name}.json`), JSON.stringify(payloadCase, null, 2), 'utf-8');
    const rendered = probe.captures.map((entry) => renderNormalised(entry, probe.chatIds)).join('\n\u0000\n');
    cases.push({ case: name, file: `${name}.json`, fixture: rel(file), fixtureSha256: payloadCase.fixtureSha256, captures: probe.captures.length, renderedSha256: sha256(rendered) });
    console.log(`case ${name}: ${probe.captures.length} capture(s), cast ${JSON.stringify(cast)}`);
  }

  const index = {
    tool: 'so-payload-golden',
    label,
    capturedAt: new Date().toISOString(),
    build: { servedBundleSha256: servedSha, manifest: served },
    runHeader,
    normalisation: NORMALISE_RULES.map((rule) => ({ id: rule.id, pattern: String(rule.pattern), replacement: rule.replacement, why: rule.why })),
    cases,
  };
  await writeFile(resolve(out, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');
  console.log(JSON.stringify({ ok: true, out: rel(out), cases: cases.map((entry) => `${entry.case} (${entry.captures})`), servedBundleSha256: servedSha }, null, 2));
  return { ok: true };
}

async function readGoldenDir(dir: string): Promise<{ index: any; cases: PayloadCase[] }> {
  const indexPath = resolve(dir, 'index.json');
  if (!existsSync(indexPath)) throw new Error(`${rel(dir)} has no index.json: not a completed capture`);
  const index = JSON.parse(await readFile(indexPath, 'utf-8'));
  const cases = await Promise.all((index.cases ?? []).map(async (entry) => JSON.parse(await readFile(resolve(dir, entry.file), 'utf-8')) as PayloadCase));
  return { index, cases };
}

export async function diff(args: string[]) {
  const [baselineArg, candidateArg] = args.slice(1).filter((arg, index, list) => !arg.startsWith('--') && !['--declared', '--out'].includes(list[index - 1] ?? ''));
  if (!baselineArg || !candidateArg) throw new Error('diff needs <baseline-dir> <candidate-dir>');
  const baselineDir = resolve(PROJECT_ROOT, baselineArg);
  const candidateDir = resolve(PROJECT_ROOT, candidateArg);
  const baseline = await readGoldenDir(baselineDir);
  const candidate = await readGoldenDir(candidateDir);
  const declaredArg = argValue(args, '--declared');
  let declarations = [];
  if (declaredArg) {
    const parsed = validateDeclarations(JSON.parse(await readFile(resolve(PROJECT_ROOT, declaredArg), 'utf-8')));
    if (parsed.problems.length) {
      for (const problem of parsed.problems) console.error(`ERROR: ${problem}`);
      return { ok: false };
    }
    declarations = parsed.declarations;
  }
  const report = diffCases(baseline.cases, candidate.cases, declarations);
  for (const line of describeReport(report, declarations)) console.log(line);
  const outPath = resolve(PROJECT_ROOT, argValue(args, '--out') ?? rel(resolve(candidateDir, 'payload-diff.json')));
  await writeFile(outPath, JSON.stringify({
    baseline: { dir: rel(baselineDir), label: baseline.index.label, servedBundleSha256: baseline.index.build?.servedBundleSha256 ?? null },
    candidate: { dir: rel(candidateDir), label: candidate.index.label, servedBundleSha256: candidate.index.build?.servedBundleSha256 ?? null },
    declared: declaredArg,
    ...report,
  }, null, 2), 'utf-8');
  console.log(`Wrote ${rel(outPath)}`);
  return { ok: report.ok };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const command = args[0];
  if (hasHelpFlag(args) || !['capture', 'diff'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag(args) ? 0 : 1);
  }
  if (command === 'diff') {
    diff(args).then((result) => process.exit(result.ok ? 0 : 1), (error) => { console.error('Error:', error instanceof Error ? error.message : String(error)); process.exit(1); });
  } else {
    runCli((page) => capture(page, args));
  }
}
