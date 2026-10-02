import { createHash } from 'node:crypto';
import { seededRandom } from './ratingPack.mts';

export const LETTERS = ['A', 'B', 'C', 'D'] as const;
export type Letter = typeof LETTERS[number];
export const CRITERIA = ['coherence', 'prose', 'scene', 'agency', 'overall'] as const;
export type Criterion = typeof CRITERIA[number];
export const CRITERIA_TEXT: Record<Criterion, string> = {
  coherence: 'coherence / no loops: the reply makes sense and does not repeat lines or sentences',
  prose: 'prose quality: no dropped, doubled or glued words; reads as finished English',
  scene: 'follows the scene and the addressee: answers what the player just did or asked, in the right voice, consistent with the context',
  agency: 'agency respected: does not narrate, speak for or decide for the player',
  overall: 'overall: which reply would you rather have in the game',
};

export interface Turn { role: string; text: string }
export interface ContextTurn { who: string; text: string }
export interface Excerpt { speaker: string; situation: string[]; context: ContextTurn[] }
export interface ReplyRow { arm: string; body: string; text: string; stop_type?: string; reasoning?: string | null }
export interface PackTurn { id: string; speaker: string; situation: string[]; context: ContextTurn[]; replies: Record<Letter, PackReply> }
export interface PackReply { text: string; cutOff: boolean; reasoning?: string }
export interface Pack { format: 1; criteria: typeof CRITERIA; turns: PackTurn[] }
export interface SealedKey { format: 1; seed: string; configs: string[]; turns: Record<string, { source: string; letters: Record<Letter, string> }> }

