import { configureClient, ledger, systemOne, USD_PER_M_INPUT, type Answer, type CallRecord, type Question, type SystemOneRequest } from '../lib/client.mts';
import { loadHardCases, msgId, transcriptState, type Message } from '../lib/story.mts';
import { fixed, mean, ms, percentile, std, table } from '../lib/stats.mts';
import type { Experiment, ExperimentContext } from './types.mts';
import { TENSION_SCALE } from './extraction.mts';

const TERMS = ['reactor', 'breach', 'medbay', 'burns', 'captain', 'engineer', 'containment', 'radiation', 'coolant', 'antenna', 'mayday', 'bulkhead', 'airlock', 'oxygen', 'fire', 'weapon', 'pirates', 'station', 'cargo', 'fuel',
  'shuttle', 'hull', 'deck three', 'sensors', 'navigation', 'gravity', 'escape pod', 'distress', 'injury', 'death', 'betrayal', 'sabotage', 'storm', 'asteroid', 'repair', 'drone', 'alarm', 'power', 'lights', 'music',
  'coffee', 'dog', 'horse', 'sword', 'castle', 'dragon', 'money', 'contract', 'letter', 'map', 'key', 'door', 'window', 'rain', 'snow', 'desert', 'ocean', 'forest', 'city', 'village', 'guild', 'riddle', 'sphinx', 'moon'];

const fanoutQuestions = (count: number): Record<string, Question> => Object.fromEntries(TERMS.slice(0, count).map((term, index) => [`q${index}`, { type: 'noul' as const, instructions: `Is ${term} mentioned or involved in \`transcript\`?` }]));

const fixedQuestions: Record<string, Question> = {
  tension: { type: 'score', instructions: 'Rate the current tension of the scene in `transcript`.', criteria: TENSION_SCALE },
  danger: { type: 'noul', instructions: 'Is anyone in physical danger in the latest message of `transcript`?' },
  question: { type: 'noul', instructions: 'Does the latest message in `transcript` ask someone a question?' },
  speaker: { type: 'noul', instructions: 'Is the latest message in `transcript` written by the player?' },
};

async function sequential(times: number, make: (index: number) => Promise<CallRecord>) {
  const out: CallRecord[] = [];
  for (let index = 0; index < times; index += 1) out.push(await make(index));
  return out;
}

const decision = (answer: Answer) => (answer.type === 'noul' ? String(answer.noul >= 0.5) : answer.type === 'choice' ? answer.choice : String(Math.round(answer.score)));
const primary = (answer: Answer, reference: Answer) => {
  if (answer.type === 'noul') return answer.noul;
  if (answer.type === 'choice' && reference.type === 'choice') return answer.probabilities[reference.choice] ?? 0;
  return answer.type === 'score' ? answer.score : 0;
};

