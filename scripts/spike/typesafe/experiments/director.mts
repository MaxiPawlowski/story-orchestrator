import { choiceOf, noulOf, systemOne, type Question } from '../lib/client.mts';
import { loadData, worlds, type WorldDef } from '../lib/story.mts';
import { tryBaseline } from '../lib/baseline.mts';
import { DIRECTOR_MAX_TOKENS, DIRECTOR_TIMEOUT_MS, narrowByMention, parseDirectorResponse, renderDirectorPrompt, stripReasoningBlocks } from '../lib/prod.mts';
import { coverageSweep, frac, fixed, mean, ms, pct, percentile, table } from '../lib/stats.mts';
import type { Experiment, ExperimentContext } from './types.mts';

interface DirectorCase {
  id: string;
  world: string;
  checkpoint: string;
  candidates: string[];
  lead?: string;
  instruction?: string;
  allowSilence?: boolean;
  weights?: Record<string, number>;
  window: Array<{ speaker: string; text: string }>;
  acceptable: string[];
  tags: string[];
}

interface Candidate { rosterId: string; name: string; weight: number }

const NOBODY = 'nobody';
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_');

function rulesProbability(entry: DirectorCase, pool: Candidate[]): number {
  const last = [...entry.window].reverse().find((message) => pool.some((candidate) => candidate.name === message.speaker))?.speaker;
  const filtered = pool.filter((candidate) => candidate.name !== last);
  const usable = filtered.length ? filtered : pool;
  if (entry.lead) {
    const lead = usable.find((candidate) => candidate.name === entry.lead);
    if (lead) return entry.acceptable.includes(lead.name) ? 1 : 0;
  }
  const total = usable.reduce((sum, candidate) => sum + candidate.weight, 0);
  return usable.filter((candidate) => entry.acceptable.includes(candidate.name)).reduce((sum, candidate) => sum + candidate.weight, 0) / total;
}

function roleOf(world: WorldDef, name: string) {
  return world.roster.find((member) => member.name === name)?.role ?? name;
}

function directorQuestions(entry: DirectorCase, world: WorldDef, pool: Candidate[], prefix: string): Record<string, Question> {
  const lines = [
    'Decide which character should speak next, in response to the latest message in `transcript`.',
    'Pick the character who was addressed, challenged, or has the strongest reason to react.',
    ...(entry.lead ? [`If nobody in particular is addressed, prefer ${entry.lead}, the scene lead.`] : []),
    ...(entry.instruction ? [`Author guidance: ${entry.instruction}`] : []),
    ...(entry.allowSilence ? [`Pick "${NOBODY}" if no character has a reason to respond.`] : []),
  ];
  const silence = entry.allowSilence ? { [NOBODY]: 'No character should respond right now' } : {};
  return {
    [`${prefix}p:who`]: { type: 'choice', instructions: lines.join(' '), criteria: { ...Object.fromEntries(pool.map((candidate) => [candidate.name, null])), ...silence } },
    [`${prefix}s:who`]: { type: 'choice', instructions: lines.join(' '), criteria: { ...Object.fromEntries(pool.map((candidate) => [candidate.name, roleOf(world, candidate.name)])), ...silence } },
  };
}

function compositeQuestions(pool: Candidate[], world: WorldDef, withRoles = true): Record<string, Question> {
  const questions: Record<string, Question> = {};
  for (const candidate of pool) {
    const who = withRoles ? `${candidate.name} (${roleOf(world, candidate.name)})` : candidate.name;
    questions[`addr:${candidate.name}`] = { type: 'noul', instructions: `Is the latest message in \`transcript\` directed at ${who}, by name, title, role or context?` };
    questions[`reason:${candidate.name}`] = { type: 'noul', instructions: `Does ${who} have a strong reason to respond to the latest message in \`transcript\` right now?` };
  }
  questions.nobody = { type: 'noul', instructions: 'Is the latest message in `transcript` something no character needs to respond to, such as the player quietly acting alone or going to sleep?' };
  return questions;
}

