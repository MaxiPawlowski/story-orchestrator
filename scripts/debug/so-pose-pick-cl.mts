import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { runCli } from './lib/cli.mts';
import { DEBUG_DIR, PROJECT_ROOT } from './lib/connection.mts';
import { ensureSTReady } from './lib/st-ready.mts';
import { lanesRootFor } from '../lib/stRoot.mjs';
import { judgeBudget, lanePrepare, lanePrepareProblems, readFixture, runRecordName, scoreRun, tallyJudge, type JudgeResultRow, type PickRow } from './lib/posePickCl.mts';

const HARNESS = 'opencode';
const AUTHORING_MODEL = 'openai/gpt-6.1-sol';
const SENTINEL = 'so-pose-pick-cl-authoring-route';
const USAGE = `Usage:
  node scripts/debug/so-pose-pick-cl.mts prepare <lane>
  node scripts/debug/st-lanes.mts run <lane> -- scripts/debug/so-pose-pick-cl.mts run --arm chain|llm --run <k> --label <name>
  node scripts/debug/so-pose-pick-cl.mts summary <dir>
Scores test/fixtures/poses/replies.json through the stage's own pose pick (StagePoses.pick: pickPose with the shipped expression deps) on a lane.
Arm chain: the shipped judge, then the authoring harness route (opencode ${AUTHORING_MODEL}) in place of the sprite profile, then none.
Arm llm: the authoring harness route alone (the judge leg is not asked). Floor 0.80, informational.`;

const flag = (name: string, fallback = '') => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1] ?? fallback;
};

async function prepare(lane: number) {
  const path = resolve(lanesRootFor(process.env, PROJECT_ROOT), String(lane), 'data', 'default-user', 'settings.json');
  const settings = JSON.parse(await readFile(path, 'utf-8'));
  const changed = lanePrepare(settings);
  await writeFile(path, JSON.stringify(settings, null, 4), 'utf-8');
  const problems = lanePrepareProblems(JSON.parse(await readFile(path, 'utf-8')));
  if (problems.length) throw new Error(`lane ${lane}: the read-back failed: ${problems.join('; ')}`);
  console.log(JSON.stringify({ lane, readBack: 'ok', was: changed.was, imageExtension: changed.extension }));
}

async function reloadFresh(page: Page) {
  const cache = await page.context().newCDPSession(page);
  await cache.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.reload();
  await ensureSTReady(page);
  await cache.detach();
  await page.waitForFunction(() => {
    const root = globalThis as any;
    return root.storyOrchestratorRuntime?.getJudge?.() && root.storyOrchestratorSprites && root.webpackChunkstory_orchestrator;
  }, undefined, { timeout: 90000 });
}

