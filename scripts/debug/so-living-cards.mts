import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runCli } from './lib/cli.mts';
import { PROJECT_ROOT } from './lib/connection.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { snapshotAssets, listMarkedAssets, removeMarkedAssets, leakCount } from './so-assets.mts';
import { openGroup as openGroupByQuery, startNewChat as newChat, deleteSandboxChats, closeUnpinnedDrawers } from './st-navigation.mts';
import { sendCompactMessage, triggerGroupMember } from './st-actions.mts';
import { dismissBriefing } from './lib/briefingHarness.mts';
import { settleReapPrompts } from './lib/identityVerbs.mts';
import { S32_ARMS, S32_FLOORS, scoreCardArm, decideCardOverlay } from './lib/livingCardScore.mts';

const args = process.argv.slice(2);
const round = Number(args[args.indexOf('--round') + 1]);
const colourNames = ['red', 'green', 'blue'];
const buildHash = (page) => page.evaluate(async () => {
  const bytes = await (await fetch('/scripts/extensions/third-party/story-orchestrator/dist/index.js', { cache: 'no-store' })).arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
});

export async function cleanupLivingRound(page, { marker, baseline, before, groupId = null, owned = new Set<string>() }) {
  await page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext(), capture = (globalThis as any).__s32Capture;
    if (capture) ctx.eventSource.removeListener(ctx.eventTypes.GENERATE_AFTER_DATA, capture.listener);
    delete (globalThis as any).__s32Capture;
  });
  if (!groupId) groupId = await page.evaluate((marker) => (globalThis as any).SillyTavern.getContext().groups.find((group) => group.name === `${marker} portrait group`)?.id ?? null, marker);
  let chats = null;
  if (groupId) {
    if (baseline.groups.includes(String(groupId))) throw new Error('The measurement group existed before this run; cleanup refuses it.');
    const ids = await page.evaluate((id) => (globalThis as any).SillyTavern.getContext().groups.find((group) => String(group.id) === String(id))?.chats ?? [], groupId);
    for (const chat of ids) owned.add(chat);
    chats = await deleteSandboxChats(page, { groupId: String(groupId), owned, preexisting: new Set() });
    if (before.groupId) await openGroupByQuery(page, before.groupId);
  }
  await page.evaluate(({ before, marker, groupId }) => {
    const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
    const root = ctx.extensionSettings['story-orchestrator'];
    for (const id of Object.keys(root.v2Stories ?? {})) if (id.startsWith(marker.toLowerCase())) delete root.v2Stories[id];
    if (root.groupStories && groupId) delete root.groupStories[String(groupId)];
    root.settings = before.settings;
    rt.touch();
  }, { before, marker, groupId });
  await saveSettingsNow(page);
  const cleanup = await removeMarkedAssets(page, marker, { baseline });
  const reapPrompts = await settleReapPrompts(page, [...owned]);
  if (!cleanup.clean || chats?.notDeleted?.length || reapPrompts.leaked.length) throw new Error('S32-1 cleanup is not clean.');
  return { cleanup, chatCleanup: chats, reapPrompts };
}

