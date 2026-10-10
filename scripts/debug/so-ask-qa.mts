import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { beginSandboxSession, deleteSandboxChats, openGroup } from './st-navigation.mts';
import { scoreAskRun, topicShowMe, type AskAnswerRecord } from './lib/askQaScore.mts';

const USAGE = `Usage: node scripts/debug/so-ask-qa.mts run --group <id|name> [--runs <n>] [--only author|player]

v2.8 09 live Q&A (tier CL). Opens a sandbox chat in the group, imports the fixture story of
test/measurements/v2.8/09/ask-qa.json, then asks every author question (author Ask over the played story and
the live state) and every player question (player Ask over the played projection) through the shipped
storyOrchestratorAsk handle, on whatever profile the authoring role is routed to. Scores against the
predeclared floors (>= 17/20 author answers cite an accepted topic with a correct Show me; 8/8 player answers
name nothing unreached), deletes the sandbox chat, and writes the answers and scores to the debug dir.
Every question is a real model call: run it on a lane whose authoring role is routed to the named profile.`;

const flag = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const askAll = (page, questions: Array<{ id: string; q: string; persona: 'author' | 'player' }>) => evaluateInST(page, async (items) => {
  const handle = (globalThis as any).storyOrchestratorAsk;
  if (!handle?.ask) throw new Error('storyOrchestratorAsk is missing: this build has no Ask handle');
  const records = [];
  for (const item of items) {
    const started = Date.now();
    const outcome = await handle.ask(item.q, item.persona);
    records.push(outcome.ok
      ? {
        id: item.id, persona: item.persona, ok: true, answer: outcome.result.answer, topics: outcome.result.topics.map((topic: { id: string }) => topic.id),
        showMe: outcome.result.showMe, steps: outcome.result.steps.length, refused: outcome.result.steps.filter((step: { status: string }) => step.status === 'refused').length,
        status: outcome.result.status, ms: Date.now() - started,
      }
      : { id: item.id, persona: item.persona, ok: false, answer: outcome.reason, topics: [], showMe: null, steps: 0, refused: 0, status: 'refused', ms: Date.now() - started });
  }
  return records;
}, questions);

async function run(page, args: string[]) {
  const fixture = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'test/measurements/v2.8/09/ask-qa.json'), 'utf-8'));
  const group = flag(args, '--group');
  if (!group) throw new Error('--group <id|name> is required: the sandbox chat is made in that group');
  const runs = Number(flag(args, '--runs') ?? 1);
  const only = flag(args, '--only');
  const results = [];
  for (let index = 0; index < runs; index += 1) {
    await openGroup(page, group);
    const { guard } = await beginSandboxSession(page);
    try {
      const imported = await evaluateInST(page, async (story) => (globalThis as any).storyOrchestratorRuntime.importStory(JSON.stringify(story)), fixture.story);
      if (!imported) throw new Error('the fixture story did not import');
      const questions = [
        ...(only === 'player' ? [] : fixture.author.questions.map((question) => ({ id: question.id, q: question.q, persona: 'author' as const }))),
        ...(only === 'author' ? [] : fixture.player.questions.map((question) => ({ id: question.id, q: question.q, persona: 'player' as const }))),
      ];
      const records: AskAnswerRecord[] = await askAll(page, questions);
      const score = scoreAskRun({
        author: only === 'player' ? [] : fixture.author.questions, player: only === 'author' ? [] : fixture.player.questions, unreached: fixture.player.unreached,
        authorFloor: 17, records, showMeOf: topicShowMe,
      });
      results.push({ run: index + 1, chat: guard.sandboxChatId, score, records });
    } finally {
      await deleteSandboxChats(page, guard);
    }
  }
  return { ok: true, profile: fixture.profile, runs: results.map((entry) => ({ run: entry.run, author: `${entry.score.author.passed}/${entry.score.author.of}`, player: `${entry.score.player.clean}/${entry.score.player.of}`, pass: entry.score.pass })), results };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (hasHelpFlag() || args[0] !== 'run') {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  runCli(async (page) => {
    const output = await run(page, args);
    console.log(JSON.stringify({ runs: output.runs, failures: output.results.map((entry) => ({ run: entry.run, author: entry.score.author.rows.filter((row) => !row.pass), player: entry.score.player.rows.filter((row) => !row.pass) })) }, null, 2));
    await writeJSON(output, 'so-ask-qa');
    return { ok: output.ok };
  });
}
