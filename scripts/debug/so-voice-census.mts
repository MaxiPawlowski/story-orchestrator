import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { namedEntries } from '../../src/judge/loreLexical.ts';
import { crossVoiceHits, partyNames, trimCrossVoice, type VoiceParty } from '../../src/talk/crossVoice.ts';
import { distinctReplies, laneChatDirs, loadGroupChats, loadSessionChats, type CorpusChat } from './lib/voiceCorpus.mts';
import { capitalisedChats, chatDrift, driftVerdict, nameNearMisses, nameVocabulary, DRIFT_FLOORS, type DriftReply } from './lib/voiceDrift.mts';

const USAGE = `Usage: node scripts/debug/so-voice-census.mts <cross|names|drift|hold|all> [--root C:/dev/so-lanes] [--sessions C:/dev/so-sessions.git]

v3.0 42a G offline voice counts over the lane group chats and the private session chat dumps (read through git, deduplicated). Prints counts only, never chat text.
  cross   G1: replies with another member's or the player's header line, prose attribution, and what the trim keeps
  names   G3: near-miss spellings of speaker names per 1000 member replies
  drift   G2: character 3-gram distance per position bucket, own and between members, card examples where readable
  hold    G6: lore-select judge rounds per member generation, asked per message (before) vs held across a round (after)`;

const argValue = (args: string[], name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] ?? null : null; };

const others = (chat: CorpusChat, self: string): VoiceParty[] => [
  ...chat.members.filter((name) => name !== self).map((name) => ({ id: name, names: partyNames(name) })),
  ...chat.players.map((name) => ({ id: name, names: partyNames(name), player: true })),
];

const per = (count: number, total: number, unit: number) => (total ? Number(((count / total) * unit).toFixed(3)) : null);

export const crossCensus = (chats: readonly CorpusChat[]) => {
  const replies = distinctReplies(chats);
  let header = 0;
  let headerPlayer = 0;
  let said = 0;
  let saidPlayer = 0;
  let trimmed = 0;
  let kept = 0;
  let removedChars = 0;
  let totalChars = 0;
  let leftAfterTrim = 0;
  for (const { chat, message } of replies) {
    const parties = others(chat, message.speaker);
    const hits = crossVoiceHits(message.text, [message.speaker], parties);
    totalChars += message.text.length;
    const firstHeader = hits.find((hit) => hit.kind === 'header');
    if (firstHeader) {
      header += 1;
      if (hits.some((hit) => hit.kind === 'header' && hit.player)) headerPlayer += 1;
      const trim = trimCrossVoice(message.text, [message.speaker], parties);
      if (trim) {
        trimmed += 1;
        removedChars += trim.removed;
        if (crossVoiceHits(trim.text, [message.speaker], parties).some((hit) => hit.kind === 'header')) leftAfterTrim += 1;
      } else kept += 1;
    }
    if (hits.some((hit) => hit.kind === 'said')) said += 1;
    if (hits.some((hit) => hit.kind === 'said' && hit.player)) saidPlayer += 1;
  }
  return {
    chats: chats.length, replies: replies.length,
    header, headerPer100: per(header, replies.length, 100), headerPlayer,
    said, saidPer100: per(said, replies.length, 100), saidPlayer,
    trimmed, keptAsWritten: kept, leftAfterTrim, removedShare: per(removedChars, totalChars, 1),
    stopLines: { communityP1: 2, researchP3: 1 },
  };
};

export const nameCensus = (chats: readonly CorpusChat[]) => {
  const replies = distinctReplies(chats);
  const vocabulary = nameVocabulary(chats.flatMap((chat) => chat.messages.map((message) => message.text)), chats.flatMap((chat) => [...chat.members, ...chat.players]),
    capitalisedChats(chats.map((chat) => chat.messages.map((message) => message.text))));
  let hits = 0;
  let replyHits = 0;
  const pairs = new Set<string>();
  for (const { chat, message } of replies) {
    const found = nameNearMisses(message.text, [...chat.members, ...chat.players], vocabulary);
    hits += found.length;
    if (found.length) replyHits += 1;
    found.forEach((hit) => pairs.add(`${hit.name}>${hit.seen}`));
  }
  return { replies: replies.length, nearMisses: hits, repliesWithNearMiss: replyHits, per1000: per(hits, replies.length, 1000), distinctSpellings: pairs.size };
};

const readCardExamples = (root: string): Record<string, string> => {
  const cards: Record<string, string> = {};
  for (const lane of existsSync(root) ? readdirSync(root) : []) {
    const dir = join(root, lane, 'data', 'default-user', 'characters');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.png')) continue;
      try {
        const bytes = readFileSync(join(dir, file));
        const at = bytes.indexOf('tEXtchara\u0000', 0, 'latin1');
        if (at < 0) continue;
        const length = bytes.readUInt32BE(at - 4);
        const raw = bytes.subarray(at + 10, at + 4 + length).toString('latin1');
        const card = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { name?: string; mes_example?: string; data?: { name?: string; mes_example?: string } };
        const name = card.data?.name ?? card.name;
        const example = card.data?.mes_example ?? card.mes_example;
        if (name && example?.trim() && !cards[name]) cards[name] = example.replace(/<START>/gi, ' ').replace(/\{\{char\}\}:|\{\{user\}\}:/gi, ' ');
      } catch { continue; }
    }
  }
  return cards;
};