const THOUGHT = /^<\|channel>thought\n<channel\|>/;
const SITUATION = /^(Objective:|Direction for |\[Scene:)/;

export function parseGemmaTurns(prompt: string): Turn[] {
  const turns: Turn[] = [];
  const pattern = /<\|turn>(\w+)\n([\s\S]*?)(?:<turn\|>|$)/g;
  for (let match = pattern.exec(prompt); match; match = pattern.exec(prompt)) {
    turns.push({ role: match[1], text: match[2] });
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return turns;
}

const clip = (text: string, max: number) => {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const head = Math.floor(max * 0.6);
  const tail = max - head;
  return `${trimmed.slice(0, head)}\n[… ${trimmed.length - max} characters left out …]\n${trimmed.slice(-tail)}`;
};

export function contextExcerpt(prompt: string, { turns = 8, maxChars = 1800 } = {}): Excerpt {
  const parsed = parseGemmaTurns(prompt);
  const last = parsed[parsed.length - 1];
  if (!last || last.role !== 'model') throw new Error('the prompt does not end on an open model turn');
  const prefix = last.text.replace(THOUGHT, '').trim();
  const speaker = prefix.replace(/:$/, '').trim();
  if (!speaker || prefix.includes('\n')) throw new Error(`the open model turn is not a speaker prefix: ${JSON.stringify(prefix.slice(0, 80))}`);
  const situation = [...new Set(parsed.filter((turn) => turn.role === 'system').flatMap((turn) => turn.text.split(/\r?\n/)).map((line) => line.trim()).filter((line) => SITUATION.test(line)))];
  const player = /Do not write what (.+?) does\./.exec(parsed[0]?.role === 'system' ? parsed[0].text : '')?.[1] ?? null;
  const lastExample = player ? parsed.reduce((found, turn, at) => (turn.role === 'user' && turn.text.startsWith(`${player}:`) ? at : found), -1) : -1;
  const chatStart = lastExample < 0 ? 0 : lastExample + 1 + (parsed[lastExample + 1]?.role === 'model' ? 1 : 0);
  const chat = parsed.slice(chatStart, -1).filter((turn) => turn.role === 'user' || turn.role === 'model');
  const context = chat.slice(-turns).map((turn) => {
    if (turn.role === 'user') return { who: 'Player', text: clip(turn.text, maxChars) };
    const named = /^([^\n:]{1,40}):\s*/.exec(turn.text);
    return { who: named ? named[1].trim() : 'Narration', text: clip(named ? turn.text.slice(named[0].length) : turn.text, maxChars) };
  });
  return { speaker, situation: situation.slice(-6), context };
}

export function shuffleLetters(configs: string[], seed: string, turnId: string): Record<Letter, string> {
  if (configs.length !== LETTERS.length) throw new Error(`a turn needs exactly ${LETTERS.length} configs, got ${configs.length}`);
  const random = seededRandom(`${seed}:${turnId}`);
  const order = [...configs].sort();
  for (let at = order.length - 1; at > 0; at -= 1) {
    const pick = Math.floor(random() * (at + 1));
    [order[at], order[pick]] = [order[pick], order[at]];
  }
  return Object.fromEntries(LETTERS.map((letter, at) => [letter, order[at]])) as Record<Letter, string>;
}

export function buildModelPack(input: { seed: string; bodies: Array<{ body: string; prompt: string }>; replies: ReplyRow[] }): { pack: Pack; key: SealedKey } {
  const configs = [...new Set(input.replies.map((row) => row.arm))].sort();
  const turns: PackTurn[] = [];
  const keyTurns: SealedKey['turns'] = {};
  const ordered = [...input.bodies].sort((a, b) => a.body.localeCompare(b.body));
  ordered.forEach(({ body, prompt }, index) => {
    const id = `T${String(index + 1).padStart(2, '0')}`;
    const rows = input.replies.filter((row) => row.body === body);
    const missing = configs.filter((config) => rows.filter((row) => row.arm === config).length !== 1);
    if (missing.length) throw new Error(`${body}: needs exactly one reply per config, missing or doubled: ${missing.join(', ')}`);
    const letters = shuffleLetters(configs, input.seed, id);
    const excerpt = contextExcerpt(prompt);
    const replies = Object.fromEntries(LETTERS.map((letter) => {
      const row = rows.find((candidate) => candidate.arm === letters[letter])!;
      const reasoning = row.reasoning?.trim();
      return [letter, { text: row.text.trim(), cutOff: row.stop_type === 'limit', ...(reasoning ? { reasoning } : {}) }];
    })) as PackTurn['replies'];
    turns.push({ id, ...excerpt, replies });
    keyTurns[id] = { source: body, letters };
  });
  return { pack: { format: 1, criteria: CRITERIA, turns }, key: { format: 1, seed: input.seed, configs, turns: keyTurns } };
}

const LEAK_WORDS = /\bBL\d\b|\bTP\d\b|cydonia|artemis|mistral|gemma|skyfall|magistral|<\/?think>|\[\/?THINK\]|\bv1\.[12]\b|min_p|<\|channel>|<channel\|>|\[\/?INST\]|<\/s>|\bb\d\d-|replies\.jsonl|configs\.json|so-lanes/i;

export function modelPackLeaks(pack: Pack, key: SealedKey): string[] {
  const leaks: string[] = [];
  const text = JSON.stringify(pack);
  for (const config of key.configs) if (text.includes(config)) leaks.push(`the pack names config ${config}`);
  for (const [id, turn] of Object.entries(key.turns)) if (new RegExp(`\\b${turn.source}\\b`).test(text)) leaks.push(`${id}: the pack names its source turn ${turn.source}`);
  for (const turn of pack.turns) {
    if (JSON.stringify(Object.keys(turn).sort()) !== JSON.stringify(['context', 'id', 'replies', 'situation', 'speaker'])) leaks.push(`${turn.id}: carries fields beyond the excerpt and replies`);
    for (const letter of LETTERS) {
      const reply = turn.replies[letter];
      const keys = reply ? JSON.stringify(Object.keys(reply).sort()) : '';
      if (!reply || (keys !== JSON.stringify(['cutOff', 'text']) && keys !== JSON.stringify(['cutOff', 'reasoning', 'text']))) leaks.push(`${turn.id} ${letter}: a reply carries more than its text and reasoning`);
      else if (LEAK_WORDS.test(reply.text)) leaks.push(`${turn.id} ${letter}: the reply text carries a config or template marker`);
      else if (reply.reasoning && LEAK_WORDS.test(reply.reasoning)) leaks.push(`${turn.id} ${letter}: the reasoning carries a config or template marker`);
    }
    if (LEAK_WORDS.test(JSON.stringify({ situation: turn.situation, context: turn.context, speaker: turn.speaker }))) leaks.push(`${turn.id}: the context carries a config or template marker`);
  }
  return leaks;
}

export const keySha256 = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf-8').digest('hex');

export function renderPackMarkdown(pack: Pack): string {
  const out: string[] = ['# Blind model pack', '', `${pack.turns.length} turns, ${LETTERS.length} replies each (A–D, order independent per turn). Rate in \`rating-sheet.csv\`; see \`README.md\`.`, ''];
  for (const turn of pack.turns) {
    out.push(`## ${turn.id} — reply as **${turn.speaker}**`, '');
    if (turn.situation.length) out.push('**Situation (from the story direction):**', '', ...turn.situation.map((line) => `> ${line}`), '');
    out.push('**Recent chat:**', '');
    for (const line of turn.context) out.push(`**${line.who}:**`, '', ...line.text.split(/\r?\n/).map((row) => `> ${row}`), '');
    for (const letter of LETTERS) {
      const reply = turn.replies[letter];
      out.push(`### ${turn.id} ${letter}`, '', '```text', reply.text, '```', ...(reply.cutOff ? ['', '*(cut off at the length limit)*'] : []), '');
      if (reply.reasoning) out.push('<details><summary>Reasoning written before this reply (not rated)</summary>', '', '```text', reply.reasoning, '```', '', '</details>', '');
    }
    out.push('---', '');
  }
  return out.join('\n');
}

export function ratingSheet(pack: Pack): string {
  const header = ['turn', 'reply', ...CRITERIA.map((criterion) => `${criterion}_1to5`), 'rank_1to4', 'note'];
  const rows = pack.turns.flatMap((turn) => LETTERS.map((letter) => [turn.id, letter, ...CRITERIA.map(() => ''), '', ''].join(',')));
  return [header.join(','), ...rows].join('\n') + '\n';
}

export function parseJudgeReply(text: string): { scores: Record<Letter, Record<Criterion, number>>; rank: Letter[] } | { problem: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { problem: 'no JSON object in the reply' };
  let data: any;
  try { data = JSON.parse(text.slice(start, end + 1)); } catch (error) { return { problem: `invalid JSON: ${(error as Error).message}` }; }
  const scores = {} as Record<Letter, Record<Criterion, number>>;
  for (const letter of LETTERS) {
    const row = data?.scores?.[letter];
    if (!row) return { problem: `no scores for ${letter}` };
    const parsed = {} as Record<Criterion, number>;
    for (const criterion of CRITERIA) {
      const value = Number(row[criterion]);
      if (!Number.isInteger(value) || value < 1 || value > 5) return { problem: `${letter}.${criterion} is not an integer 1-5` };
      parsed[criterion] = value;
    }
    scores[letter] = parsed;
  }
  const rank = Array.isArray(data?.rank) ? data.rank.map(String) : [];
  if (rank.length !== LETTERS.length || new Set(rank).size !== LETTERS.length || !rank.every((letter: string) => (LETTERS as readonly string[]).includes(letter))) return { problem: 'rank must list A, B, C and D once each, best first' };
  return { scores, rank: rank as Letter[] };
}

export interface ConfigAggregate { config: string; turns: number; mean: Record<Criterion, number>; meanRank: number; firstPlaces: number }

export function aggregateByConfig(judged: Record<string, { scores: Record<Letter, Record<Criterion, number>>; rank: Letter[] }>, key: SealedKey): ConfigAggregate[] {
  const sums = new Map<string, { turns: number; totals: Record<Criterion, number>; rank: number; first: number }>();
  for (const config of key.configs) sums.set(config, { turns: 0, totals: Object.fromEntries(CRITERIA.map((criterion) => [criterion, 0])) as Record<Criterion, number>, rank: 0, first: 0 });
  for (const [id, result] of Object.entries(judged)) {
    const letters = key.turns[id]?.letters;
    if (!letters) throw new Error(`${id} is not in the key`);
    for (const letter of LETTERS) {
      const entry = sums.get(letters[letter])!;
      entry.turns += 1;
      for (const criterion of CRITERIA) entry.totals[criterion] += result.scores[letter][criterion];
      entry.rank += result.rank.indexOf(letter) + 1;
      if (result.rank[0] === letter) entry.first += 1;
    }
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return [...sums.entries()].map(([config, entry]) => ({
    config, turns: entry.turns,
    mean: Object.fromEntries(CRITERIA.map((criterion) => [criterion, entry.turns ? round(entry.totals[criterion] / entry.turns) : 0])) as Record<Criterion, number>,
    meanRank: entry.turns ? round(entry.rank / entry.turns) : 0, firstPlaces: entry.first,
  })).sort((a, b) => a.meanRank - b.meanRank || b.mean.overall - a.mean.overall);
}

export function judgePrompt(turn: PackTurn): string {
  const lines = [
    'You are rating four candidate replies in a group roleplay chat, blind. The replies are labelled A-D in random order.',
    `Each reply is written as ${turn.speaker}, continuing the chat below. The player is a human; a reply must never narrate, speak for or decide for the player.`,
    '',
    'Score every reply 1 (bad) to 5 (excellent) on each criterion:',
    ...CRITERIA.map((criterion) => `- ${criterion}: ${CRITERIA_TEXT[criterion]}`),
    'Then rank the four replies best first. A reply cut off at the length limit counts against coherence only if what is there is broken or looping.',
    '',
    'Answer with ONE JSON object and nothing else, shaped exactly:',
    '{"scores":{"A":{"coherence":n,"prose":n,"scene":n,"agency":n,"overall":n},"B":{...},"C":{...},"D":{...}},"rank":["?","?","?","?"],"why":"one or two sentences"}',
    '',
  ];
  if (turn.situation.length) lines.push('SITUATION (story direction the writer was given):', ...turn.situation, '');
  lines.push('RECENT CHAT:');
  for (const line of turn.context) lines.push(`${line.who}: ${line.text}`, '');
  for (const letter of LETTERS) {
    const reply = turn.replies[letter];
    lines.push(`=== REPLY ${letter}${reply.cutOff ? ' (cut off at the length limit)' : ''} ===`, reply.text, '');
  }
  return lines.join('\n');
}