export const performance: Experiment = {
  id: 'performance',
  title: 'Performance: latency, fan-out, state size, bursts, cost, and repeat-run stability',
  async run(ctx: ExperimentContext) {
    const hard = loadHardCases();
    const base = hard.find((item) => item.id === 'H23')!;
    const baseState = transcriptState({ story: { title: base.title, current_scene: base.checkpoint.name } }, base.transcript);
    const reps = 5;
    const stamp = Date.now();

    const fanout: Array<Array<string | number>> = [];
    for (const count of [1, 4, 16, 64]) {
      const calls = await sequential(reps, (index) => systemOne({ state: baseState, questions: fanoutQuestions(count) }, { tag: `perf:fanout:${count}`, salt: `${stamp}:${count}:${index}` }));
      const lat = calls.map((call) => call.latencyMs);
      fanout.push([count, ms(percentile(lat, 50)), ms(Math.min(...lat)), ms(Math.max(...lat)), fixed(mean(calls.map((call) => call.usage.input_tokens)), 0)]);
    }

    const pool: Message[] = hard.flatMap((item) => item.transcript);
    const sizes: Array<Array<string | number>> = [];
    for (const size of [2, 8, 32, 96]) {
      const transcript = pool.slice(0, size).map((message, index) => ({ ...message, index }));
      const state = transcriptState({}, transcript);
      const calls = await sequential(reps, (index) => systemOne({ state, questions: fixedQuestions }, { tag: `perf:size:${size}`, salt: `${stamp}:${size}:${index}` }));
      const lat = calls.map((call) => call.latencyMs);
      sizes.push([size, fixed(mean(calls.map((call) => call.usage.input_tokens)), 0), ms(percentile(lat, 50)), ms(Math.max(...lat))]);
    }

    configureClient({ concurrency: 16 });
    const burstStart = Date.now();
    const burst = await Promise.all(Array.from({ length: 16 }, (_, index) => systemOne({ state: baseState, questions: fixedQuestions }, { tag: 'perf:burst', salt: `${stamp}:burst:${index}` })));
    const burstWall = Date.now() - burstStart;
    configureClient({ concurrency: 4 });

    const targets = ledger.filter((call) => (/^extraction:H\d+$/.test(call.tag) || /^director:D\d+$/.test(call.tag)) && !call.dry);
    const picked = [...targets.filter((call) => call.tag.startsWith('extraction')).slice(0, 8), ...targets.filter((call) => call.tag.startsWith('director')).slice(0, 8)];
    const stability: Array<{ tag: string; id: string; type: string; spread: number; flips: boolean }> = [];
    for (const call of picked) {
      const runs = await sequential(ctx.repeat, (index) => systemOne(call.request as SystemOneRequest, { tag: `perf:repeat:${call.tag}`, salt: `${stamp}:repeat:${index}` }));
      for (const [id, reference] of Object.entries(call.answers)) {
        const answers = runs.map((run) => run.answers[id]).filter(Boolean);
        const values = answers.map((answer) => primary(answer, reference));
        stability.push({ tag: call.tag, id, type: reference.type, spread: std(values), flips: new Set(answers.map(decision)).size > 1 });
      }
    }
    const byType = ['noul', 'choice', 'score'].map((type) => {
      const list = stability.filter((row) => row.type === type);
      return [type, list.length, fixed(mean(list.map((row) => row.spread)), 4), fixed(Math.max(0, ...list.map((row) => row.spread)), 3), `${list.filter((row) => row.flips).length}/${list.length}`];
    });

    const extractionCalls = ledger.filter((call) => call.tag.startsWith('extraction:') && !call.dry);
    const directorCalls = ledger.filter((call) => call.tag.startsWith('director:') && !call.dry);
    const tokens = (list: CallRecord[]) => mean(list.map((call) => call.usage?.input_tokens ?? 0));
    const promptChars = (ctx.shared.get('extraction.promptChars') as number[] | undefined) ?? [];
    const perBoundary = (tokens(extractionCalls) || 0) + (tokens(directorCalls) || 0);
    const costRows = [
      ['shared read (one Jev call per boundary)', fixed(tokens(extractionCalls), 0), `$${fixed((tokens(extractionCalls) * 1000 / 1e6) * USD_PER_M_INPUT, 4)}`],
      ['speaker direction (one Jev call per group turn)', fixed(tokens(directorCalls), 0), `$${fixed((tokens(directorCalls) * 1000 / 1e6) * USD_PER_M_INPUT, 4)}`],
      ['both, per boundary', fixed(perBoundary, 0), `$${fixed((perBoundary * 1000 / 1e6) * USD_PER_M_INPUT, 4)}`],
    ];
    const flips = stability.filter((row) => row.flips);
    const burstLat = burst.map((call) => call.latencyMs);

    return {
      id: this.id,
      title: this.title,
      summary: [
        `Fan-out: ${fanout.map((row) => `${row[0]} question(s) p50 ${row[1]}`).join(', ')} on the same state.`,
        `State size: ${sizes.map((row) => `${row[0]} messages ≈ ${row[1]} tokens, p50 ${row[2]}`).join('; ')}.`,
        `Burst of 16 parallel calls: all done in ${ms(burstWall)} wall time, slowest ${ms(Math.max(...burstLat))}, retries ${burst.reduce((sum, call) => sum + Math.max(0, call.attempts - 1), 0)}.`,
        `Repeat-run stability over ${ctx.repeat} identical requests for ${picked.length} real calls (${stability.length} answers): mean spread ${fixed(mean(stability.map((row) => row.spread)), 4)}, decisions that flipped between runs ${flips.length}/${stability.length}.`,
        `Cost: ${fixed(perBoundary, 0)} input tokens per boundary for shared read + direction, about $${fixed((perBoundary * 1000 / 1e6) * USD_PER_M_INPUT, 3)} per 1000 boundaries. Today's shared-read prompt averages ${fixed(mean(promptChars), 0)} characters and runs on your GPU.`,
      ],
      sections: [
        { title: 'Fan-out: questions per call vs latency (5 sequential calls each)', body: table(['questions', 'p50', 'min', 'max', 'input tokens'], fanout) },
        { title: 'State size: transcript length vs latency (4 questions, 5 calls each)', body: table(['messages', 'input tokens', 'p50', 'max'], sizes) },
        { title: 'Repeat-run stability by answer type', body: table(['type', 'answers', 'mean std of probability/score', 'worst std', 'decision flipped'], byType) },
        ...(flips.length ? [{ title: 'Answers whose decision flipped between identical runs', body: table(['call', 'question id', 'type', 'std'], flips.map((row) => [row.tag, row.id, row.type, fixed(row.spread, 3)])) }] : []),
        { title: 'Cost per 1000 boundaries (input tokens only; output is free)', body: table(['call', 'mean input tokens', 'per 1000'], costRows) },
      ],
      data: { fanout, sizes, burstWall, burstLat, stability },
    };
  },
};
