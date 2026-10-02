import { overrideChain, pathGet } from './sessionBaseline.mts';
import { settingsPatch, storyEntry, FEATURE_KEYS, type ArtifactKey, type Card, type CardDoc, type FeatureKey, type StoryIndex } from './sessionCharters.mts';

export const HARVEST_HEADER = "Each character's own private reasoning (evidence ONLY for that same character's [intends] lines; never for anyone else):";
export const COMFY_LINE = /ComfyUI|:8188|\/api\/sd\//i;

const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function storyFeatures(raw: any): Record<FeatureKey, number> {
  const checkpoints: any[] = Array.isArray(raw?.checkpoints) ? raw.checkpoints : [];
  const roster: any[] = Array.isArray(raw?.roster) ? raw.roster : [];
  return {
    chapters: Array.isArray(raw?.chapters) ? raw.chapters.length : 0,
    chapterAssignments: checkpoints.filter((checkpoint) => typeof checkpoint?.chapter === 'string' && checkpoint.chapter).length,
    drives: roster.filter((member) => typeof member?.drive === 'string' && member.drive.trim()).length,
    motives: checkpoints.reduce((sum, checkpoint) => sum + (isRecord(checkpoint?.motives) ? Object.keys(checkpoint.motives).length : 0), 0),
    memberGuidance: checkpoints.filter((checkpoint) => isRecord(checkpoint?.guidance) && isRecord(checkpoint.guidance.members) && Object.keys(checkpoint.guidance.members).length).length,
    omniscient: roster.filter((member) => member?.view === 'omniscient').length,
  };
}

function effectivePatch(doc: CardDoc, card: Card) {
  return overrideChain(doc, card).reduce<Record<string, any>>((merged, step) => {
    const patch = settingsPatch(step.settings);
    return {
      ...merged, ...patch,
      memory: { ...(merged.memory ?? {}), ...(patch.memory ?? {}), chapters: { ...(merged.memory?.chapters ?? {}), ...(patch.memory?.chapters ?? {}) } },
    };
  }, {});
}

export function requiredFeatures(doc: CardDoc, card: Card): FeatureKey[] {
  const patch = effectivePatch(doc, card);
  const wanted = new Set<FeatureKey>(card.requires?.features ?? []);
  if (pathGet(patch, 'memory.chapters.seal') === true || pathGet(patch, 'memory.chapters.fold') === true) { wanted.add('chapters'); wanted.add('chapterAssignments'); }
  if (pathGet(patch, 'memory.innerBeat') === true) { wanted.add('drives'); wanted.add('motives'); }
  return FEATURE_KEYS.filter((key) => wanted.has(key));
}

export function featureProblems(doc: CardDoc, card: Card, index: StoryIndex): string[] {
  if (card.story.kind === 'wizard') return [];
  const entry = storyEntry(card, index);
  const wanted = requiredFeatures(doc, card);
  if (!wanted.length) return [];
  if (!entry) return [`${card.id}: story ${String(card.story.id)} is not in the story index`];
  if (!entry.features) return [`${card.id}: the story index carries no feature data for ${card.story.id}; rebuild it from the pin (so-session index)`];
  return wanted.filter((key) => !(entry.features![key] > 0)).map((key) => `${card.id}: ${card.story.id} at pin ${index.commit.slice(0, 10)} has no ${key}, which this card exercises`);
}

export function requiredArtifacts(doc: CardDoc, card: Card): Partial<Record<ArtifactKey, number>> {
  const patch = effectivePatch(doc, card);
  const out: Partial<Record<ArtifactKey, number>> = {};
  const need = (key: ArtifactKey, count: number) => { out[key] = Math.max(out[key] ?? 0, count); };
  if (card.story.kind === 'wizard') need('wizardDrafts', 1);
  else {
    need('turns', 1);
    need('chats', (card.setup.chats ?? 1) + (card.setup.also ? 1 : 0));
  }
  if (pathGet(patch, 'memory.chapters.seal') === true) need('chapterRecords', 1);
  if (pathGet(patch, 'memory.chapters.fold') === true) need('foldedTurns', 1);
  if (pathGet(patch, 'memory.harvestReasoning') === true) need('harvestedReasoning', 1);
  if (card.rubric.some((row) => row.gate)) need('ratingCandidates', 1);
  for (const [key, count] of Object.entries(card.requires?.artifacts ?? {})) need(key as ArtifactKey, Number(count));
  return out;
}

export const HARVEST_WAIVED = 'required artifact harvestedReasoning: not applicable: the model produced no reasoning (thinking off in the instruct/overlay)';

const reasoningText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function replyReasoning(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  return messages.filter((message: any) => message && !message.isUser && !message.is_user).reduce((sum: number, message: any) => {
    const own = [message.reasoning, message.extra?.reasoning].some((value) => reasoningText(value));
    const swipes = (Array.isArray(message.swipeInfo) ? message.swipeInfo : Array.isArray(message.swipe_info) ? message.swipe_info : []).filter((info: any) => reasoningText(info?.extra?.reasoning)).length;
    return sum + (own ? 1 : 0) + swipes;
  }, 0);
}

export const THINKING_SILENT = 'the thinking preset overlay ran, but no reply carried reasoning: the prompt opened no thought or ST did not parse it into the reasoning field (check the payload tail, Start Reply With and the reasoning template)';