async function measureRound(page) {
  if (!Number.isInteger(Number(process.env.SO_LANE)) || Number(process.env.SO_LANE) < 1 || ![1, 2].includes(round)) {
    throw new Error('Run S32-1 on an isolated lane, with --round 1 or 2.');
  }
  const marker = `SOV27LIVINGR${round}`;
  const directory = resolve(PROJECT_ROOT, 'test/measurements/v2.7/s32-1', `round-${round}`);
  await mkdir(directory, { recursive: true });
  const baseline = await snapshotAssets(page);
  if (!baseline.trusted || leakCount(await listMarkedAssets(page, marker, { baseline }))) throw new Error('The asset baseline is untrusted or this round already has marked assets.');
  await writeFile(resolve(directory, 'asset-baseline.json'), JSON.stringify(baseline, null, 2));
  const before = await page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
    const profile = ctx.extensionSettings.connectionManager.profiles.find((profile) => profile.id === ctx.extensionSettings.connectionManager.selectedProfile);
    if (ctx.mainApi !== 'textgenerationwebui' || profile?.api !== 'llamacpp' || profile?.['api-url'] !== 'http://127.0.0.1:18888') {
      throw new Error('Select the local Artemis llama.cpp profile before S32-1.');
    }
    return { settings: JSON.parse(JSON.stringify(rt.getGlobalSettings())), groupId: ctx.groupId, chatId: ctx.chatId };
  });
  const hash = await buildHash(page);
  await writeFile(resolve(directory, 'recovery.json'), JSON.stringify({ marker, baselineFile: resolve(directory, 'asset-baseline.json'), before }, null, 2));
  const template = JSON.parse(await readFile(resolve(PROJECT_ROOT, '.claude/skills/st-character-authoring/templates/create-body.json'), 'utf8'));
  const names = ['Arin', 'Kira', 'Nox'].map((name) => `${marker} ${name}`);
  const report: any = { kind: 's32-1', round, marker, build: hash, floors: S32_FLOORS, main: 'local Artemis', rater: 'deepseek 4.1 flash', arms: {}, cleanup: null };
  let groupId: string | null = null;
  const owned = new Set<string>();
  try {
    groupId = await page.evaluate(async ({ template, names, marker }) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const avatars = [];
      for (const [at, name] of names.entries()) {
        if (ctx.characters.some((card) => card.name === name)) throw new Error('A trial card already exists.');
        const body = { ...template, ch_name: name,
          description: `${name} is a fictional portrait subject with black hair, grey eyes and a plain blue shirt. The portrait studio is their entire setting.`,
          personality: 'Relaxed and matter-of-fact. Speaks in short first-person replies.', scenario: 'Waiting for a painter in a portrait studio.',
          first_mes: at === 0 ? 'I settle onto the stool, waiting for the painter.' : '', mes_example: '', creator_notes: 'Owned S32-1 measurement card.' };
        const response = await fetch('/api/characters/create', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
        if (!response.ok) throw new Error('A measurement card could not be created.');
        avatars.push((await response.text()).trim());
      }
      await ctx.getCharacters();
      const response = await fetch('/api/groups/create', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ name: `${marker} portrait group`,
        members: avatars, activation_strategy: 2, generation_mode: 0, allow_self_responses: true, disabled_members: [], fav: false }) });
      const group = await response.json();
      if (!response.ok || !group.id) throw new Error('The measurement group could not be created.');
      await ctx.getCharacters();
      return String(group.id);
    }, { template, names, marker });
    await openGroupByQuery(page, groupId);
    const initial = await page.evaluate(() => (globalThis as any).SillyTavern.getContext().chatId);
    if (initial) owned.add(initial);
    await page.evaluate(() => {
      const rt = (globalThis as any).storyOrchestratorRuntime;
      rt.setExtractionSettings({ enabled: false });
      rt.setMemorySettings({ enabled: true, harvestReasoning: false, tierTokenBudgets: { facts: 1000, session_details: 0, short_term: 0, scene_history: 0 } });
    });
    for (const arm of S32_ARMS) {
      await newChat(page);
      owned.add(await page.evaluate(() => (globalThis as any).SillyTavern.getContext().chatId));
      await page.evaluate(async ({ names, marker, colourNames, arm }) => {
        const rt = (globalThis as any).storyOrchestratorRuntime;
        const fields = (values) => Object.fromEntries(names.map((_name, at) => [`member${at}`, { hair: values[at] }]));
        const story = { format: 2, id: `${marker.toLowerCase()}-s32`, version: 1, title: `${marker} portrait trial`, description: 'A synthetic public appearance change.',
          roster: names.map((name, at) => ({ id: `member${at}`, name, role: 'Portrait subject', card: { fields: { hair: { quality: `hair${at}`, visual: true } } } })),
          qualities: names.map((_name, at) => ({ key: `hair${at}`, type: 'enum', values: ['black', ...colourNames], source: 'extractor', rubric: 'Current established hair colour.' })),
          requirements: { members: names }, checkpoints: [
            { id: 'start', name: 'Before', type: 'anchor', start: true, objective: 'Sit for a portrait.', illustrate: false, effects: { card: fields(['black', 'black', 'black']) } },
            { id: 'change', name: 'After', type: 'anchor', objective: 'Continue sitting for the portrait.', illustrate: false, effects: { card: fields(colourNames) } }], transitions: [] };
        const imported = await rt.importStory(JSON.stringify(story));
        if (imported?.ok === false) throw new Error('The measurement story was refused.');
        (globalThis as any).storyOrchestratorSprites.updateSettings({ cardOverlay: arm !== 'none', onDemand: false, enabled: false, explicit: true });
        rt.touch();
      }, { names, marker, colourNames, arm });
      if (await page.locator('dialog#so-briefing[open]').count()) await dismissBriefing(page);
      await closeUnpinnedDrawers(page);
      for (const name of names) {
        await sendCompactMessage(page, 'Settle into your seat for the portrait, in one sentence.');
        await triggerGroupMember(page, name);
      }
      await page.evaluate(async ({ names, colourNames }) => {
        const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
        await rt.activateCheckpoint('change');
        const snapshot = rt.getSnapshot();
        if (snapshot.activeCheckpointId !== 'change') throw new Error('The appearance change did not land.');
        const messageId = ctx.chat.length - 1;
        const entries = names.map((name, at) => ({ id: `seed-${at}`, tier: 'facts', type: 'fact', text: `${name}'s current hair colour is ${colourNames[at]}.`,
          importance: 3, expiration: 'permanent', entities: [name], confidence: 1, activationTriggers: [], evidence: 'Authored S32-1 fixture state.',
          createdAt: snapshot.boundary, messageId, recallCount: 0,
          provenance: { source: 'author', messageId, boundary: snapshot.boundary, pass: 's32-seed', validity: 'live' } }));
        await rt.memory.applyEntries(entries, { from: messageId, to: messageId });
        rt.memory.updateInjection(); await rt.persist(); rt.touch();
        if (rt.getSnapshot().memory.entries.filter((entry) => entry.id.startsWith('seed-')).length !== 3) throw new Error('The memory-fact baseline did not land.');
        const capture = { requests: [] as any[], listener: null as any };
        capture.listener = (body) => capture.requests.push(JSON.parse(JSON.stringify(body)));
        ctx.eventSource.on(ctx.eventTypes.GENERATE_AFTER_DATA, capture.listener);
        (globalThis as any).__s32Capture = capture;
      }, { names, colourNames });
      const rows = [];
      for (let at = 0; at < S32_FLOORS.replies; at += 1) {
        const member = at % 3;
        await page.evaluate((depth) => {
          const ctx = (globalThis as any).SillyTavern.getContext();
          (globalThis as any).__s32Capture.requests = [];
          const block = ctx.extensionPrompts.story_orchestrator_card_overlay;
          if (depth && block?.value) ctx.setExtensionPrompt('story_orchestrator_card_overlay', block.value, 1, depth, false, 0);
        }, arm === 'depth4' ? 4 : arm === 'depth1' ? 1 : 0);
        const started = Date.now();
        await sendCompactMessage(page, 'Describe your current hair colour as you pose for this portrait, in one or two sentences.');
        await triggerGroupMember(page, names[member]);
        const row = await page.evaluate(({ name, expected, arm }) => {
          const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
          const reply = ctx.chat.at(-1);
          const request = (globalThis as any).__s32Capture.requests.find((body) => body.api_type === 'llamacpp' && body.api_server === 'http://127.0.0.1:18888');
          if (!request || reply?.is_user || reply?.name !== name || !reply.mes?.trim()) {
            throw new Error(`S32 reply refused: localRequest=${Boolean(request)}, expected=${name}, actual=${reply?.name ?? 'none'}, user=${Boolean(reply?.is_user)}, length=${reply?.mes?.length ?? 0}.`);
          }
          const prompt = String(request.prompt ?? '');
          const overlay = prompt.includes('Current public state (overrides the character card where they differ):');
          if (overlay !== (arm !== 'none') || !prompt.includes(`${name}'s current hair colour is ${expected}.`)) throw new Error('The baseline/overlay arm did not reach the real request.');
          const depth = Number(ctx.extensionPrompts.story_orchestrator_card_overlay?.depth ?? 0);
          if (arm !== 'none' && depth !== (arm === 'depth1' ? 1 : 4)) throw new Error('The depth arm did not land.');
          return { name, expected, text: reply.mes, prompt, depth, boundary: rt.getSnapshot().boundary };
        }, { name: names[member], expected: colourNames[member], arm });
        const { prompt, ...reply } = row;
        rows.push({ ...reply, ms: Date.now() - started, promptSha256: createHash('sha256').update(prompt).digest('hex') });
        await writeFile(resolve(directory, `progress-${arm}.json`), JSON.stringify(rows, null, 2));
        console.log(`${arm}: ${at + 1}/30 local replies`);
      }
      const ratings = await page.evaluate(async (rows) => {
        const ctx = (globalThis as any).SillyTavern.getContext();
        const profile = ctx.extensionSettings.connectionManager.profiles.find((profile) => profile.name === 'deepseek 4.1 flash');
        if (!profile) throw new Error('The independent rater profile is missing.');
        const messages = [{ role: 'system', content: 'Rate each reply for the named speaker only. mentions=true when it states a current hair colour. agrees=true only when that colour agrees with expected (colour synonyms count). Past colours or other people do not contradict the current colour. If no current hair colour is stated, mentions=false and agrees=false. Return only a JSON array in the input order: [{"id":0,"mentions":true,"agrees":true},...]. Do not omit any reply.' },
          { role: 'user', content: JSON.stringify(rows.map((row, id) => ({ id, speaker: row.name, expected: row.expected, reply: row.text }))) }];
        const answer = await ctx.ConnectionManagerRequestService.sendRequest(profile.id, messages, 2048, { extractData: true, includePreset: false, includeInstruct: false, stream: false }, {});
        const text = typeof answer === 'string' ? answer : answer?.content ?? answer?.text ?? '';
        const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
        if (!Array.isArray(parsed) || parsed.length !== 30 || parsed.some((row, at) => row.id !== at || typeof row.mentions !== 'boolean' || typeof row.agrees !== 'boolean')) {
          throw new Error('The independent rater omitted or malformed a reply rating.');
        }
        return parsed;
      }, rows);
      report.arms[arm] = { rows, ratings, score: scoreCardArm(ratings) };
      await page.evaluate(() => {
        const ctx = (globalThis as any).SillyTavern.getContext(), capture = (globalThis as any).__s32Capture;
        ctx.eventSource.removeListener(ctx.eventTypes.GENERATE_AFTER_DATA, capture.listener); delete (globalThis as any).__s32Capture;
      });
      await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
    }
    if (await buildHash(page) !== hash) throw new Error('The served candidate changed during S32-1.');
  } catch (error) {
    report.error = String(error);
    throw error;
  } finally {
    Object.assign(report, await cleanupLivingRound(page, { marker, baseline, before, groupId, owned }));
    await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ round, scores: Object.fromEntries(S32_ARMS.map((arm) => [arm, report.arms[arm]?.score])), report: resolve(directory, 'report.json') }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (args[0] === 'run') runCli(measureRound);
  else if (args[0] === 'cleanup') runCli(async (page) => {
    const directory = resolve(PROJECT_ROOT, 'test/measurements/v2.7/s32-1', `round-${round}`);
    const baseline = JSON.parse(await readFile(resolve(directory, 'asset-baseline.json'), 'utf8'));
    let recovery;
    const source = args.indexOf('--known-snapshot');
    if (source >= 0) {
      const previous = JSON.parse(await readFile(args[source + 1], 'utf8'));
      const original = previous.state?.globalSettings;
      if (!original?.memory || !original?.sprites) throw new Error('The supplied snapshot does not hold the original extension settings.');
      const current = await page.evaluate(() => JSON.parse(JSON.stringify((globalThis as any).storyOrchestratorRuntime.getGlobalSettings())));
      recovery = { before: { groupId: '1791068844825', settings: { ...current, memory: original.memory, sprites: original.sprites,
        extraction: { ...current.extraction, enabled: original.extraction.enabled }, display: { ...current.display, briefing: true } } } };
    } else recovery = JSON.parse(await readFile(resolve(directory, 'recovery.json'), 'utf8'));
    const result = await cleanupLivingRound(page, { marker: `SOV27LIVINGR${round}`, baseline, before: recovery.before });
    await writeFile(resolve(directory, 'interruption-cleanup.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ cleaned: true, round }));
  });
  else if (args[0] === 'score') {
    const reports = await Promise.all(args.slice(1).map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
    const decision = decideCardOverlay(reports);
    await writeFile(resolve(PROJECT_ROOT, 'test/measurements/v2.7/s32-1/decision.json'), JSON.stringify(decision, null, 2));
    console.log(JSON.stringify(decision, null, 2));
  } else throw new Error('Use run|cleanup --round 1|2 (through st-lanes) or score <round-1/report.json> <round-2/report.json>.');
}