async function main(page: Page) {
  const arm = flag('--arm', 'chain');
  const run = Number(flag('--run', '1'));
  const label = flag('--label', new Date().toISOString().replace(/[:.]/g, '-'));
  const model = flag('--model', AUTHORING_MODEL);
  if (arm !== 'chain' && arm !== 'llm') throw new Error('--arm is chain or llm');
  const replies = readFixture(JSON.parse(await readFile(resolve(PROJECT_ROOT, 'test/fixtures/poses/replies.json'), 'utf-8')));
  await reloadFresh(page);
  const outcome = await page.evaluate(async ({ replies, arm, harness, model, sentinel }) => {
    const root = globalThis as any;
    const rt = root.storyOrchestratorRuntime, ctx = root.SillyTavern.getContext(), stage = root.storyOrchestratorSprites;
    if (typeof stage?.poseController !== 'function' || typeof stage?.beginHeadRun !== 'function') throw new Error('the served bundle has no stage pose controller: stale build');
    const cache = (() => {
      let req: any = null;
      root.webpackChunkstory_orchestrator.push([[Symbol('so-pose-pick-cl')], {}, (r: any) => { req = r; }]);
      for (const [id, factory] of Object.entries(req.m) as any[]) {
        if (!String(factory).includes('refreshHarnessStatus:()=>') || !String(factory).includes('sendHarness:()=>')) continue;
        return req(id);
      }
      throw new Error('the served bundle exposes no harness cache module');
    })();
    const settings = rt.getGlobalSettings();
    const headers = ctx.getRequestHeaders();
    const status = async () => {
      const response = await fetch('/api/plugins/story-orchestrator-judge/status', { headers });
      if (!response.ok) return { error: response.status };
      const data = await response.json();
      return { configured: data.configured === true, keySource: data.keySource ?? null, model: data.model ?? null, served: data.served ?? null, refusals: data.refusals ?? null };
    };
    const profile = (id: string | null) => {
      const found = (ctx.extensionSettings?.connectionManager?.profiles ?? []).find((entry: any) => entry.id === id);
      return found ? { name: found.name ?? null, api: found.api ?? null, mode: found.mode ?? null, model: found.model ?? null } : null;
    };
    const shippedProfileId = settings.sprites.profileId || settings.image.directorProfileId || null;
    const hs = await cache.refreshHarnessStatus(true);
    const row = hs?.harnesses?.[harness];
    const usable = Boolean(row && row.installed && row.offered && !row.blocked && row.loggedIn !== false && row.models.some((entry: any) => entry.id === model));
    const preflight = {
      judge: { enabled: settings.judge.enabled, expressions: settings.judge.uses?.expressions ?? null, timeoutMs: settings.judge.timeoutMs, provider: settings.judge.provider ?? null, routes: settings.judge.routes ?? null },
      shippedLlmLeg: { sprites: settings.sprites.profileId ?? null, director: settings.image.directorProfileId ?? null, resolved: profile(shippedProfileId) },
      harness: { id: harness, model, installed: row?.installed ?? null, offered: row?.offered ?? null, blocked: row?.blocked ?? null, loggedIn: row?.loggedIn ?? null, fresh: row?.fresh ?? null,
        listed: Boolean(row?.models?.some((entry: any) => entry.id === model)), usable },
      poses: settings.sprites.poses, customPoses: (settings.sprites.customPoses ?? []).length, sprites: settings.sprites.enabled, image: settings.image.enabled, plugin: await status(),
    };
    const judge = rt.getJudge();
    const judgeResults: any[] = [];
    const own = Object.hasOwn(judge, 'ask');
    const originalAsk = judge.ask;
    judge.ask = async (...args: any[]) => {
      if (arm === 'llm') { judgeResults.push({ use: args[0], skipped: true }); return { answers: null, model: null, latencyMs: 0, fallback: 'unavailable', cached: false }; }
      const result = await originalAsk.apply(judge, args);
      judgeResults.push({ use: args[0], cached: result.cached === true, fallback: result.fallback ?? null, model: result.model ?? null, latencyMs: result.latencyMs ?? 0, answered: Boolean(result.answers) });
      return result;
    };
    const sharedPath = '/scripts/extensions/shared.js';
    const shared = await import(sharedPath);
    const service = shared.ConnectionManagerRequestService;
    const originalSend = service.sendRequest;
    const harnessCalls: any[] = [];
    let strayRequests = 0;
    service.sendRequest = async (profileId: string, messages: any[], _maxTokens: number, _custom: any, overrides: any) => {
      if (profileId !== sentinel) { strayRequests += 1; throw new Error('a request for a profile other than the authoring route was refused'); }
      const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
      const user = messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n');
      const entry: any = { grammarSent: typeof overrides?.grammar === 'string' && overrides.grammar.length > 0 };
      const started = performance.now();
      if (!usable) { entry.ok = false; entry.kind = 'not-offered'; harnessCalls.push(entry); throw new Error('the authoring route is not offered on this lane'); }
      const reply = await cache.sendHarness({ harness, model, role: 'authoring', prompt: `${system}\n\nReply to classify:\n${user}\n\nAnswer with exactly one id from the list and nothing else.`,
        maxOutputChars: 960, timeoutMs: 120000, signal: AbortSignal.timeout(125000) });
      entry.ms = Math.round(performance.now() - started);
      entry.ok = reply.ok;
      if (!reply.ok) { entry.kind = reply.kind; entry.message = String(reply.message).slice(0, 300); harnessCalls.push(entry); throw new Error(`${reply.kind}: ${reply.message}`); }
      entry.raw = reply.text; entry.usage = reply.usage ?? null;
      harnessCalls.push(entry);
      return { content: reply.text };
    };
    const priorActors = stage.actors, priorProfile = String(settings.sprites.profileId ?? '');
    const rows: any[] = [];
    try {
      stage.updateSettings({ profileId: sentinel });
      const controller = stage.poseController();
      const members = [...new Set(replies.map((reply: any) => reply.member))] as string[];
      stage.actors = members.map((name) => ({ name, keys: [name.toLowerCase()] }));
      const guard = stage.beginHeadRun();
      for (const reply of replies) {
        const trace = { steps: [] as unknown[], thinking: null };
        const read: any = { who: reply.member, face: 'neutral' };
        const judgeFrom = judgeResults.length, llmFrom = harnessCalls.length, started = performance.now();
        await controller.pick(read, reply.text, reply.member, trace, guard);
        const source = read.poseSource === 'judge' || read.poseSource === 'llm' || read.poseSource === 'none' ? read.poseSource : 'unscored';
        rows.push({ id: reply.id, label: reply.pose, picked: read.pose ?? null, source, sticky: read.poseKeyword ?? null, ms: Math.round(performance.now() - started), steps: trace.steps.length,
          judge: judgeResults.slice(judgeFrom).map((entry) => ({ cached: entry.cached ?? false, fallback: entry.fallback ?? null, answered: entry.answered ?? false })),
          llm: harnessCalls.slice(llmFrom).map((call) => ({ ok: call.ok, kind: call.kind ?? null, ms: call.ms ?? null })) });
      }
      guard.release();
    } finally {
      stage.actors = priorActors;
      stage.updateSettings({ profileId: priorProfile });
      service.sendRequest = originalSend;
      if (own) judge.ask = originalAsk; else delete judge.ask;
    }
    const after = await status();
    return { preflight, rows, judgeResults: judgeResults.filter((entry) => !entry.skipped), judgeSkipped: judgeResults.filter((entry) => entry.skipped).length, harnessCalls, strayRequests, after };
  }, { replies, arm, harness: HARNESS, model, sentinel: SENTINEL });

  const rows: PickRow[] = outcome.rows.map((row: any) => ({ id: row.id, label: row.label, picked: row.picked, source: row.source === 'unscored' ? 'none' : row.source }));
  const judgeRows: JudgeResultRow[] = outcome.judgeResults.map((row: any) => ({ cached: row.cached, fallback: row.fallback, model: row.model, latencyMs: row.latencyMs, answered: row.answered }));
  const score = scoreRun(rows);
  const judge = tallyJudge(judgeRows);
  const harnessFailures: Record<string, number> = {};
  for (const call of outcome.harnessCalls as any[]) if (!call.ok) harnessFailures[call.kind] = (harnessFailures[call.kind] ?? 0) + 1;
  const invalidLlm = outcome.rows.filter((row: any) => row.llm.some((call: any) => call.ok) && row.source !== 'llm').length;
  const unscored = outcome.rows.filter((row: any) => row.source === 'unscored').length;
  const over15s = (outcome.harnessCalls as any[]).filter((call) => typeof call.ms === 'number' && call.ms > 15000).length;
  const record = {
    date: new Date().toISOString(), arm, run, label, harness: { id: HARNESS, model, usable: outcome.preflight.harness.usable }, preflight: outcome.preflight, unscored,
    strayRequests: outcome.strayRequests, harnessOver15s: over15s, judgeSkipped: outcome.judgeSkipped, score, judge, harnessCalls: outcome.harnessCalls.length, harnessFailures,
    harnessAnsweredButInvalid: invalidLlm, judgeServedBefore: outcome.preflight.plugin.served ?? null, judgeServedAfter: outcome.after.served ?? null,
    rows: outcome.rows, judgeResults: outcome.judgeResults, harnessAnswers: outcome.harnessCalls,
  };
  const dir = resolve(DEBUG_DIR, 'pose-pick-cl', label);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, runRecordName(arm, run)), JSON.stringify(record, null, 2), 'utf-8');
  console.log(JSON.stringify({ arm, run, accuracy: score.accuracy, correct: score.correct, total: score.total, legs: score.legs, labelledNone: score.labelledNone, judge, harnessCalls: record.harnessCalls,
    harnessFailures, harnessAnsweredButInvalid: invalidLlm, harnessOver15s: over15s, unscored, strayRequests: outcome.strayRequests, confusions: score.confusions }));
  return { ok: score.complete && unscored === 0 && outcome.strayRequests === 0 };
}