export function artifactWaivers(required: Partial<Record<ArtifactKey, number>>, evidence: { replyReasoning: number | null; thinking?: boolean }): { required: Partial<Record<ArtifactKey, number>>; warnings: string[]; problems: string[] } {
  if (evidence.thinking) return { required, warnings: [], problems: evidence.replyReasoning === 0 ? [THINKING_SILENT] : [] };
  if (!required.harvestedReasoning || evidence.replyReasoning !== 0) return { required, warnings: [], problems: [] };
  const rest = Object.fromEntries(Object.entries(required).filter(([key]) => key !== 'harvestedReasoning')) as Partial<Record<ArtifactKey, number>>;
  return { required: rest, warnings: [HARVEST_WAIVED], problems: [] };
}

export interface ArtifactInventory extends Record<ArtifactKey, number> {}

export function artifactProblems(required: Partial<Record<ArtifactKey, number>>, inventory: Partial<ArtifactInventory>): string[] {
  return Object.entries(required)
    .filter(([key, count]) => (inventory[key as ArtifactKey] ?? 0) < Number(count))
    .map(([key, count]) => `required artifact ${key}: ${inventory[key as ArtifactKey] ?? 0} captured, the card needs at least ${count}`);
}

export interface InventoryInput {
  turns: any[];
  payloads: any[];
  runtimes: Record<string, any>;
  shots: number;
  wizardDrafts: number;
}

export function chapterRecordsOf(blob: any): number {
  const record = isRecord(blob?.stories) && blob.selectedStoryId ? blob.stories[blob.selectedStoryId] : null;
  const chapters = record?.extras?.memory?.chapters;
  return Array.isArray(chapters) ? chapters.length : 0;
}

export function artifactInventory(input: InventoryInput): ArtifactInventory {
  const ok = (row: any) => row && row.ok !== false;
  const bodies = input.payloads.map((row) => (typeof row?.body === 'string' ? row.body : JSON.stringify(row?.body ?? '')));
  return {
    turns: input.turns.filter((row) => row?.kind === 'turn' && ok(row)).length,
    flags: input.turns.filter((row) => row?.kind === 'flag' && row.landed === true).length,
    shots: input.shots,
    chats: Object.keys(input.runtimes).length,
    chapterRecords: Math.max(0, ...Object.values(input.runtimes).map(chapterRecordsOf)),
    foldedTurns: input.turns.filter((row) => Number(row?.observe?.folded) > 0).length,
    harvestedReasoning: bodies.filter((body) => body.includes(HARVEST_HEADER) || body.includes(JSON.stringify(HARVEST_HEADER).slice(1, -1))).length,
    ratingCandidates: input.turns.filter((row) => typeof row?.arm === 'string' && row.arm && ok(row)).length,
    wizardDrafts: input.wizardDrafts,
  };
}

export function runtimeProblems(chatId: string, blob: unknown, expect: { story: boolean; chapters: boolean }): string[] {
  if (!isRecord(blob)) return expect.story ? [`${chatId}: chat_metadata.story_orchestrator is absent`] : [];
  if (!expect.story && !blob.selectedStoryId) return [];
  const problems: string[] = [];
  const record = isRecord(blob.stories) && typeof blob.selectedStoryId === 'string' ? blob.stories[blob.selectedStoryId] : null;
  if (!record) return [`${chatId}: the persisted runtime has no record for its selected story ${String(blob.selectedStoryId)}`];
  if (!isRecord(record.engineState)) problems.push(`${chatId}: persisted runtime has no engine state`);
  if (!isRecord(record.engineHistory)) problems.push(`${chatId}: persisted runtime has no engine history (rollback equivalence cannot be checked)`);
  if (!isRecord(record.pinnedStory)) problems.push(`${chatId}: persisted runtime has no pinned story`);
  if (!isRecord(record.extras?.effects)) problems.push(`${chatId}: persisted runtime has no effect ledger (extras.effects)`);
  if (expect.chapters && !Array.isArray(record.extras?.memory?.chapters)) problems.push(`${chatId}: persisted runtime has no chapter store (extras.memory.chapters)`);
  return problems;
}

export interface ChatRef { chatId: string; group?: string | null; groupId?: string | null; storyId?: string | null; primary?: boolean; how?: string; deleted?: boolean; deletedAt?: string; lorebook?: unknown }

export function trackChat(chats: ChatRef[], seen: ChatRef | null | undefined, how: string): ChatRef[] {
  if (!seen?.chatId) return chats;
  const existing = chats.find((chat) => chat.chatId === seen.chatId);
  if (existing) return chats.map((chat) => (chat.chatId === seen.chatId ? { ...chat, group: chat.group ?? seen.group ?? null, groupId: chat.groupId ?? seen.groupId ?? null, storyId: seen.storyId ?? chat.storyId ?? null } : chat));
  return [...chats, { chatId: seen.chatId, group: seen.group ?? null, groupId: seen.groupId ?? null, storyId: seen.storyId ?? null, primary: false, how }];
}

export function newChats(before: ChatRef[], after: ChatRef[]): ChatRef[] {
  const known = new Set(before.map((chat) => chat.chatId));
  return after.filter((chat) => !known.has(chat.chatId));
}

export const comfyCalls = (log: string) => log.split(/\r?\n/).filter((line) => COMFY_LINE.test(line));
