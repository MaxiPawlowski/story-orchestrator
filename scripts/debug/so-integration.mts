import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../lib/stRoot.mjs';
import { evaluateInST } from './lib/evaluate.mts';
import {
  activeOutages, baselineOf, chatDriftStop, COLUMNS, columnSettings, deepMerge, IntegrationStop, mutationStop, diffReopen, engineHistoryFrom, freezeCheck, lineFor, mutationAfter, outageMatcher,
  outagePreflight, parseRouteBlobs, profileSignature, readbackProblems, splitBulkyEvidence, renderPlan, routeSlice, runById, stepReached, summarizeFindings, validateRuns, verifyRun,
  type Column, type Outage, type OutageContext, type ProfileSignature, type RouteDoc, type RunSpec, type RunsDoc, type StoryIndexLike,
} from './lib/integrationRuns.mts';
import { runMutation, runTurn, type LiveDeps, type MutationVerb } from './lib/sessionLive.mts';

const USAGE = `Usage: node scripts/debug/so-integration.mts <command> [...]

v2.6 plan 09 (AS-15): the integration runs I1-I6, tier T7, frozen in test/measurements/v2.6-09/runs.json.

  validate
      read the route files at the campaign pin, refuse on a sha256 that differs from runs.json, then check
      every run (tier, command plan, both columns, artifacts, route checkpoints in the story index, I4
      mutation verbs, I5 services, I6 cut points)
  plan <I#> --column on|defaults --lane <n> [--out <dir>] [--accept-fallback]
      print the exact command sequence for one run on one lane
  settings <I#> --column on|defaults --out <dir> [--accept-fallback]      (in a lane: st-lanes run <n> -- ...)
      clear the settings root to the baseline, write the column patch (images/sprites off), reload,
      switch WI gating through the author's confirm, read back; writes settings-readback.json, exit 1 on a mismatch
  open <I#> --column on|defaults --out <dir>
      open the run's group, start its fresh chat(s), select the story, set Author view per column; writes chats.json
  play <I#> --column on|defaults --out <dir>
      refuses unless the open group, chat, story and settings are the run's; spawns the journal and payload
      tails, drives the route (play-then-set), mutations, outages and reopen cuts, then exports the journal,
      engine history and evidence of every chat touched; writes turns.jsonl, reopen.jsonl, outages.jsonl, findings.json
  verify <dir> <I#> [--column on|defaults] [--attempt n]
      exit 1 on a missing or empty artifact, forced steps above the declared max, a vacuous outage, a
      never-performed mutation, or a non-empty reopen diff (I6: <dir> is the out root holding I1-I3)`;

export const RUNS_PATH = resolve(REPO_ROOT, 'test', 'measurements', 'v2.6-09', 'runs.json');

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'));

export const argValue = (args: string[], flag: string): string | null => {
  const at = args.indexOf(flag);
  return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : null;
};

export function parseColumn(value: string | null): Column {
  if (!value || !(COLUMNS as readonly string[]).includes(value)) throw new Error(`--column takes on or defaults, not ${String(value)}`);
  return value as Column;
}

export type GitShow = (repo: string, commit: string, file: string) => Buffer | null;

