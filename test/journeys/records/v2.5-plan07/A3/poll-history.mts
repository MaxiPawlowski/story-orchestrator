import { existsSync } from 'node:fs';
import { writeFile, appendFile } from 'node:fs/promises';
import { connectToST } from '../../scripts/debug/lib/connection.mts';
import { gateReplayHistoryFrom } from '../../scripts/debug/so-ui.mts';

const [out, stopFile, logFile, skipChat] = process.argv.slice(2);
const { page } = await connectToST();
let best: { chatId: string; boundaries: number; history: unknown } | null = null;
const log = (line: string) => appendFile(logFile, `${new Date().toISOString()} ${line}\n`);
await log(`start skipChat=${skipChat}`);
while (!existsSync(stopFile)) {
  try {
    const state = await page.evaluate(() => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      return { chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, blob: ctx.chatMetadata?.story_orchestrator ?? null };
    });
    const history = gateReplayHistoryFrom(state.blob) as { engineHistory: { log: unknown[] } } | null;
    if (history && state.chatId && state.chatId !== skipChat) {
      const boundaries = history.engineHistory.log.length;
      const json = JSON.stringify(history);
      if (!best || best.chatId !== state.chatId || JSON.stringify(best.history) !== json) {
        if (best && best.chatId === state.chatId && boundaries < best.boundaries) {
          await log(`SHRINK ${state.chatId} ${best.boundaries} -> ${boundaries}; pre-shrink copy saved`);
          await writeFile(`${out}.pre-shrink-${best.boundaries}.json`, JSON.stringify(best.history, null, 2));
        }
        if (best && best.chatId !== state.chatId) await log(`CHAT CHANGED ${best.chatId} -> ${state.chatId}`);
        best = { chatId: state.chatId, boundaries, history };
        await writeFile(out, JSON.stringify(history, null, 2));
        await log(`wrote chat=${state.chatId} group=${state.groupId} boundaries=${boundaries}`);
      }
    }
  } catch (error) {
    await log(`error ${error instanceof Error ? error.message : String(error)}`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
await log(`stop best=${best ? `${best.chatId}:${best.boundaries}` : 'none'}`);
process.exit(0);