export const driftCensus = (chats: readonly CorpusChat[], cards: Record<string, string>) => {
  const drifts = [];
  for (const chat of chats) {
    const counts = new Map<string, number>();
    const replies: DriftReply[] = [];
    for (const message of chat.messages) {
      if (message.user) continue;
      const position = (counts.get(message.speaker) ?? 0) + 1;
      counts.set(message.speaker, position);
      replies.push({ member: message.speaker, position, text: message.text });
    }
    if (![...counts.values()].some((count) => count > 10)) continue;
    drifts.push(chatDrift(replies, cards, [...chat.members, ...chat.players]));
  }
  const verdict = driftVerdict(drifts);
  const ownAt = (bucket: '11-30' | '31-60' | '61+') => {
    const values = drifts.flatMap((drift) => drift.members.flatMap((member) => (member.own[bucket] !== undefined ? [member.own[bucket] as number] : [])));
    return { members: values.length, mean: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : null };
  };
  const cardRows = drifts.flatMap((drift) => drift.members.filter((member) => Object.keys(member.card).length));
  const meanAt = (rows: typeof cardRows, bucket: '1-10' | '61+') => {
    const values = rows.flatMap((row) => (row.card[bucket] !== undefined ? [row.card[bucket] as number] : []));
    return values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : null;
  };
  return {
    chatsPast10: drifts.length,
    membersPast10: drifts.reduce((sum, drift) => sum + drift.members.filter((member) => member.replies > 10).length, 0),
    membersPast60: drifts.reduce((sum, drift) => sum + drift.members.filter((member) => member.replies > 60).length, 0),
    verdict, floors: DRIFT_FLOORS,
    own: { '11-30': ownAt('11-30'), '31-60': ownAt('31-60'), '61+': ownAt('61+') },
    between: Object.fromEntries((['1-10', '11-30', '31-60', '61+'] as const).map((bucket) => {
      const values = drifts.flatMap((drift) => (drift.between[bucket] !== undefined ? [drift.between[bucket] as number] : []));
      return [bucket, values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : null];
    })),
    card: { members: cardRows.length, first: meanAt(cardRows, '1-10'), late: meanAt(cardRows, '61+') },
  };
};

export const LORE_WINDOW = 8;

export const holdCensus = (chats: readonly CorpusChat[]) => {
  let before = 0;
  let after = 0;
  let roundsMulti = 0;
  let beforeMulti = 0;
  let afterMulti = 0;
  for (const chat of chats) {
    const entities = [...chat.members, ...chat.players].map((name, uid) => ({ world: 'cast', uid, comment: name, content: '', keys: [name] }));
    let lastKey: string | null = null;
    let playerTurn = -1;
    let round = { generations: 0, asks: 0 };
    const close = () => {
      if (round.generations >= 2) { roundsMulti += 1; beforeMulti += round.generations; afterMulti += round.asks; }
      round = { generations: 0, asks: 0 };
    };
    chat.messages.forEach((message, index) => {
      if (message.user) {
        playerTurn = index;
        close();
        return;
      }
      const window = chat.messages.slice(Math.max(0, index - LORE_WINDOW), index);
      const key = `${playerTurn}|${namedEntries(entities, window).join(',')}`;
      before += 1;
      round.generations += 1;
      if (key !== lastKey) { after += 1; round.asks += 1; lastKey = key; }
    });
    close();
  }
  return { generations: before, asksBefore: before, asksAfter: after, ratio: before ? Number((after / before).toFixed(4)) : null,
    multiMemberRounds: roundsMulti, multiBefore: beforeMulti, multiAfter: afterMulti, multiRatio: beforeMulti ? Number((afterMulti / beforeMulti).toFixed(4)) : null, floor: 0.6 };
};

const main = () => {
  const [command, ...args] = process.argv.slice(2);
  if (!command || !['cross', 'names', 'drift', 'hold', 'all'].includes(command)) {
    console.log(USAGE);
    process.exit(command ? 1 : 0);
  }
  const root = argValue(args, '--root') ?? 'C:/dev/so-lanes';
  const sessions = argValue(args, '--sessions') ?? 'C:/dev/so-sessions.git';
  const chats = loadGroupChats(laneChatDirs(root), loadSessionChats(sessions));
  const out: Record<string, unknown> = {};
  if (command === 'cross' || command === 'all') out.cross = crossCensus(chats);
  if (command === 'names' || command === 'all') out.names = nameCensus(chats);
  if (command === 'hold' || command === 'all') out.hold = holdCensus(chats);
  if (command === 'drift' || command === 'all') out.drift = driftCensus(chats, readCardExamples(root));
  console.log(JSON.stringify(out, null, 1));
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