export const gitShow: GitShow = (repo, commit, file) => {
  try {
    return execFileSync('git', ['-C', repo, 'show', `${commit}:${file}`], { maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
};

export function readPinnedBlobs(doc: RunsDoc, show: GitShow = gitShow): Record<string, Buffer | null> {
  return Object.fromEntries(Object.keys(doc.campaign.routes).map((file) => [file, show(doc.campaign.repo, doc.campaign.commit, file)]));
}

export async function loadFrozen({ runsPath = RUNS_PATH, show = gitShow, index = null as StoryIndexLike | null } = {}) {
  const doc: RunsDoc = await readJson(runsPath);
  const pin = await readJson(resolve(REPO_ROOT, doc.campaign.pinFile)).catch(() => null);
  const blobs = readPinnedBlobs(doc, show);
  const freeze = freezeCheck(doc, blobs);
  const pinProblems = pin && pin.commit !== doc.campaign.commit ? [`${doc.campaign.pinFile} pins ${pin.commit}, runs.json froze ${doc.campaign.commit}: re-freeze the runs before playing`] : [];
  if (freeze.length) return { doc, routes: {} as Record<string, RouteDoc[]>, problems: [...pinProblems, ...freeze], frozen: false };
  const routes = parseRouteBlobs(blobs);
  const storyIndex = index ?? await readJson(resolve(REPO_ROOT, doc.storyIndex));
  return { doc, routes, problems: [...pinProblems, ...validateRuns(doc, storyIndex, routes)], frozen: true };
}

export interface PageRead {
  chatId: string | null; groupId: string | null; groupName: string | null; storyId: string | null; activeCheckpointId: string | null;
  activeCheckpointName: string | null; userMessages: number; blackboard: Record<string, unknown>;
}

export async function readPage(page: any): Promise<PageRead> {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const snapshot = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.() ?? {};
    const group = (ctx.groups ?? []).find((candidate: any) => candidate.id === ctx.groupId);
    return {
      chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, groupName: group?.name ?? null, storyId: snapshot.storyId ?? null,
      activeCheckpointId: snapshot.activeCheckpointId ?? null, activeCheckpointName: snapshot.activeCheckpointName ?? null,
      userMessages: (Array.isArray(ctx.chat) ? ctx.chat : []).filter((message: any) => message?.is_user).length,
      blackboard: snapshot.blackboard ?? {},
    };
  });
}

export function checkPreconditions(read: PageRead, chats: any, readback: any, run: RunSpec, column: Column, turnsExist: boolean): string[] {
  const problems: string[] = [];
  if (!chats) return [`no chats.json in the out dir: run \`so-integration.mts open ${run.id} --column ${column} --out <dir>\` first`];
  if (!readback) problems.push(`no settings-readback.json in the out dir: run \`so-integration.mts settings ${run.id} --column ${column} --out <dir>\` first`);
  else {
    if (readback.column !== column) problems.push(`the settings were applied for column ${readback.column}, not ${column}`);
    if (readback.ok !== true) problems.push(`the settings read-back failed: ${(readback.problems ?? []).join('; ')}`);
  }
  if (chats.run !== run.id || chats.column !== column) problems.push(`chats.json belongs to ${chats.run}/${chats.column}, not ${run.id}/${column}`);
  if (read.groupName !== run.group) problems.push(`the open group is "${read.groupName}", not the run's group "${run.group}"`);
  if (!read.groupId || read.groupId !== chats.groupId) problems.push(`the open group id ${read.groupId} is not the one the run opened (${chats.groupId})`);
  const primary = (chats.chats ?? []).filter((chat: any) => chat.primary).pop();
  if (!primary || read.chatId !== primary.chatId) problems.push(`the open chat ${read.chatId} is not the run's fresh chat ${primary?.chatId ?? '(none)'}`);
  if (read.storyId !== run.story) problems.push(`the open chat plays ${read.storyId}, not ${run.story}`);
  if (read.userMessages > 0 || turnsExist) problems.push(`the chat is not fresh (${read.userMessages} player message(s)${turnsExist ? ', turns.jsonl already exists' : ''})`);
  return problems;
}

export interface Tails { stop: () => Promise<void> }

export interface PlayDeps extends LiveDeps {
  spawnTails: (out: string) => Promise<Tails>;
  settleChat: (page: any) => Promise<void>;
  captureEvidence: (page: any) => Promise<any>;
  evidenceProblems: (evidence: any) => string[];
  readJournal: (page: any) => Promise<any>;
  sleep: (ms: number) => Promise<void>;
}

export async function readOutageContext(page: any): Promise<OutageContext> {
  const raw = await evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const cm = ctx.extensionSettings?.connectionManager ?? {};
    const profiles: any[] = Array.isArray(cm.profiles) ? cm.profiles : [];
    const settings = (globalThis as any).storyOrchestratorRuntime?.getGlobalSettings?.() ?? ctx.extensionSettings?.['story-orchestrator']?.settings ?? {};
    const pick = (id: unknown) => {
      const profile = profiles.find((entry) => entry?.id === id);
      return profile ? { name: profile.name, mode: profile.mode, api: profile.api, model: profile.model, 'api-url': profile['api-url'] } : null;
    };
    const memoryIds = [...new Set([settings.extraction?.profileId, ...Object.values(settings.extraction?.profiles ?? {})].filter(Boolean))];
    return { memory: memoryIds.map(pick).filter(Boolean), main: pick(cm.selectedProfile) };
  });
  return {
    memory: (raw.memory as Array<Record<string, unknown>>).map(profileSignature).filter((entry): entry is ProfileSignature => Boolean(entry)),
    main: profileSignature(raw.main as Record<string, unknown> | null),
  };
}

