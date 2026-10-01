import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';
import { DEBUG_DIR } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { assertDevBundle } from './lib/bundleFlavour.mts';
import { captureLibrary } from './lib/librarySnapshot.mts';
import { soloChat } from './lib/soloSandbox.mts';
import { beginSandboxSession, openGroup } from './st-navigation.mts';
import { executeSlashCommand } from './st-actions.mts';
import { cleanupScenario } from './so-scenario.mts';
import { armSaveRecorder, disarmSaveRecorder, drainSaveRecorder } from './so-save-recorder.mts';
import { C2_MARKER, C2_STORY, armVerdict, attemptPlan, attemptRefusal, c2Verdict, type C2Arm, type C2AttemptResult, type C2Guard } from './lib/c2SaveRace.mts';

const USAGE = `Usage: node scripts/debug/so-c2-save-race.mts run --group <id> [--character <name>] [--attempts <n>] [--out <file.json>] [--keep]

v2.6 plan 01 C2 (v2.5 plan 02 C2 steps 2-3), rebuilt on fresh seeding. Model-free. Needs the DEV bundle.
Every run makes its own world and removes it:
  1. opens the pinned group (--group is required), creates a NEW sandbox chat (/newchat), asserts ctx.groupId and
     the chat id, imports its own story (${C2_STORY.id}) and asserts it is selected;
  2. creates a NEW solo chat for --character (default Ponticius), posts two compact lines (no generation), and
     returns to the sandbox;
  3. arms so-save-recorder, then alternates <n> guard attempts (rt.setUiSettings({}) immediately before
     /go <character>: our late-bound save must be REFUSED by the watcher, the solo chat's rows unchanged on disk)
     and <n> control attempts (/go with no setting write: no save of the solo chat refused);
  4. cleans up through the sandbox cleanup (stops any generation first, deletes the solo and sandbox chats,
     restores the active entity and the story library, settles reap prompts).
Every attempt refuses to run unless the page is on the sandbox chat this run created, playing its story, with a
solo chat this run created. Writes the record (attempts, recorder drains, verdict) to --out (default <debug
dir>/c2-save-race-<timestamp>.json). Exit 0 only when every guard attempt fired the guard and every control
attempt passed (status green); "not-reproduced" (the late save never happened) is not green.`;

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : null;
}