export const director: Experiment = {
  id: 'director',
  title: 'Speaker direction: who talks next in a group chat',
  async run(ctx: ExperimentContext) {
    const all = worlds();
    const cases = loadData<DirectorCase[]>('director.json');
    const rows: Array<Record<string, any>> = [];
    const jevLatency: number[] = [];

    await Promise.all(cases.map(async (entry) => {
      const world = all[entry.world];
      const checkpoint = world.checkpoints[entry.checkpoint];
      const candidates: Candidate[] = entry.candidates.map((name) => ({ rosterId: slug(name), name, weight: entry.weights?.[name] ?? 1 }));
      const lastText = entry.window[entry.window.length - 1].text;
      const mentioned: Candidate[] = narrowByMention(candidates, lastText);
      const productionPool = mentioned.length > 1 ? mentioned : candidates;
      const state = {
        scene: { name: checkpoint.name, goal: checkpoint.objective, ...(entry.instruction ? { author_guidance: entry.instruction } : {}) },
        player: world.player,
        transcript: entry.window,
      };
      const narrowed = mentioned.length > 1;
      const record = await systemOne({
        state,
        questions: { ...directorQuestions(entry, world, candidates, ''), ...(narrowed ? directorQuestions(entry, world, productionPool, 'pool:') : {}), ...compositeQuestions(candidates, world) },
      }, { tag: `director:${entry.id}` });
      jevLatency.push(record.latencyMs);
      const pick = (id: string) => {
        const answer = choiceOf(record, id);
        return { name: answer.choice === NOBODY ? 'NONE' : answer.choice, confidence: answer.confidence, probabilities: answer.probabilities };
      };
      const alonePlain = pick('p:who');
      const aloneStructured = pick('s:who');
      const poolPlain = narrowed ? pick('pool:p:who') : alonePlain;
      const poolStructured = narrowed ? pick('pool:s:who') : aloneStructured;
      const scores = candidates.map((candidate) => ({ name: candidate.name, addr: noulOf(record, `addr:${candidate.name}`), reason: noulOf(record, `reason:${candidate.name}`) }));
      const nobody = noulOf(record, 'nobody');
      const ranked = scores.map((item) => ({ ...item, total: 2 * item.addr + item.reason + (entry.lead === item.name ? 0.25 : 0) })).sort((a, b) => b.total - a.total);
      const maxAddr = Math.max(...scores.map((item) => item.addr));
      const composite = entry.allowSilence && nobody > 0.5 && maxAddr < 0.5 ? 'NONE' : ranked[0].name;

      const namesRecord = await systemOne({ state, questions: compositeQuestions(candidates, world, false) }, { tag: `director-names:${entry.id}` });
      const namesScores = candidates.map((candidate) => ({ name: candidate.name, addr: noulOf(namesRecord, `addr:${candidate.name}`), reason: noulOf(namesRecord, `reason:${candidate.name}`) }));
      const namesRanked = namesScores.map((item) => ({ ...item, total: 2 * item.addr + item.reason + (entry.lead === item.name ? 0.25 : 0) })).sort((a, b) => b.total - a.total);
      const namesComposite = entry.allowSilence && noulOf(namesRecord, 'nobody') > 0.5 && Math.max(...namesScores.map((item) => item.addr)) < 0.5 ? 'NONE' : namesRanked[0].name;
      const namesHybrid = alonePlain.confidence >= 0.6 ? alonePlain.name : namesComposite;

      const baselineFor = async (pool: Candidate[], tag: string) => {
        const prompt = renderDirectorPrompt({ storyTitle: world.title, checkpointName: checkpoint.name, objective: checkpoint.objective, candidates: pool, allowSilence: entry.allowSilence === true, lead: pool.find((candidate) => candidate.name === entry.lead)?.name, instruction: entry.instruction, window: entry.window });
        const call = await tryBaseline(prompt, DIRECTOR_MAX_TOKENS, tag);
        if (!call) return null;
        const verdict = call.latencyMs > DIRECTOR_TIMEOUT_MS ? null : parseDirectorResponse(stripReasoningBlocks(call.raw), pool, entry.allowSilence === true);
        const name = verdict === null ? null : verdict.rosterId === null ? 'NONE' : pool.find((candidate) => candidate.rosterId === verdict.rosterId)?.name ?? null;
        return { name, latencyMs: call.latencyMs, raw: call.raw.trim().slice(0, 80) };
      };
      const baseAlone = await baselineFor(candidates, `baseline:director:${entry.id}`);
      const basePool = narrowed ? await baselineFor(productionPool, `baseline:director-pool:${entry.id}`) : baseAlone;

      const ok = (name: string | null | undefined) => (name ? entry.acceptable.includes(name) : false);
      const mentionPick = mentioned.length === 1 ? mentioned[0].name : null;
      const rulesAll = rulesProbability(entry, candidates);
      const rulesPool = rulesProbability(entry, productionPool);
      const pipeline = (directorPick: { name: string | null } | null) => {
        if (mentionPick) return ok(mentionPick) ? 1 : 0;
        if (!directorPick || directorPick.name === null) return rulesPool;
        return ok(directorPick.name) ? 1 : 0;
      };
      rows.push({
        id: entry.id, tags: entry.tags, acceptable: entry.acceptable, mentionPick,
        noDirector: mentionPick ? (ok(mentionPick) ? 1 : 0) : rulesPool,
        rulesOnly: rulesAll,
        jevPlain: alonePlain, jevStructured: aloneStructured, composite, nobody, ranked: ranked.map((item) => `${item.name} a${fixed(item.addr)} r${fixed(item.reason)}`).join('; '),
        baseAlone, basePool,
        pipelineJevPlain: pipeline(poolPlain), pipelineJevStructured: pipeline(poolStructured), pipelineBase: baseAlone ? pipeline(basePool) : null,
        hybrid: aloneStructured.confidence >= 0.6 ? aloneStructured.name : composite,
        namesComposite, namesHybrid,
        correct: { hybrid: ok(aloneStructured.confidence >= 0.6 ? aloneStructured.name : composite), jevPlain: ok(alonePlain.name), jevStructured: ok(aloneStructured.name), composite: ok(composite), namesComposite: ok(namesComposite), namesHybrid: ok(namesHybrid), base: baseAlone ? ok(baseAlone.name) : null, baseParsed: baseAlone ? baseAlone.name !== null : null },
      });
    }));

    rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const n = rows.length;
    const hasBase = rows.some((row) => row.baseAlone);
    const sumOf = (pick: (row: any) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
    const count = (pick: (row: any) => boolean | null) => rows.filter((row) => pick(row) === true).length;
    const needDirector = rows.filter((row) => !row.mentionPick);
    const mentionWrong = rows.filter((row) => row.mentionPick && !row.acceptable.includes(row.mentionPick));

    const systems = table(['approach', 'correct next speaker (26 cases)', 'note'], [
      ['mention rule, else weighted rules (director off)', `${fixed(sumOf((row) => row.noDirector), 1)}/${n} (${pct(sumOf((row) => row.noDirector) / n)})`, 'rules picks are random, so this is the expected value'],
      ['weighted rules only', `${fixed(sumOf((row) => row.rulesOnly), 1)}/${n} (${pct(sumOf((row) => row.rulesOnly) / n)})`, 'expected value'],
      ['current director alone', hasBase ? frac(count((row) => row.correct.base), n) : 'not run', hasBase ? `${n - count((row) => row.correct.baseParsed)} unparseable or timed out` : ''],
      ['Jev choice, names only', frac(count((row) => row.correct.jevPlain), n), 'mechanical migration'],
      ['Jev choice, names + one-line roles', frac(count((row) => row.correct.jevStructured), n), 'role lines from the roster'],
      ['Jev composite (addressed + reason nouls, lead bonus in code)', frac(count((row) => row.correct.composite), n), '2 nouls per candidate + 1 silence noul'],
      ['Jev hybrid: role choice when confidence ≥ 0.6, else composite', frac(count((row) => row.correct.hybrid), n), 'same single request; the rule is code'],
      ['Jev composite, names only (no roles)', frac(count((row) => row.correct.namesComposite), n), 'what a roster without roles gets'],
      ['Jev hybrid, names only: names choice when confidence ≥ 0.6, else names composite', frac(count((row) => row.correct.namesHybrid), n), 'v2.2 plan 01 floor: ≥ 22/26 to run without roles'],
      ['pipeline: mention rule, then current director', hasBase ? `${fixed(sumOf((row) => row.pipelineBase ?? 0), 1)}/${n} (${pct(sumOf((row) => row.pipelineBase ?? 0) / n)})` : 'not run', 'what players get today'],
      ['pipeline: mention rule, then Jev (names only)', `${fixed(sumOf((row) => row.pipelineJevPlain), 1)}/${n} (${pct(sumOf((row) => row.pipelineJevPlain) / n)})`, ''],
      ['pipeline: mention rule, then Jev (roles)', `${fixed(sumOf((row) => row.pipelineJevStructured), 1)}/${n} (${pct(sumOf((row) => row.pipelineJevStructured) / n)})`, ''],
    ]);

    const gate = coverageSweep(rows.map((row) => ({ confidence: row.jevStructured.confidence, correct: row.correct.jevStructured })));
    const gated = [0.5, 0.6, 0.7, 0.8, 0.9].map((floor) => {
      const expected = sumOf((row) => (row.jevStructured.confidence >= floor ? (row.correct.jevStructured ? 1 : 0) : row.rulesOnly));
      return [floor, pct(gate.find((item) => item.threshold === floor)?.coverage ?? NaN), pct(gate.find((item) => item.threshold === floor)?.accuracy ?? NaN), `${fixed(expected, 1)}/${n} (${pct(expected / n)})`];
    });

    const tags = [...new Set(rows.flatMap((row) => row.tags))].sort();
    const tagTable = table(['tag', 'n', 'mention rule', 'current director', 'Jev names', 'Jev roles', 'Jev composite'], tags.map((tag) => {
      const list = rows.filter((row) => row.tags.includes(tag));
      const c = (pick: (row: any) => boolean | null) => `${list.filter((row) => pick(row) === true).length}/${list.length}`;
      return [tag, list.length, `${list.filter((row) => row.mentionPick && row.acceptable.includes(row.mentionPick)).length}/${list.filter((row) => row.mentionPick).length} fired`, hasBase ? c((row) => row.correct.base) : '-', c((row) => row.correct.jevPlain), c((row) => row.correct.jevStructured), c((row) => row.correct.composite)];
    }));

    const detail = table(['case', 'acceptable', 'mention', 'current', 'Jev names', 'Jev roles', 'composite', 'hybrid', 'composite ranking'], rows.map((row) => [
      row.id, row.acceptable.join('|'), row.mentionPick ?? '-', row.baseAlone ? `${row.baseAlone.name ?? 'unparsed'}${row.correct.base ? ' ✓' : ' ✗'}` : '-',
      `${row.jevPlain.name}${row.correct.jevPlain ? ' ✓' : ' ✗'} ${fixed(row.jevPlain.confidence)}`,
      `${row.jevStructured.name}${row.correct.jevStructured ? ' ✓' : ' ✗'} ${fixed(row.jevStructured.confidence)}`,
      `${row.composite}${row.correct.composite ? ' ✓' : ' ✗'}`, `${row.hybrid}${row.correct.hybrid ? ' ✓' : ' ✗'}`, row.ranked,
    ]));

    const baseLatency = rows.filter((row) => row.baseAlone).map((row) => row.baseAlone.latencyMs);
    ctx.shared.set('director.latency', { jev: jevLatency, base: baseLatency });

    return {
      id: this.id,
      title: this.title,
      summary: [
        `${n} labelled group-chat moments. The mention rule fires on ${n - needDirector.length} and is wrong on ${mentionWrong.length} of those (${mentionWrong.map((row) => row.id).join(', ') || 'none'}); the director decides the other ${needDirector.length}.`,
        `Director alone: Jev names-only ${frac(count((row) => row.correct.jevPlain), n)}, Jev with roles ${frac(count((row) => row.correct.jevStructured), n)}, Jev composite ${frac(count((row) => row.correct.composite), n)}, Jev hybrid ${frac(count((row) => row.correct.hybrid), n)}${hasBase ? `, current director ${frac(count((row) => row.correct.base), n)}` : ''}.`,
        `Without roles: Jev composite ${frac(count((row) => row.correct.namesComposite), n)}, Jev hybrid ${frac(count((row) => row.correct.namesHybrid), n)}.`,
        `End-to-end pipeline (mention rule first): director off ${pct(sumOf((row) => row.noDirector) / n)}, with Jev roles ${pct(sumOf((row) => row.pipelineJevStructured) / n)}${hasBase ? `, with current director ${pct(sumOf((row) => row.pipelineBase ?? 0) / n)}` : ''}.`,
        `Latency per decision: Jev p50 ${ms(percentile(jevLatency, 50))}, p90 ${ms(percentile(jevLatency, 90))}${baseLatency.length ? `; current director p50 ${ms(percentile(baseLatency, 50))}, p90 ${ms(percentile(baseLatency, 90))}` : ''}. Every Jev variant rides in one request per turn.`,
      ],
      sections: [
        { title: 'Approaches compared', body: systems },
        { title: 'Confidence-gated fallback: below the floor, use the weighted rules pick (Jev with roles)', body: table(['confidence floor', 'Jev decides', 'Jev accuracy when it decides', 'expected overall'], gated) },
        { title: 'By tag', body: tagTable },
        { title: 'Every case', body: detail },
      ],
      data: rows,
    };
  },
};