export async function captureReopenState(page: any) {
  return evaluateInST(page, async () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    let scan: string | null = null;
    try {
      const wi = await import(/* webpackIgnore: true */ '/scripts/world-info.js' as string) as { getSortedEntries?: () => Promise<unknown> };
      if (typeof wi.getSortedEntries === 'function') await wi.getSortedEntries();
      else scan = 'getSortedEntries missing';
    } catch (error) {
      scan = String((error as Error)?.message ?? error);
    }
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const snapshot = rt?.getSnapshot?.() ?? {};
    const blob = ctx.chatMetadata?.story_orchestrator ?? null;
    const record = blob?.stories?.[blob?.selectedStoryId] ?? null;
    const sprites = (globalThis as any).storyOrchestratorSprites;
    return {
      chatId: ctx.chatId ?? null,
      engine: { activeCheckpointId: snapshot.activeCheckpointId ?? null, boundary: snapshot.boundary ?? null, blackboard: snapshot.blackboard ?? null, visitedPath: record?.engineState?.visitedPath ?? null },
      wi: { gating: snapshot.wiGating ?? null, scanGate: snapshot.scanGate ?? null, scanError: scan },
      sampler: snapshot.samplerOverlay ?? null,
      sprites: sprites?.view ? sprites.view() : null,
      timeline: snapshot.inline ?? null,
    };
  });
}

export async function readEngineHistory(page: any) {
  const blob = await evaluateInST(page, () => (globalThis as any).SillyTavern.getContext().chatMetadata?.story_orchestrator ?? null);
  return engineHistoryFrom(blob);
}

export const authorSet = (page: any, key: string, value: unknown) => evaluateInST(page, async ({ key: name, value: raw }: { key: string; value: unknown }) => {
  await (globalThis as any).storyOrchestratorRuntime.setQuality(name, String(raw));
}, { key, value });

export const authorActivate = (page: any, id: string) => evaluateInST(page, async (checkpoint: string) => {
  await (globalThis as any).storyOrchestratorRuntime.activateCheckpoint(checkpoint);
}, id);