async function summary(dir: string) {
  const files = (await readdir(dir)).filter((name) => /^run\d+-(chain|llm)\.json$/.test(name)).sort();
  const records = await Promise.all(files.map(async (name) => JSON.parse(await readFile(resolve(dir, name), 'utf-8'))));
  for (const record of records) {
    const legs = record.score.legs;
    console.log(`${record.arm} run ${record.run}: ${record.score.correct}/${record.score.total} = ${(record.score.accuracy * 100).toFixed(1)}% (floor 80%, ${record.score.meetsFloor ? 'met' : 'missed'}); `
      + `judge ${legs.judge.answered} (${legs.judge.correct} right) llm ${legs.llm.answered} (${legs.llm.correct} right) none ${legs.none.answered} (${legs.none.correct} right); `
      + `judge asked ${record.judge.asked} sent ${record.judge.sent} cached ${record.judge.cached}; harness calls ${record.harnessCalls}`);
  }
  const budget = judgeBudget(records.map((record) => record.judge));
  console.log(`judge calls sent ${budget.sent} of ${budget.budget}: ${budget.within ? 'within budget' : 'OVER BUDGET'}`);
}

if (process.argv.includes('--help') || process.argv.length < 3) console.log(USAGE);
else if (process.argv[2] === 'prepare') await prepare(Number(process.argv[3]));
else if (process.argv[2] === 'summary') await summary(resolve(process.argv[3]));
else await runCli(main);
