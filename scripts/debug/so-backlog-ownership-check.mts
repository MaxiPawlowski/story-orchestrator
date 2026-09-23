import { readFileSync, writeFileSync } from 'node:fs';
import { connectToST } from './lib/connection.mts';

// v2.3 replan V3, live: the memorize backlog reads a whole chat window by window through the real
// extraction profile, for as long as the model takes. Started in chat B and overtaken by a switch
// to chat A, it must store nothing anywhere and answer false; a control backlog in chat A must
// complete. Same group guard as so-read-ownership-check: an in-page openGroupChat without a chat id
// is a silent no-op.

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
  page.setDefaultTimeout(900000);
  const report = await page.evaluate(async ({ groupId, story }) => {
    const w = globalThis as any;
    const rt = w.storyOrchestratorRuntime;
    const ctx = () => w.SillyTavern.getContext();
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const audits = () => rt.getSnapshot().extraction?.audits?.length ?? null;
    const entries = () => (rt.getSnapshot().memory?.entries ?? []).length;
    const settle = async () => { for (let i = 0; i < 40 && ctx().chatId && !rt.getSnapshot().storyId; i += 1) await sleep(250); await sleep(500); };
    delete w.storyOrchestratorDebugExtractionResponse;
    const assertInGroup = (label: string) => {
      if (String(ctx().groupId) !== groupId || !ctx().chatId) throw new Error(`${label}: expected an open chat of group ${groupId}, found group ${String(ctx().groupId)} chat ${String(ctx().chatId)} — run st-navigation open-group ${groupId} first`);
    };
    assertInGroup('start');
    const newChat = async () => {
      const before = String(ctx().chatId);
      await ctx().executeSlashCommandsWithOptions('/newchat', { handleParserErrors: false });
      for (let i = 0; i < 40 && String(ctx().chatId) === before; i += 1) await sleep(250);
      await sleep(1500);
      assertInGroup('new chat');
      if (String(ctx().chatId) === before) throw new Error('/newchat did not open a new chat');
      await rt.importStory(story);
      await settle();
      return { chatId: String(ctx().chatId), messages: ctx().chat.length, storyId: rt.getSnapshot().storyId };
    };
    const open = async (chatId: string) => {
      await ctx().openGroupChat(groupId, chatId);
      await settle();
      if (String(ctx().chatId) !== chatId) throw new Error(`switch to ${chatId} failed: open chat is ${String(ctx().chatId)}`);
    };

    const chatA = await newChat();
    const controlStart = Date.now();
    const controlBefore = { audits: audits(), entries: entries() };
    const controlResult = await rt.runMemorizeBacklog();
    const control = { result: controlResult, ms: Date.now() - controlStart, before: controlBefore, after: { audits: audits(), entries: entries() }, backfill: rt.getSnapshot().memory?.backfill ?? null };

    const chatB = await newChat();
    const bBefore = { audits: audits(), entries: entries() };
    const raceStart = Date.now();
    let settledAt = 0;
    const pending = rt.runMemorizeBacklog().then((value: unknown) => { settledAt = Date.now(); return value; });
    await sleep(300);
    await open(chatA.chatId);
    const switchedAt = Date.now();
    const aOnArrival = { audits: audits(), entries: entries() };
    const raceResult = await pending;
    await sleep(1500);
    const aAfter = { audits: audits(), entries: entries() };
    await open(chatB.chatId);
    const bAfter = { audits: audits(), entries: entries() };
    return { chatA, chatB, control, race: { result: raceResult, switchedBeforeSettled: switchedAt < settledAt, switchMs: switchedAt - raceStart, settleMs: settledAt - raceStart, aOnArrival, aAfter, bBefore, bAfter } };
  }, { groupId, story });
  const controlOk = report.control.result === true && report.control.after.audits > (report.control.before.audits ?? 0);
  const raceOk = report.race.result === false
    && report.race.aAfter.audits === report.race.aOnArrival.audits && report.race.aAfter.entries === report.race.aOnArrival.entries
    && report.race.bAfter.audits === report.race.bBefore.audits && report.race.bAfter.entries === report.race.bBefore.entries;
  const verdict = !report.race.switchedBeforeSettled ? 'INCONCLUSIVE' : controlOk && raceOk ? 'PASS' : 'FAIL';
  const record = { at: new Date().toISOString(), groupId, storyPath, ...report, controlOk, raceOk, verdict };
  const text = JSON.stringify(record, null, 2);
  if (out) writeFileSync(out, `${text}\n`);
  console.log(text);
  process.exitCode = verdict === 'PASS' ? 0 : 1;
} finally {
  await browser.close().catch(() => {});
}