export async function playRun(page: any, { doc, run, column, out, routes, deps }: {
  doc: RunsDoc; run: RunSpec; column: Column; out: string; routes: Record<string, RouteDoc[]>; deps: PlayDeps;
}) {
  if (run.ridesOn) throw new Error(`${run.id} has no play of its own: it rides on ${run.ridesOn.join(', ')}`);
  const chatsPath = resolve(out, 'chats.json');
  const chats = existsSync(chatsPath) ? await readJson(chatsPath) : null;
  const readback = existsSync(resolve(out, 'settings-readback.json')) ? await readJson(resolve(out, 'settings-readback.json')) : null;
  const read = await readPage(page);
  const refusals = checkPreconditions(read, chats, readback, run, column, existsSync(resolve(out, 'turns.jsonl')));
  if (refusals.length) throw new Error(`refusing to play ${run.id}/${column}:\n- ${refusals.join('\n- ')}`);
  const outageContext = run.outages ? await readOutageContext(page) : { memory: [], main: null };
  const preflight = run.outages ? outagePreflight(run, outageContext) : [];
  if (preflight.length) throw new Error(`refusing to play ${run.id}/${column}:\n- ${preflight.join('\n- ')}`);

  const { steps } = routeSlice(routes, run.route!);
  const drive = run.drive!;
  const totalTurns = drive.mode === 'turns' ? Number(drive.turns) : Number.POSITIVE_INFINITY;
  const options = { timeoutMs: doc.drive.timeoutMs, quietMs: doc.drive.quietMs };
  const primary = (chats.chats as any[]).filter((chat) => chat.primary).pop();
  const secondary = (chats.chats as any[]).filter((chat) => !chat.primary);
  const touched = new Set<string>((chats.chats as any[]).map((chat) => chat.chatId));
  let seq = 0;
  const rows: any[] = [];
  const append = async (file: string, row: Record<string, unknown>) => {
    const stamped = file === 'turns.jsonl' ? { seq: ++seq, ...row } : row;
    if (file === 'turns.jsonl') rows.push(stamped);
    await appendFile(resolve(out, file), `${JSON.stringify(stamped)}\n`, 'utf-8');
    return stamped;
  };

  let current: Outage[] = [];
  const tallies = new Map<string, { aborted: number; pipeline: Array<string | null> }>();
  const keyOf = (outage: Outage) => `${outage.service}:${outage.fromTurn}`;
  const matcher = outageMatcher(doc, () => current, outageContext);
  const handler = async (route: any) => {
    const request = route.request();
    const verdict = matcher({ url: request.url(), method: request.method(), postData: request.postData() });
    if (verdict.abort) {
      const outage = current.find((candidate) => candidate.service === verdict.service);
      if (outage) tallies.get(keyOf(outage))!.aborted += 1;
      await route.abort('connectionrefused');
      return;
    }
    await route.fallback();
  };

  const tails = await deps.spawnTails(out);
  await deps.sleep(doc.drive.tailReadyMs);
  if (run.outages) {
    for (const outage of run.outages) tallies.set(keyOf(outage), { aborted: 0, pipeline: [] });
    await page.route('**/api/**', handler);
  }
  let turn = 0;
  const exportProblems: string[] = [];
  try {
    const playTurn = async (line: string) => {
      const drift = chatDriftStop((await readPage(page)).chatId, primary.chatId, `before turn ${turn + 1}`);
      if (drift) throw new IntegrationStop(drift);
      turn += 1;
      current = activeOutages(run, turn);
      const row = await runTurn(page, line, deps, options);
      for (const outage of current) tallies.get(keyOf(outage))!.pipeline.push(row.pipeline?.state ?? null);
      await append('turns.jsonl', { ...row, turn, outages: current.map((outage) => outage.service) });
      for (const outage of (run.outages ?? []).filter((candidate) => candidate.toTurn === turn)) {
        const tally = tallies.get(keyOf(outage))!;
        const status = tally.aborted > 0 ? 'cut' : outage.exercisable ? 'vacuous' : 'unexercised';
        await append('outages.jsonl', { service: outage.service, fromTurn: outage.fromTurn, toTurn: outage.toTurn, exercisable: outage.exercisable, aborted: tally.aborted, pipelineDuring: tally.pipeline, status, ...(outage.why ? { why: outage.why } : {}) });
      }
      current = [];
      const mutation = mutationAfter(run, turn);
      if (mutation) {
        const args: Record<string, unknown> = {};
        if (mutation.verb === 'edit') Object.assign(args, { messageId: 'last', text: doc.drive.editText });
        if (mutation.verb === 'delete') Object.assign(args, { messageId: 'last' });
        if (mutation.verb === 'switch-chat-mid-gen' || mutation.verb === 'reload-mid-gen') Object.assign(args, { line: lineFor(doc, { checkpointName: null, turn, free: true }), chatId: primary.chatId, group: run.group });
        if (mutation.verb === 'switch-chat-mid-gen') { args.to = secondary[0]?.chatId ?? null; if (args.to) touched.add(String(args.to)); }
        const done = await runMutation(page, mutation.verb as MutationVerb, args, deps, options).catch((error) => ({ kind: 'mutation', verb: mutation.verb, ok: false, problems: [error instanceof Error ? error.message : String(error)] }));
        await append('turns.jsonl', { ...done, kind: 'mutation', verb: mutation.verb, afterTurn: turn });
        const stop = mutationStop(mutation.verb, done as { ok?: boolean; problems?: string[] }, (await readPage(page)).chatId, primary.chatId);
        if (stop) throw new IntegrationStop(stop);
      }
    };
    const cut = async (afterStep: number, expect: string) => {
      await deps.waitScheduler(page, doc.drive.timeoutMs, doc.drive.quietMs).catch(() => undefined);
      await deps.settleChat(page);
      const before = await captureReopenState(page);
      await deps.reload(page);
      await deps.openChat(page, { chatId: primary.chatId, group: run.group });
      await deps.settleChat(page);
      const after = await captureReopenState(page);
      await append('reopen.jsonl', { afterStep, expect, at: new Date().toISOString(), before, after, diff: diffReopen(before, after, doc.reopenFields) });
    };
    let previous: string | null = null;
    for (let index = 0; index < steps.length && turn < totalTurns; index += 1) {
      const step = steps[index];
      const stepIndex = run.route!.from + index;
      let outcome: string | null = null;
      let used = 0;
      for (let k = 0; k < drive.turnsPerStep && turn < totalTurns; k += 1) {
        if (stepReached(await readPage(page), step, previous)) { outcome = 'played'; break; }
        const name = (await readPage(page)).activeCheckpointName;
        await playTurn(lineFor(doc, { checkpointName: step.expect === previous ? name : step.expect, turn: turn + 1, free: false }));
        used += 1;
      }
      if (!outcome && stepReached(await readPage(page), step, previous)) outcome = 'played';
      if (!outcome) {
        for (const [key, value] of Object.entries(step.set ?? {})) await authorSet(page, key, value);
        if (step.activate) await authorActivate(page, step.activate);
        if (turn < totalTurns) { await playTurn(lineFor(doc, { checkpointName: step.expect, turn: turn + 1, free: false })); used += 1; }
        if (stepReached(await readPage(page), step, previous)) outcome = 'forced';
        else {
          await authorActivate(page, step.expect);
          outcome = (await readPage(page)).activeCheckpointId === step.expect ? 'activated' : 'failed';
        }
      }
      await append('turns.jsonl', { kind: 'step', stepIndex, expect: step.expect, set: step.set ?? null, activate: step.activate ?? null, outcome, turns: used, turn });
      previous = step.expect;
      if ((run.cuts ?? []).includes(index)) await cut(index, step.expect);
    }
    while (drive.mode === 'turns' && turn < totalTurns) await playTurn(lineFor(doc, { checkpointName: null, turn: turn + 1, free: true }));
  } catch (error) {
    if (!(error instanceof IntegrationStop)) throw error;
    await append('turns.jsonl', { kind: 'stop', turn, problems: [error.message] });
  } finally {
    if (run.outages) await page.unroute('**/api/**', handler).catch(() => undefined);
    for (const chatId of touched) {
      try {
        await deps.openChat(page, { chatId, group: run.group });
        await deps.settleChat(page);
        const evidence = await deps.captureEvidence(page);
        const split = splitBulkyEvidence(evidence, chatId);
        if (split.full) await writeFile(resolve(out, split.full.file), split.full.text, 'utf-8');
        await writeFile(resolve(out, `evidence-${chatId}.json`), split.committed, 'utf-8');
        for (const problem of deps.evidenceProblems(evidence)) exportProblems.push(`${chatId}: ${problem}`);
        const journal = await deps.readJournal(page);
        if (journal && !journal.error) await writeFile(resolve(out, `journal-${chatId}.json`), JSON.stringify(journal, null, 2), 'utf-8');
        else exportProblems.push(`${chatId}: journal export failed: ${journal?.error ?? 'nothing returned'}`);
        const history = await readEngineHistory(page);
        if (history?.engineHistory) await writeFile(resolve(out, `engine-history-${chatId}.json`), JSON.stringify({ chatId, ...history }, null, 1), 'utf-8');
        else exportProblems.push(`${chatId}: no engine history in the chat's story blob`);
      } catch (error) {
        exportProblems.push(`${chatId}: export failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await writeFile(chatsPath, JSON.stringify({ ...chats, touched: [...touched] }, null, 2), 'utf-8');
    await deps.sleep(doc.drive.tailDrainMs);
    await tails.stop();
  }
  const findings = [
    ...summarizeFindings(rows),
    ...rows.filter((row) => row.kind === 'step' && row.outcome !== 'played').map((row) => ({ seq: row.seq, kind: 'step', problem: `step ${row.stepIndex} (${row.expect}) ${row.outcome}` })),
    ...exportProblems.map((problem) => ({ seq: null, kind: 'export', problem })),
  ];
  const report = { run: run.id, column, generatedAt: new Date().toISOString(), turns: turn, findings, unexercised: doc.media.unexercised, fallbacksUsed: readback?.fallbacksUsed ?? [] };
  await writeFile(resolve(out, 'findings.json'), JSON.stringify(report, null, 2), 'utf-8');
  return report;
}

async function realPlayDeps(): Promise<PlayDeps> {
  const [{ defaultLiveDeps }, evidence, journal] = await Promise.all([
    import('./lib/sessionDriver.mts'), import('./lib/sessionEvidence.mts'), import('./so-journal.mts'),
  ]);
  const live = await defaultLiveDeps();
  const navigation = await import('./st-navigation.mts');
  return {
    ...live,
    settleChat: async (page) => {
      await navigation.waitForSettledChat(page, { quietMs: 1500, timeoutMs: 60000 });
      const started = Date.now();
      while (Date.now() - started < 30000) {
        const saving = await evaluateInST(page, async () => Boolean(((await import(/* webpackIgnore: true */ '/script.js' as string)) as { isChatSaving?: boolean }).isChatSaving));
        if (!saving) break;
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(2000);
    },
    captureEvidence: (page) => evidence.captureEvidence(page),
    evidenceProblems: (value) => evidence.evidenceProblems(value),
    readJournal: (page) => journal.readSessionJournal(page),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    spawnTails: async (out) => {
      const children = [
        ['journal', ['scripts/debug/so-journal.mts', 'follow', '--out', resolve(out, 'journal.jsonl')]],
        ['payloads', ['scripts/debug/st-payload.mts', 'arm', '--persist', '--out', resolve(out, 'payloads.jsonl')]],
      ].map(([name, args]) => {
        const log = createWriteStream(resolve(out, `${name}.log`), { flags: 'a' });
        const child = spawn(process.execPath, args as string[], { cwd: REPO_ROOT, env: process.env, windowsHide: true });
        child.stdout?.pipe(log);
        child.stderr?.pipe(log);
        return child;
      });
      return {
        stop: async () => {
          for (const child of children) {
            if (child.exitCode !== null) continue;
            if (process.platform === 'win32' && child.pid) { try { execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f']); } catch { child.kill(); } } else child.kill();
          }
        },
      };
    },
  };
}

async function settingsCommand(page: any, doc: RunsDoc, run: RunSpec, column: Column, out: string, acceptFallback: boolean) {
  const [{ saveSettingsNow }, wi, { defaultLiveDeps }] = await Promise.all([import('./lib/settingsSave.mts'), import('./lib/wiGatingHarness.mts'), import('./lib/sessionDriver.mts')]);
  const spec = doc.columns[column];
  const { refusal, patch, fallbacksUsed } = columnSettings(doc, column, { acceptFallback });
  if (refusal) throw new Error(refusal);
  const raw = await evaluateInST(page, () => (globalThis as any).SillyTavern.getContext().extensionSettings?.['story-orchestrator']?.settings ?? {});
  const next = deepMerge(baselineOf(raw, doc.baseline.preserve), patch!);
  await evaluateInST(page, (value: Record<string, unknown>) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const root = (ctx.extensionSettings['story-orchestrator'] ||= {});
    root.settings = value;
  }, next);
  await saveSettingsNow(page);
  await (await defaultLiveDeps()).reload(page);
  const gating = await wi.readWiGating(page);
  const switched = gating?.mode === spec.wiGating ? null : await wi.applyWiGating(page, spec.wiGating);
  const back = await evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const root = ctx.extensionSettings?.['story-orchestrator'];
    return { raw: root ? root.settings ?? {} : null, effective: (globalThis as any).storyOrchestratorRuntime?.getGlobalSettings?.() ?? null };
  });
  const problems = readbackProblems(back.effective, back.raw, spec.readback);
  const report = { run: run.id, column, at: new Date().toISOString(), ok: problems.length === 0, problems, fallbacksUsed, preserved: doc.baseline.preserve, patch, wiGating: { wanted: spec.wiGating, before: gating, switched }, raw: back.raw, effective: back.effective };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'settings-readback.json'), JSON.stringify(report, null, 2), 'utf-8');
  return report;
}

async function openCommand(page: any, run: RunSpec, column: Column, out: string, authorView: boolean) {
  const [navigation, deps] = await Promise.all([import('./st-navigation.mts'), realPlayDeps()]);
  if (existsSync(resolve(out, 'chats.json'))) throw new Error(`${out} already holds chats.json: use a fresh out dir per run`);
  await navigation.openGroup(page, run.group);
  await deps.settleChat(page);
  const opened: Array<{ chatId: string; primary: boolean }> = [];
  const problems: string[] = [];
  for (let at = 0; at < run.chats; at += 1) {
    await navigation.startNewChat(page);
    await deps.settleChat(page);
    const loaded = await evaluateInST(page, async ({ id, authorView: view }: { id: string; authorView: boolean }) => {
      const rt = (globalThis as any).storyOrchestratorRuntime;
      if (rt.getSnapshot()?.storyId !== id) await rt.selectStory(id);
      const started = Date.now();
      while (Date.now() - started < 30000 && rt.getSnapshot()?.storyId !== id) await new Promise((done) => setTimeout(done, 250));
      await rt.setUiSettings?.({ authorView: view });
      return { storyId: rt.getSnapshot()?.storyId ?? null, chatId: (globalThis as any).SillyTavern.getContext().chatId ?? null };
    }, { id: run.story, authorView });
    if (loaded.storyId !== run.story) problems.push(`chat ${loaded.chatId}: story ${run.story} did not load (${loaded.storyId})`);
    await deps.settleChat(page);
    opened.push({ chatId: loaded.chatId, primary: at === run.chats - 1 });
  }
  const read = await readPage(page);
  if (read.groupName !== run.group) problems.push(`the open group is "${read.groupName}", not "${run.group}"`);
  const record = { run: run.id, column, group: run.group, groupId: read.groupId, storyId: run.story, authorView, chats: opened, touched: [], openedAt: new Date().toISOString(), problems };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'chats.json'), JSON.stringify(record, null, 2), 'utf-8');
  return { ok: problems.length === 0, ...record };
}

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') { console.log(USAGE); return; }
  if (command === 'verify') {
    const [dirArg, id] = rest.filter((arg, at) => !arg.startsWith('--') && !['--column', '--attempt'].includes(rest[at - 1]));
    if (!dirArg || !id) throw new Error('verify needs <dir> <I#>');
    const doc: RunsDoc = await readJson(RUNS_PATH);
    const run = runById(doc, id);
    if (!run) throw new Error(`no run ${id}`);
    const column = parseColumn(argValue(rest, '--column') ?? 'on');
    const result = { run: run.id, dir: resolve(REPO_ROOT, dirArg), ...verifyRun(resolve(REPO_ROOT, dirArg), run, doc, { column, attempt: Number(argValue(rest, '--attempt') ?? 1) }) };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const loaded = await loadFrozen();
  if (command === 'validate') {
    console.log(JSON.stringify({ ok: loaded.problems.length === 0, frozen: loaded.frozen, commit: loaded.doc.campaign.commit, runs: loaded.doc.runs.map((run) => run.id), problems: loaded.problems }, null, 2));
    if (loaded.problems.length) process.exitCode = 1;
    return;
  }
  if (loaded.problems.length) throw new Error(`the runs file does not validate:\n- ${loaded.problems.join('\n- ')}`);
  const id = rest.find((arg, at) => !arg.startsWith('--') && !['--column', '--lane', '--out'].includes(rest[at - 1]));
  const run = id ? runById(loaded.doc, id) : null;
  if (!run) throw new Error(`${command} needs a run id (I1-I6)`);
  const column = parseColumn(argValue(rest, '--column'));
  if (command === 'plan') {
    const lane = Number(argValue(rest, '--lane'));
    for (const line of renderPlan(loaded.doc, run.id, column, lane, { out: argValue(rest, '--out'), acceptFallback: rest.includes('--accept-fallback') })) console.log(line);
    return;
  }
  const outArg = argValue(rest, '--out');
  if (!outArg) throw new Error(`${command} needs --out <dir>`);
  const out = resolve(REPO_ROOT, outArg);
  if (/[\\/]\.debug([\\/]|$)/.test(out)) throw new Error('refusing an out dir under .debug/: ST serves it');
  if (run.ridesOn) throw new Error(`${run.id} rides on ${run.ridesOn.join(', ')}: play those, then verify ${run.id}`);
  const { runCli } = await import('./lib/cli.mts');
  await runCli(async (page) => {
    if (command === 'settings') {
      const report = await settingsCommand(page, loaded.doc, run, column, out, rest.includes('--accept-fallback'));
      console.log(JSON.stringify({ ok: report.ok, problems: report.problems, fallbacksUsed: report.fallbacksUsed }, null, 2));
      return { ok: report.ok };
    }
    if (command === 'open') {
      const report = await openCommand(page, run, column, out, loaded.doc.columns[column].authorView);
      console.log(JSON.stringify(report, null, 2));
      return { ok: report.ok };
    }
    if (command === 'play') {
      await mkdir(out, { recursive: true });
      const report = await playRun(page, { doc: loaded.doc, run, column, out, routes: loaded.routes, deps: await realPlayDeps() });
      console.log(JSON.stringify({ run: report.run, column, turns: report.turns, findings: report.findings.length, next: `node scripts/debug/so-integration.mts verify ${outArg} ${run.id} --column ${column}` }, null, 2));
      return { ok: true };
    }
    throw new Error(`unknown command ${command}\n${USAGE}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
