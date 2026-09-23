import { readFileSync, writeFileSync } from 'node:fs';
import { connectToST } from './lib/connection.mts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const groupId = flag('group', '1759606632088');
const storyPath = flag('story', 'examples/sun-ruins/quest-for-the-sun-ruins.json');
const out = flag('out', '');
const story = readFileSync(storyPath, 'utf8');

const { browser, page } = await connectToST();
try {
  page.setDefaultTimeout(600000);
  const report = await page.evaluate(async ({ groupId, story }) => {
    const w = globalThis as any;
    const rt = w.storyOrchestratorRuntime;
    const ctx = () => w.SillyTavern.getContext();
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const audits = () => rt.getSnapshot().extraction?.audits?.length ?? rt.getSnapshot().extractionAudits ?? null;
    const facts = () => (rt.getSnapshot().memory?.entries ?? []).length;
    const settle = async () => { for (let i = 0; i < 40 && ctx().chatId && !rt.getSnapshot().storyId; i += 1) await sleep(250); await sleep(500); };
    delete w.storyOrchestratorDebugExtractionResponse;
    const assertInGroup = (label: string) => {
      if (String(ctx().groupId) !== groupId || !ctx().chatId) throw new Error(`${label}: expected an open chat of group ${groupId}, found group ${String(ctx().groupId)} chat ${String(ctx().chatId)} — run st-navigation open-group ${groupId} first`);
    };
    assertInGroup('start');
    const newChat = async () => {
      const before = String(ctx().chatId);
      await w.SillyTavern.getContext().executeSlashCommandsWithOptions('/newchat', { handleParserErrors: false });
      for (let i = 0; i < 40 && String(ctx().chatId) === before; i += 1) await sleep(250);
      await sleep(1500);
      assertInGroup('new chat');
      if (String(ctx().chatId) === before) throw new Error('/newchat did not open a new chat');
      const imported = await rt.importStory(story);
      await settle();
      return { chatId: String(ctx().chatId), imported: Boolean(imported), storyId: rt.getSnapshot().storyId };
    };
    const chatA = await newChat();
    const controlStart = Date.now();
    const auditsBeforeControl = audits();
    const controlResult = await rt.runExtractionNow(undefined, 'v2-live-control');
    const control = { result: controlResult, ms: Date.now() - controlStart, auditsBefore: auditsBeforeControl, auditsAfter: audits(), chatId: String(ctx().chatId) };
    const chatB = await newChat();
    const auditsBInitially = audits();
    const raceStart = Date.now();
    let readSettledAt = 0;
    const pending = rt.runExtractionNow(undefined, 'v2-live-race').then((value: unknown) => { readSettledAt = Date.now(); return value; });
    await ctx().openGroupChat(groupId, chatA.chatId);
    const switchedAt = Date.now();
    await settle();
    if (String(ctx().chatId) !== chatA.chatId) throw new Error(`switch to chat A failed: open chat is ${String(ctx().chatId)}`);
    const auditsAOnArrival = audits();
    const raceResult = await pending;
    await sleep(1500);
    const race = { result: raceResult, ms: Date.now() - raceStart, switchedBeforeReadSettled: switchedAt < readSettledAt, switchMs: switchedAt - raceStart, readMs: readSettledAt - raceStart, openChat: String(ctx().chatId), auditsBInitially, auditsAOnArrival, auditsAAfterRead: audits(), factsA: facts() };
    await ctx().openGroupChat(groupId, chatB.chatId);
    await settle();
    if (String(ctx().chatId) !== chatB.chatId) throw new Error(`switch to chat B failed: open chat is ${String(ctx().chatId)}`);
    const bAfter = { chatId: String(ctx().chatId), audits: audits() };
    return { chatA, chatB, control, race, bAfter };
  }, { groupId, story });
  const controlOk = report.control.result === true && typeof report.control.auditsAfter === 'number' && report.control.auditsAfter > (report.control.auditsBefore ?? 0);
  const raceOk = report.race.result === false && report.race.auditsAAfterRead === report.race.auditsAOnArrival && report.bAfter.audits === report.race.auditsBInitially;
  const verdict = !report.race.switchedBeforeReadSettled ? 'INCONCLUSIVE' : controlOk && raceOk ? 'PASS' : 'FAIL';
  const record = { at: new Date().toISOString(), groupId, storyPath, ...report, controlOk, raceOk, verdict };
  const text = JSON.stringify(record, null, 2);
  if (out) writeFileSync(out, `${text}\n`);
  console.log(text);
  process.exitCode = verdict === 'PASS' ? 0 : 1;
} finally {
  await browser.close().catch(() => {});
}
