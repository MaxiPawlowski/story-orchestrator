import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withST } from './lib/cli.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { openGroup, startNewChat, deleteSandboxChats, closeUnpinnedDrawers } from './st-navigation.mts';
import { sendCompactMessage, triggerGroupMember } from './st-actions.mts';
import { dismissBriefing } from './lib/briefingHarness.mts';
import { settleReapPrompts } from './lib/identityVerbs.mts';
import { snapshotSpriteAssets, scopedSprites, scopedSpriteReferences, removeSpriteAssets, removeSpriteReferences } from './lib/spriteAssets.mts';
import { snapshotAssets, removeMarkedAssets } from './so-assets.mts';

if (Number(process.env.SO_LANE) !== 6) throw new Error('Use the isolated Belle pilot lane 6.');
const marker = 'SO-V27-LIVELOOK';
const groupId = '1791068844825';
const directory = resolve('test/measurements/v2.7/image-completion/runtime');
await mkdir(directory, { recursive: true });
const report: any = { at: new Date().toISOString(), ok: false };

await withST(async (page) => {
  await openGroup(page, groupId);
  const baseline = await snapshotSpriteAssets(page);
  const assetsBaseline = await snapshotAssets(page);
  if (!assetsBaseline.trusted) throw new Error('A trusted install asset baseline is required.');
  if (!baseline.trusted || scopedSprites(baseline, marker).length) throw new Error('The runtime check needs a clean trusted sprite baseline.');
  const saved = await page.evaluate((marker) => {
    const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
    const library = ctx.extensionSettings['story-orchestrator'].v2Stories;
    if (!Array.isArray(library)) throw new Error('The library baseline is unavailable.');
    return { settings: JSON.parse(JSON.stringify(rt.getGlobalSettings())), selected: ctx.extensionSettings.connectionManager.selectedProfile,
      storyIndex: library.findIndex((record) => record.id === marker.toLowerCase()),
      stories: JSON.parse(JSON.stringify(library.filter((record) => record.id === marker.toLowerCase()))),
      profiles: ctx.extensionSettings.connectionManager.profiles.filter((profile) => ['Artemis Local (Unsloth)', 'Story Orchestrator Memory Unsloth'].includes(profile.name))
        .map((profile) => ({ id: profile.id, api: profile.api })) };
  }, marker);
  let chatId: string | null = null;
  let reading: Promise<any> | null = null;
  const referenceHash = async () => page.evaluate(async () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const response = await fetch('/api/plugins/story-orchestrator-media/sprites/reference-pack', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ character: 'Belle', set: '' }) });
    if (!response.ok) throw new Error('Original-reference inventory unavailable.');
    return (await response.json()).sha256;
  });
  report.originalBefore = await referenceHash();
  try {
    await startNewChat(page);
    chatId = await page.evaluate(() => (globalThis as any).SillyTavern.getContext().chatId);
    if (!chatId) throw new Error('No sandbox chat opened.');
    await page.evaluate(async ({ marker, saved }) => {
      const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
      const profiles = ctx.extensionSettings.connectionManager.profiles;
      for (const prior of saved.profiles) profiles.find((profile) => profile.id === prior.id).api = 'llamacpp';
      const main = profiles.find((profile) => profile.name === 'Artemis Local (Unsloth)');
      const memory = profiles.find((profile) => profile.name === 'Story Orchestrator Memory Unsloth');
      if (!main || !memory || main['api-url'] !== 'http://127.0.0.1:18888' || memory['api-url'] !== 'http://127.0.0.1:18888') throw new Error('Local profiles are not pinned to the controller.');
      const slashPath = '/scripts/slash-commands.js';
      const slash = await import(slashPath);
      await slash.executeSlashCommandsWithOptions(`/profile "${main.name}"`);
      ctx.extensionSettings['story-orchestrator'].settings.image.enabled = false;
      (globalThis as any).storyOrchestratorSprites.updateSettings({ enabled: true, explicit: true, onDemand: true, cardOverlay: false,
        builders: { ...rt.getGlobalSettings().sprites.builders, Belle: { baseSet: '', box: { x: 221, y: 11, width: 320, height: 320 }, steps: 25,
          models: { diffusion: 'qwen_image_2.1_int8_convrot.safetensors', encoder: 'qwen3vl_8b_int8_convrot.safetensors', vae: 'qwen_image_2.1_vae_bf16.safetensors' } } } });
      rt.setExtractionSettings({ enabled: true, cadence: 1000, stabilityLag: 0, profileId: memory.id,
        profiles: { ...rt.getGlobalSettings().extraction.profiles, read: memory.id } });
      const story = { format: 2, id: marker.toLowerCase(), version: 1, title: marker, description: 'An isolated appearance and image/read recovery check.',
        roster: [{ id: 'belle', name: 'Belle', role: 'Portrait subject', card: { fields: { hair: { quality: 'hair', visual: true } } } }],
        qualities: [{ key: 'hair', type: 'enum', values: ['black', 'green'], source: 'extractor', rubric: 'Established current hair colour, green after the dye.' }],
        requirements: { members: ['Belle'] }, checkpoints: [{ id: 'start', name: 'Portrait', type: 'anchor', start: true, objective: 'Pose after dyeing the hair green.', illustrate: false,
          effects: { card: { belle: { hair: 'green' } }, stage: { framing: 'close', cast: { belle: { face: 'neutral' } } } } }], transitions: [] };
      const imported = await rt.importStory(JSON.stringify(story));
      if (imported?.ok === false) throw new Error('The runtime fixture import was refused.');
    }, { marker, saved });
    if (await page.locator('dialog#so-briefing[open]').count()) await dismissBriefing(page);
    await closeUnpinnedDrawers(page);
    await sendCompactMessage(page, 'Belle has just dyed her hair green. Her current hair colour is green. We are sitting for a portrait in the studio.');
    const deadline = Date.now() + 300000;
    let state;
    while (Date.now() < deadline) {
      state = await (await fetch('http://127.0.0.1:18888/status')).json();
      if (state.imageLease) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!state?.imageLease) throw new Error('No on-demand image lease was observed.');
    report.controllerBuild = state.controllerBuild;
    report.during = { activeText: state.activeText, waitingText: state.waitingText, imageLease: state.imageLease };
    reading = page.evaluate(async () => {
      const rt = (globalThis as any).storyOrchestratorRuntime;
      const before = rt.getSnapshot().extraction.audits.length;
      await rt.runExtractionNow(undefined, 'v27-image-runtime');
      const snapshot = rt.getSnapshot();
      const audits = snapshot.extraction.audits;
      const audit = audits.find((row) => row.reason === 'v27-image-runtime');
      if (audits.length <= before || !audit?.rawResponse?.trim()) throw new Error('The queued manual read did not record its own real audit.');
      return { before, after: audits.length, audit };
    });
    let failure: unknown;
    void reading.catch((error) => { failure = error; });
    while (Date.now() < deadline) {
      if (failure) throw failure;
      state = await (await fetch('http://127.0.0.1:18888/status')).json();
      if (state.imageLease && state.waitingText > 0 && state.activeText === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!state?.imageLease || state.waitingText < 1) throw new Error('The real extraction request was not observed waiting behind the edit.');
    report.queued = true;
    report.read = await reading;
    reading = null;
    await page.waitForFunction(() => (globalThis as any).storyOrchestratorSprites.view().actors.some((actor) => actor.name === 'Belle' && actor.set.startsWith('look_')),
      undefined, { polling: 500, timeout: 300000 });
    await triggerGroupMember(page, 'Belle');
    report.after = await page.evaluate(() => {
      const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
      const snapshot = rt.getSnapshot(), reply = ctx.chat.at(-1);
      const audits = snapshot.extraction.audits ?? [];
      const audit = audits.find((row) => row.reason === 'v27-image-runtime') ?? snapshot.extraction.lastAudit;
      if (!audit?.rawResponse?.trim() || !audit?.prompt?.trim()) throw new Error('No real extraction audit was retained.');
      if (!snapshot.boundary || reply?.is_user || reply?.name !== 'Belle' || !reply.mes?.trim()) throw new Error('The next real reply did not commit a boundary.');
      const actor = (globalThis as any).storyOrchestratorSprites.view().actors.find((actor) => actor.name === 'Belle');
      if (!actor?.set.startsWith('look_') || snapshot.blackboard.hair !== 'green') throw new Error('The reached appearance did not remain on the stage.');
      return { boundary: snapshot.boundary, replyLength: reply.mes.length, auditCount: audits.length, auditRaw: audit.rawResponse, set: actor.set };
    });
    const inventory = await snapshotSpriteAssets(page);
    report.generated = scopedSprites(inventory, marker, baseline);
    if (!report.generated.length || report.generated.some((row) => row.sha256 !== row.actualHash)) throw new Error('The on-demand output is not hash-matching owned art.');
    report.originalAfter = await referenceHash();
    if (report.originalAfter !== report.originalBefore) throw new Error('Original expression artwork changed.');
    report.ok = true;
  } catch (error) { report.error = String(error); throw error; }
  finally {
    if (reading) await reading.catch(() => {});
    await page.evaluate((settings) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      ctx.extensionSettings['story-orchestrator'].settings = settings;
      (globalThis as any).storyOrchestratorSprites.updateSettings(settings.sprites);
      (globalThis as any).storyOrchestratorRuntime.setExtractionSettings(settings.extraction);
    }, saved.settings);
    if (chatId) {
      const chats = await deleteSandboxChats(page, { groupId, owned: new Set([chatId]), preexisting: new Set() });
      if (chats.notDeleted.length) throw new Error('The runtime sandbox chat remained.');
      await settleReapPrompts(page, [chatId]);
    }
    await page.evaluate(async ({ saved, marker }) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const root = ctx.extensionSettings['story-orchestrator'];
      root.v2Stories = root.v2Stories.filter((record) => record.id !== marker.toLowerCase());
      root.v2Stories.splice(Math.max(0, saved.storyIndex), 0, ...saved.stories);
      for (const prior of saved.profiles) ctx.extensionSettings.connectionManager.profiles.find((profile) => profile.id === prior.id).api = prior.api;
      const profile = ctx.extensionSettings.connectionManager.profiles.find((profile) => profile.id === saved.selected);
      if (profile) { const slashPath = '/scripts/slash-commands.js'; await (await import(slashPath)).executeSlashCommandsWithOptions(`/profile "${profile.name}"`); }
      (globalThis as any).storyOrchestratorRuntime.touch();
    }, { saved, marker });
    await saveSettingsNow(page);
    const idleDeadline = Date.now() + 300000;
    while (true) {
      const state = await (await fetch('http://127.0.0.1:18888/status')).json();
      const queue = await (await fetch('http://127.0.0.1:8188/queue')).json();
      if (!state.imageLease && !queue.queue_running?.length && !queue.queue_pending?.length) break;
      if (Date.now() > idleDeadline) throw new Error('Owned cancelled image work did not settle before cleanup.');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const end = await snapshotSpriteAssets(page);
    const removed = await removeSpriteAssets(page, scopedSprites(end, marker, baseline));
    const references = await removeSpriteReferences(page, scopedSpriteReferences(end, marker, baseline));
    const clean = await snapshotSpriteAssets(page);
    report.assets = await removeMarkedAssets(page, marker, { baseline: assetsBaseline });
    report.cleanup = report.assets.clean && !removed.errors.length && !references.errors.length && !scopedSprites(clean, marker, baseline).length;
    await writeFile(resolve(directory, `run-${Date.now()}.json`), JSON.stringify(report, null, 2));
    if (!report.cleanup) throw new Error('Generated runtime assets remain.');
  }
}).catch((error) => { console.error(error); process.exitCode = 1; });
console.log({ ok: report.ok, cleanup: report.cleanup, error: report.error });