const readLive = (page: Page) => evaluateInST(page, () => {
  const ctx = (globalThis as any).SillyTavern.getContext();
  return { groupId: ctx.groupId ?? null, chatId: ctx.chatId ?? null, storyId: (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.()?.storyId ?? null };
});

const settleSaves = (page: Page) => evaluateInST(page, async () => {
  const script = await import(/* webpackIgnore: true */ '/script.js' as string) as { isChatSaving?: boolean };
  const until = Date.now() + 30000;
  let quietSince = Date.now();
  while (Date.now() < until) {
    if (script.isChatSaving || document.body.dataset.generating === 'true') quietSince = Date.now();
    else if (Date.now() - quietSince >= 2000) return true;
    await new Promise((done) => setTimeout(done, 100));
  }
  return false;
});

export async function runAttempt(page: Page, arm: C2Arm, { guard, solo }: { guard: C2Guard; solo: { chatId: string; avatar: string; name: string } }): Promise<C2AttemptResult> {
  const live = await readLive(page);
  const refused = attemptRefusal(guard, live, solo);
  if (refused) return { arm, aborted: refused };
  await settleSaves(page);
  return evaluateInST(page, async ({ arm, groupId, sandboxChatId, solo }) => {
    const g = globalThis as any;
    const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
    const script = await import(/* webpackIgnore: true */ '/script.js' as string) as { isChatSaving?: boolean };
    const groups = await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as { openGroupById: (id: string) => Promise<unknown> };
    const ctx = () => g.SillyTavern.getContext();
    const rt = g.storyOrchestratorRuntime;
    const dialog = () => { const open = document.querySelector('dialog[open]'); return open ? ((open.querySelector('.popup-content') as HTMLElement | null)?.innerText ?? '').slice(0, 300) : null; };
    const settle = async () => { const until = Date.now() + 30000; while (Date.now() < until && script.isChatSaving) await sleep(100); await sleep(1500); return !script.isChatSaving; };
    const diskSolo = async () => {
      const response = await fetch('/api/chats/get', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify({ ch_name: solo.name, file_name: solo.chatId, avatar_url: solo.avatar }) });
      if (!response.ok) return { messages: null, digest: null };
      const rows = await response.json().catch(() => null);
      if (!Array.isArray(rows)) return { messages: null, digest: null };
      const messages = rows[0] && typeof rows[0] === 'object' && 'chat_metadata' in rows[0] ? rows.slice(1) : rows;
      return { messages: messages.length, digest: messages.map((row: { name?: string; mes?: string }) => `${row.name ?? ''}:${row.mes ?? ''}`).join('\u001f') };
    };
    if (dialog()) return { arm, aborted: `a dialog was open before the attempt: ${dialog()}` };
    const ring = g.storyOrchestratorSaveRefusals;
    const ringAvailable = Array.isArray(ring);
    const seqBefore = ringAvailable ? ring.reduce((max: number, entry: { seq: number }) => Math.max(max, entry.seq), 0) : 0;
    const soloBefore = await diskSolo();
    const wroteSetting = arm === 'guard';
    if (wroteSetting) rt.setUiSettings({});
    await ctx().executeSlashCommandsWithOptions(`/go ${solo.avatar}`);
    const openUntil = Date.now() + 30000;
    while (Date.now() < openUntil && ctx().chatId !== solo.chatId) await sleep(50);
    const openedAfterGo = ctx().chatId ?? null;
    for (let index = 0; index < 20 && !dialog(); index += 1) await sleep(250);
    await settle();
    const leftOpen = dialog();
    const refusals = ringAvailable ? (g.storyOrchestratorSaveRefusals as Array<{ seq: number; file: string; rows: number; askedFor: string | null; open: string | null; reason: string }>).filter((entry) => entry.seq > seqBefore).map(({ seq, file, rows, askedFor, open, reason }) => ({ seq, file, rows, askedFor, open, reason })) : [];
    const soloAfter = await diskSolo();
    if (leftOpen) return { arm, dialog: leftOpen, ringAvailable, wroteSetting, soloBefore, soloAfter, openedAfterGo, refusals, backInSandbox: false };
    await groups.openGroupById(groupId);
    const backUntil = Date.now() + 30000;
    while (Date.now() < backUntil && ctx().groupId !== groupId) await sleep(50);
    if (ctx().chatId !== sandboxChatId) await ctx().openGroupChat(groupId, sandboxChatId);
    while (Date.now() < backUntil && ctx().chatId !== sandboxChatId) await sleep(50);
    await settle();
    const backInSandbox = ctx().groupId === groupId && ctx().chatId === sandboxChatId;
    const healthAfterSwitch = backInSandbox ? JSON.parse(JSON.stringify(rt.extras?.saveHealth ?? null)) : null;
    if (backInSandbox) rt.setUiSettings({});
    await settle();
    const healthAfterNext = backInSandbox ? JSON.parse(JSON.stringify(rt.extras?.saveHealth ?? null)) : null;
    return { arm, dialog: dialog(), ringAvailable, wroteSetting, soloBefore, soloAfter, openedAfterGo, refusals, backInSandbox, healthAfterSwitch, healthAfterNext };
  }, { arm, groupId: guard.groupId, sandboxChatId: guard.sandboxChatId, solo }) as Promise<C2AttemptResult>;
}

async function seedSandbox(page: Page, groupId: string, character: string) {
  await openGroup(page, groupId);
  const opened = await readLive(page);
  if (opened.groupId !== groupId) throw new Error(`open-group ${groupId} left the page in ${opened.groupId ?? 'no group'}: refusing to create a chat anywhere else`);
  const { guard } = await beginSandboxSession(page);
  const created = await readLive(page);
  if (created.groupId !== groupId || !created.chatId || created.chatId !== guard.sandboxChatId) throw new Error(`the sandbox chat was not created where asked: ${JSON.stringify(created)}`);
  await evaluateInST(page, () => {
    for (const key of Object.keys(globalThis).filter((name) => name.startsWith('storyOrchestratorDebug'))) delete (globalThis as any)[key];
    (globalThis as any).storyOrchestratorDebugExtractionResponse = 'SCENE_NONE';
  });
  const imported = await evaluateInST(page, async (story) => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const ok = await rt.importStory(JSON.stringify(story));
    return { ok, storyId: rt.getSnapshot()?.storyId ?? null, hash: rt.getSnapshot()?.storyHash ?? null };
  }, C2_STORY);
  if (imported.storyId !== C2_STORY.id) throw new Error(`the C2 story did not land: ${JSON.stringify(imported)}`);
  guard.storyTitles.push(C2_STORY.title);
  await settleSaves(page);
  const opened2 = await soloChat(page, { character }, guard as never) as { solo?: string };
  const solo = (guard as C2Guard).soloChats?.find((entry) => entry.chatId === opened2.solo) ?? null;
  if (!solo) throw new Error(`the solo chat for ${character} was not recorded as the run's own`);
  for (const line of [`${C2_MARKER} seed line one`, `${C2_MARKER} seed line two`]) await executeSlashCommand(page, `/send compact=true ${line}`);
  await settleSaves(page);
  await soloChat(page, { leave: true }, guard as never);
  await settleSaves(page);
  return { guard, solo, importedHashes: imported.hash ? [imported.hash] : [] };
}

export async function runC2(page: Page, { groupId, character = 'Ponticius', attempts = 2, keep = false }: { groupId: string; character?: string; attempts?: number; keep?: boolean }) {
  await assertDevBundle(page);
  const libraryBefore = await captureLibrary(page);
  let seeded: Awaited<ReturnType<typeof seedSandbox>> | null = null;
  const results: C2AttemptResult[] = [];
  const drains: unknown[] = [];
  let runnerError: string | null = null;
  let cleanup: unknown = null;
  try {
    seeded = await seedSandbox(page, groupId, character);
    await armSaveRecorder(page);
    for (const arm of attemptPlan(attempts)) {
      results.push(await runAttempt(page, arm, { guard: seeded.guard as C2Guard, solo: seeded.solo }));
      drains.push(await drainSaveRecorder(page));
      if (results.at(-1)?.dialog) break;
    }
  } catch (error) {
    runnerError = error instanceof Error ? error.message : String(error);
  } finally {
    await disarmSaveRecorder(page).catch(() => undefined);
    if (seeded) cleanup = await cleanupScenario(page, seeded.importedHashes, seeded.guard, keep, libraryBefore).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  }
  const verdicts = seeded ? results.map((result) => armVerdict(result, { soloChatId: seeded!.solo.chatId, sandboxChatId: seeded!.guard.sandboxChatId })) : [];
  const verdict = c2Verdict(verdicts, { runs: attempts });
  const cleanupProblems = cleanupIssues(cleanup);
  const ok = verdict.ok && !runnerError && cleanupProblems.length === 0;
  return { ok, groupId, character, attempts, sandbox: seeded ? { chatId: seeded.guard.sandboxChatId, solo: seeded.solo } : null, runnerError, verdict, cleanupProblems, results, drains, cleanup };
}

export function cleanupIssues(cleanup: unknown): string[] {
  if (!cleanup || typeof cleanup !== 'object') return ['no cleanup ran'];
  const report = cleanup as Record<string, any>;
  if (report.kept) return [];
  const issues: string[] = [];
  if (report.error) issues.push(`cleanup threw: ${report.error}`);
  if (report.generation?.error) issues.push(report.generation.error);
  if (Array.isArray(report.notDeleted) && report.notDeleted.length) issues.push(`sandbox chat(s) left: ${report.notDeleted.join(', ')}`);
  if (report.soloChats?.error || report.soloChats?.leaked?.length) issues.push(`solo chat(s) left: ${report.soloChats.error ?? report.soloChats.leaked.join(', ')}`);
  if (report.activeEntity && !report.activeEntity.restored) issues.push('the active character/group was not put back');
  if (report.library?.error || report.library?.saved?.error) issues.push(`the story library was not restored: ${report.library.error ?? report.library.saved.error}`);
  if (report.reapPrompts?.error || report.reapPrompts?.leaked?.length) issues.push('a mirror-reap question was left open');
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs(process.argv.slice(2));
  const groupId = argValue(args, '--group');
  if (hasHelpFlag() || args[0] !== 'run' || !groupId) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  runCli(async (page) => {
    const record = await runC2(page, {
      groupId,
      character: argValue(args, '--character') ?? 'Ponticius',
      attempts: Number(argValue(args, '--attempts') ?? 2),
      keep: args.includes('--keep'),
    });
    const out = resolve(argValue(args, '--out') ?? resolve(DEBUG_DIR, `c2-save-race-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
    await mkdir(resolve(out, '..'), { recursive: true });
    await writeFile(out, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    console.log(JSON.stringify({ ok: record.ok, status: record.verdict.status, problems: [...record.verdict.problems, ...record.cleanupProblems, ...(record.runnerError ? [record.runnerError] : [])], sandbox: record.sandbox, out }, null, 2));
    return { ok: record.ok };
  });
}
