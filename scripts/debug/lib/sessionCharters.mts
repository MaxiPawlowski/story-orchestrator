export const CARD_FORMAT = 1;
export const TIERS = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
export type Tier = (typeof TIERS)[number];

export const WHERE = ['chat', 'HUD', 'Overview', 'Memory tab', 'timeline', 'inspector', 'author panel', 'settings panel', 'Studio', 'wizard', 'popup', 'toast', 'drawer'] as const;
export const RUBRIC_SCORES = ['works', 'annoying', 'broken', 'not-noticed'] as const;
export const STORY_KINDS = ['adolion', 'wizard', 'example'] as const;
export const JUDGE_USES = [
  'director', 'memoryVerify', 'memoryPairs', 'sceneTrigger', 'sceneTracker', 'lookahead', 'loreSelect', 'curatorFilter', 'typedExtraction',
  'stallCheck', 'expansionCritic', 'expansionLookahead', 'agencyCheck', 'houseRules', 'loreExclusive', 'expressions',
] as const;
export const SETTING_KEYS = ['judge', 'inlineLevel', 'images', 'sprites', 'innerHarvest', 'innerBeat', 'chapters', 'curator', 'announceTransitions', 'viewport', 'raw'] as const;
export const USER_REVIEW = 'recorded for the user\'s review';
export const CHAPTER_KEYS = ['seal', 'storySoFar', 'fold', 'recap'] as const;
export const FEATURE_KEYS = ['chapters', 'chapterAssignments', 'drives', 'motives', 'memberGuidance', 'omniscient'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export const ARTIFACT_KEYS = ['turns', 'flags', 'shots', 'chats', 'chapterRecords', 'foldedTurns', 'harvestedReasoning', 'ratingCandidates', 'wizardDrafts'] as const;
export type ArtifactKey = (typeof ARTIFACT_KEYS)[number];
export const MEDIA_KINDS = ['images', 'sprites'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const BLIND_GATES = ['C3', 'R4', 'Q-M', 'W6'] as const;
export type BlindGate = (typeof BLIND_GATES)[number];
export const UNEXERCISED = 'unexercised: the no-media variant ran (never counted green)';

export interface StoryIndexEntry {
  title: string;
  group: string | null;
  start: string;
  checkpoints: Array<{ id: string; name: string }>;
  edges: Array<[string, string]>;
  qualities: string[];
  roster: string[];
  features?: Record<FeatureKey, number>;
}

export interface StoryIndex {
  commit: string;
  stories: Record<string, StoryIndexEntry>;
  examples: Record<string, StoryIndexEntry & { path: string }>;
}

export interface CardSettings {
  judge?: 'defaults' | 'off' | Record<string, boolean>;
  inlineLevel?: number;
  images?: boolean;
  sprites?: boolean;
  innerHarvest?: boolean;
  innerBeat?: boolean;
  chapters?: Partial<Record<(typeof CHAPTER_KEYS)[number], boolean>>;
  curator?: { enabled?: boolean; acceptMode?: 'review' | 'auto' | 'off' };
  announceTransitions?: boolean;
  viewport?: string;
  raw?: Record<string, unknown>;
}

export interface DriveBeat { title: string; aim: string[]; why?: string; lines: string[] }
export interface LookFor { what: string; where: string }
export interface RubricRow { feature: string; ask?: string; reviewer?: 'user'; media?: MediaKind; gate?: BlindGate }
export interface CardRequires { features?: FeatureKey[]; artifacts?: Partial<Record<ArtifactKey, number>> }

export interface Card {
  id: string;
  tier: Tier;
  title: string;
  question: string;
  story: { kind: (typeof STORY_KINDS)[number]; id?: string; premise?: string; premiseId?: string };
  setup: {
    mode: 'player' | 'author';
    persona: string;
    chat: 'fresh' | 'continue';
    continues?: string;
    select?: 'auto' | 'manual';
    startAt?: string;
    seed?: Record<string, string | number | boolean>;
    chats?: number;
    also?: string;
    settings?: CardSettings;
    notes?: string[];
  };
  drive: DriveBeat[];
  lookFor: LookFor[];
  mustNotHappen: string[];
  provocations: string[];
  flagWhen: string[];
  stopWhen: string;
  rubric: RubricRow[];
  loggedAutomatically: string[];
  knownLimits: string[];
  waits?: string;
  requires?: CardRequires;
}

export interface CardDoc { version: number; pin: string; cards: Card[] }

const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const stringList = (value: unknown, min = 1) => Array.isArray(value) && value.length >= min && value.every(nonEmptyString);

export const tierOf = (id: string): Tier | null => {
  const match = /^(T[0-7])(?:-\d+)?$/.exec(id);
  return match ? match[1] as Tier : null;
};

export const storyEntry = (card: Card, index: StoryIndex): StoryIndexEntry | null => {
  if (card.story.kind === 'adolion') return index.stories[card.story.id ?? ''] ?? null;
  if (card.story.kind === 'example') return index.examples[card.story.id ?? ''] ?? null;
  return null;
};

function settingsProblems(where: string, settings: unknown, mode: string): string[] {
  if (settings === undefined) return [];
  if (!isRecord(settings)) return [`${where}: settings must be an object`];
  const problems: string[] = [];
  for (const key of Object.keys(settings)) if (!(SETTING_KEYS as readonly string[]).includes(key)) problems.push(`${where}: unknown setting "${key}" (known: ${SETTING_KEYS.join(', ')})`);
  const judge = settings.judge;
  if (judge !== undefined && judge !== 'defaults' && judge !== 'off') {
    if (!isRecord(judge)) problems.push(`${where}: judge must be "defaults", "off" or a map of use -> boolean`);
    else for (const [use, on] of Object.entries(judge)) {
      if (!(JUDGE_USES as readonly string[]).includes(use)) problems.push(`${where}: unknown judge use "${use}"`);
      if (typeof on !== 'boolean') problems.push(`${where}: judge.${use} must be boolean`);
    }
  }
  if (settings.inlineLevel !== undefined) {
    if (![0, 1, 2, 3, 4].includes(settings.inlineLevel)) problems.push(`${where}: inlineLevel must be 0..4`);
    else if (settings.inlineLevel > 2 && mode !== 'author') problems.push(`${where}: inlineLevel ${settings.inlineLevel} needs author mode (player view caps at 2)`);
  }
  for (const key of ['images', 'sprites', 'innerHarvest', 'innerBeat', 'announceTransitions']) {
    if (settings[key] !== undefined && typeof settings[key] !== 'boolean') problems.push(`${where}: ${key} must be boolean`);
  }
  if (settings.chapters !== undefined) {
    if (!isRecord(settings.chapters)) problems.push(`${where}: chapters must be an object`);
    else for (const [key, value] of Object.entries(settings.chapters)) {
      if (!(CHAPTER_KEYS as readonly string[]).includes(key)) problems.push(`${where}: unknown chapters key "${key}"`);
      if (typeof value !== 'boolean') problems.push(`${where}: chapters.${key} must be boolean`);
    }
  }
  if (settings.curator !== undefined) {
    if (!isRecord(settings.curator)) problems.push(`${where}: curator must be an object`);
    else if (settings.curator.acceptMode !== undefined && !['review', 'auto', 'off'].includes(settings.curator.acceptMode)) problems.push(`${where}: curator.acceptMode must be review|auto|off`);
  }
  if (settings.viewport !== undefined && !/^\d{3,4}x\d{3,4}$/.test(String(settings.viewport))) problems.push(`${where}: viewport must look like 390x844`);
  if (settings.raw !== undefined && !isRecord(settings.raw)) problems.push(`${where}: raw must be an object`);
  return problems;
}

export interface Premise { id: string; text: string }

function requiresProblems(where: string, requires: unknown): string[] {
  if (requires === undefined) return [];
  if (!isRecord(requires)) return [`${where}: requires must be an object`];
  const problems: string[] = [];
  for (const key of Object.keys(requires)) if (!['features', 'artifacts'].includes(key)) problems.push(`${where}: unknown requires key "${key}"`);
  if (requires.features !== undefined) {
    if (!Array.isArray(requires.features)) problems.push(`${where}: requires.features must be a list`);
    else for (const feature of requires.features) if (!(FEATURE_KEYS as readonly string[]).includes(feature)) problems.push(`${where}: unknown feature "${String(feature)}" (known: ${FEATURE_KEYS.join(', ')})`);
  }
  if (requires.artifacts !== undefined) {
    if (!isRecord(requires.artifacts)) problems.push(`${where}: requires.artifacts must be an object`);
    else for (const [key, count] of Object.entries(requires.artifacts)) {
      if (!(ARTIFACT_KEYS as readonly string[]).includes(key)) problems.push(`${where}: unknown artifact "${key}" (known: ${ARTIFACT_KEYS.join(', ')})`);
      if (!Number.isInteger(count) || (count as number) < 1) problems.push(`${where}: requires.artifacts.${key} must be a positive integer`);
    }
  }
  return problems;
}

export function validateCardDoc(doc: unknown, index: StoryIndex, premises: Premise[] | null = null): string[] {
  if (!isRecord(doc)) return ['the charter file is not an object'];
  const problems: string[] = [];
  if (doc.version !== CARD_FORMAT) problems.push(`version must be ${CARD_FORMAT}`);
  if (doc.pin !== index.commit) problems.push(`pin ${String(doc.pin)} is not the story index commit ${index.commit}`);
  if (!Array.isArray(doc.cards) || !doc.cards.length) return [...problems, 'cards must be a non-empty array'];
  const seen = new Map<string, Card>();
  for (const [position, raw] of (doc.cards as unknown[]).entries()) {
    const card = raw as Card;
    const where = isRecord(card) && nonEmptyString(card.id) ? card.id : `cards[${position}]`;
    if (!isRecord(card)) { problems.push(`${where}: not an object`); continue; }
    const tier = tierOf(String(card.id));
    if (!tier) problems.push(`${where}: id must look like T1-2 (or T7)`);
    else if (card.tier !== tier) problems.push(`${where}: tier ${String(card.tier)} does not match its id`);
    if (seen.has(card.id)) problems.push(`${where}: duplicate id`);
    for (const key of ['title', 'question', 'stopWhen'] as const) if (!nonEmptyString(card[key])) problems.push(`${where}: ${key} is required`);
    for (const key of ['mustNotHappen', 'flagWhen', 'loggedAutomatically', 'knownLimits'] as const) {
      if (!stringList(card[key])) problems.push(`${where}: ${key} needs at least one item`);
    }
    if (!stringList(card.provocations, 0)) problems.push(`${where}: provocations must be a list of strings`);
    if (!isRecord(card.story) || !(STORY_KINDS as readonly string[]).includes(card.story.kind)) { problems.push(`${where}: story.kind must be ${STORY_KINDS.join('|')}`); seen.set(card.id, card); continue; }
    const entry = storyEntry(card, index);
    if (card.story.kind !== 'wizard' && !entry) problems.push(`${where}: story "${String(card.story.id)}" is not in the pinned ${card.story.kind === 'adolion' ? 'Adolion build' : 'examples'}`);
    if (card.story.kind === 'wizard' && card.story.id !== undefined) problems.push(`${where}: a wizard story has no id until the wizard makes it`);
    if (card.story.premiseId !== undefined && premises) {
      const premise = premises.find((candidate) => candidate.id === card.story.premiseId);
      if (!premise) problems.push(`${where}: premise "${card.story.premiseId}" is not in test/measurements/11/premises.json`);
      else if (card.story.premise !== premise.text) problems.push(`${where}: story.premise must be the text of premise "${premise.id}" verbatim`);
    }
    if (card.waits !== undefined && !nonEmptyString(card.waits)) problems.push(`${where}: waits must say what the card waits on`);
    const setup = card.setup;
    if (!isRecord(setup)) problems.push(`${where}: setup is required`);
    else {
      if (!['player', 'author'].includes(setup.mode)) problems.push(`${where}: setup.mode must be player|author`);
      if (!nonEmptyString(setup.persona)) problems.push(`${where}: setup.persona is required`);
      if (!['fresh', 'continue'].includes(setup.chat)) problems.push(`${where}: setup.chat must be fresh|continue`);
      if (setup.chat === 'continue') {
        const previous = setup.continues ? seen.get(setup.continues) : undefined;
        if (!previous) problems.push(`${where}: setup.continues must name an earlier card`);
        else if (previous.story.kind !== card.story.kind || previous.story.id !== card.story.id) problems.push(`${where}: continues ${setup.continues}, which plays another story`);
      } else if (setup.continues !== undefined) problems.push(`${where}: setup.continues needs chat "continue"`);
      if (setup.select !== undefined && !['auto', 'manual'].includes(setup.select)) problems.push(`${where}: setup.select must be auto|manual`);
      if (setup.startAt !== undefined && !entry?.checkpoints.some((checkpoint) => checkpoint.id === setup.startAt)) problems.push(`${where}: setup.startAt "${setup.startAt}" is not a checkpoint of its story`);
      if (setup.seed !== undefined) {
        if (!isRecord(setup.seed)) problems.push(`${where}: setup.seed must be an object`);
        else for (const key of Object.keys(setup.seed)) if (!entry?.qualities.includes(key)) problems.push(`${where}: setup.seed "${key}" is not a quality of its story`);
      }
      if (setup.chats !== undefined && ![1, 2].includes(setup.chats)) problems.push(`${where}: setup.chats must be 1 or 2`);
      if (setup.also !== undefined && !index.stories[setup.also]) problems.push(`${where}: setup.also "${setup.also}" is not in the pinned Adolion build`);
      if (setup.notes !== undefined && !stringList(setup.notes, 0)) problems.push(`${where}: setup.notes must be strings`);
      problems.push(...settingsProblems(where, setup.settings, setup.mode));
    }
    if (!Array.isArray(card.drive) || !card.drive.length) problems.push(`${where}: drive needs at least one beat`);
    else card.drive.forEach((beat, at) => {
      const label = `${where} drive[${at}]`;
      if (!isRecord(beat)) { problems.push(`${label}: not an object`); return; }
      if (!nonEmptyString(beat.title)) problems.push(`${label}: title is required`);
      if (!Array.isArray(beat.lines) || beat.lines.length < 1 || beat.lines.length > 2 || !beat.lines.every(nonEmptyString)) problems.push(`${label}: 1-2 sample lines`);
      if (!Array.isArray(beat.aim)) problems.push(`${label}: aim must be a list of checkpoint ids`);
      else if (card.story.kind === 'wizard') { if (beat.aim.length) problems.push(`${label}: a wizard story has no checkpoint ids yet`); }
      else if (!beat.aim.length) problems.push(`${label}: aim names no checkpoint`);
      else for (const id of beat.aim) if (!entry?.checkpoints.some((checkpoint) => checkpoint.id === id)) problems.push(`${label}: checkpoint "${id}" is not in ${String(card.story.id)}`);
    });
    if (!Array.isArray(card.lookFor) || !card.lookFor.length) problems.push(`${where}: lookFor needs at least one item`);
    else card.lookFor.forEach((item, at) => {
      if (!isRecord(item) || !nonEmptyString(item.what)) problems.push(`${where} lookFor[${at}]: what is required`);
      else if (!(WHERE as readonly string[]).includes(item.where)) problems.push(`${where} lookFor[${at}]: where must be one of ${WHERE.join(', ')}`);
    });
    if (!Array.isArray(card.rubric) || !card.rubric.length) problems.push(`${where}: rubric needs at least one row`);
    else card.rubric.forEach((row, at) => {
      if (!isRecord(row) || !nonEmptyString(row.feature)) problems.push(`${where} rubric[${at}]: feature is required`);
      else {
        if (row.reviewer !== undefined && row.reviewer !== 'user') problems.push(`${where} rubric[${at}]: reviewer may only be "user"`);
        if (row.media !== undefined && !(MEDIA_KINDS as readonly string[]).includes(row.media)) problems.push(`${where} rubric[${at}]: media must be ${MEDIA_KINDS.join('|')}`);
        else if (row.media !== undefined && !card.setup?.settings?.[row.media]) problems.push(`${where} rubric[${at}]: a ${row.media} row needs the card to ask for ${row.media}`);
        if (row.gate !== undefined && !(BLIND_GATES as readonly string[]).includes(row.gate)) problems.push(`${where} rubric[${at}]: gate must be ${BLIND_GATES.join('|')}`);
        else if (row.gate !== undefined && row.reviewer !== 'user') problems.push(`${where} rubric[${at}]: blind gate ${row.gate} is the user's verdict, so the row needs reviewer "user"`);
      }
    });
    problems.push(...requiresProblems(where, card.requires));
    seen.set(card.id, card);
  }
  return problems;
}

export function coverageProblems(doc: CardDoc, index: StoryIndex, tierCounts: Partial<Record<Tier, number>>): string[] {
  const problems: string[] = [];
  const played = new Set(doc.cards.filter((card) => card.story.kind === 'adolion').flatMap((card) => [card.story.id, card.setup.also].filter(Boolean)));
  for (const id of Object.keys(index.stories)) if (!played.has(id)) problems.push(`no card plays ${id}`);
  for (const tier of TIERS) {
    const count = doc.cards.filter((card) => card.tier === tier).length;
    if (tierCounts[tier] !== undefined && count !== tierCounts[tier]) problems.push(`${tier} has ${count} card(s), plan 14 lists ${tierCounts[tier]}`);
  }
  return problems;
}

export const needsComfy = (card: Card) => Boolean(card.setup.settings?.images || card.setup.settings?.sprites);

export const comfyRefusal = (card: Card, allowComfy: boolean, media: 'on' | 'off' = 'on'): string | null => (media === 'on' && needsComfy(card) && !allowComfy
  ? `${card.id} switches on ${[card.setup.settings?.images ? 'images' : null, card.setup.settings?.sprites ? 'sprites' : null].filter(Boolean).join(' and ')}, which render on the shared ComfyUI at 127.0.0.1:8188. `
    + 'Confirm nobody else is rendering there (another session\'s sprite or image run), then start again with --allow-comfy. Nothing was seeded or started.'
  : null);

const deepMerge = (base: Record<string, any>, patch: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = isRecord(value) && isRecord(base[key]) ? deepMerge(base[key], value) : value;
  return out;
};

export function settingsPatch(settings: CardSettings = {}): Record<string, any> {
  const patch: Record<string, any> = {
    image: { enabled: settings.images === true },
    sprites: { enabled: settings.sprites === true, explicit: true },
  };
  if (settings.judge === 'off') patch.judge = { enabled: false, uses: Object.fromEntries(JUDGE_USES.map((use) => [use, false])) };
  else if (settings.judge === 'defaults') patch.judge = { enabled: true, uses: Object.fromEntries(JUDGE_USES.map((use) => [use, true])) };
  else if (isRecord(settings.judge)) patch.judge = { uses: { ...settings.judge } };
  if (settings.inlineLevel !== undefined) patch.display = { ...(patch.display ?? {}), inline: { level: settings.inlineLevel } };
  if (settings.announceTransitions !== undefined) patch.display = { ...(patch.display ?? {}), announceTransitions: settings.announceTransitions };
  if (settings.innerHarvest !== undefined) patch.memory = { ...(patch.memory ?? {}), harvestReasoning: settings.innerHarvest };
  if (settings.innerBeat !== undefined) patch.memory = { ...(patch.memory ?? {}), innerBeat: settings.innerBeat };
  if (settings.chapters) patch.memory = { ...(patch.memory ?? {}), chapters: { ...settings.chapters } };
  if (settings.curator) patch.stagecraft = {
    ...(settings.curator.enabled !== undefined ? { curatorEnabled: settings.curator.enabled } : {}),
    ...(settings.curator.acceptMode ? { acceptMode: settings.curator.acceptMode } : {}),
  };
  return settings.raw ? deepMerge(patch, settings.raw) : patch;
}

export const mergeSettings = (current: unknown, patch: Record<string, any>) => deepMerge(isRecord(current) ? current : {}, patch);

export function rubricTemplate(card: Card, session: Record<string, unknown> = {}, unexercised: readonly MediaKind[] = []) {
  return {
    charter: card.id,
    title: card.title,
    session,
    scores: [...RUBRIC_SCORES],
    rows: card.rubric.map((row) => ({
      feature: row.feature,
      ...(row.ask ? { ask: row.ask } : {}),
      ...(row.gate ? { gate: row.gate } : {}),
      ...(row.media ? { media: row.media } : {}),
      ...(row.reviewer ? { reviewer: row.reviewer, status: USER_REVIEW } : {}),
      ...(row.media && unexercised.includes(row.media) ? { status: UNEXERCISED } : {}),
      score: null as string | null,
      note: '',
      evidence: [] as string[],
      scoredBy: null as string | null,
    })),
    playerClean: null as unknown,
  };
}

export function rubricProblems(rubric: unknown): string[] {
  if (!isRecord(rubric) || !Array.isArray(rubric.rows)) return ['rubric has no rows'];
  return rubric.rows.flatMap((row: any, at: number) => {
    const label = `row ${at} (${row.feature})`;
    const evidence = Array.isArray(row.evidence) ? row.evidence : [];
    if (row.status === UNEXERCISED) return row.score !== null && row.score !== undefined ? [`${label} is ${UNEXERCISED}: it may carry no score`] : [];
    if (row.reviewer === 'user') {
      if (row.score !== null && row.score !== undefined) return [`${label} is ${USER_REVIEW}: it carries no score from ${row.scoredBy ?? 'anyone'}`];
      if (!nonEmptyString(row.note) || !evidence.length) return [`${label} is ${USER_REVIEW} but nothing was recorded (note and evidence)`];
      return [];
    }
    if (row.score === null || row.score === undefined) return [`${label} is unscored`];
    if (!(RUBRIC_SCORES as readonly string[]).includes(row.score)) return [`${label} has score "${row.score}"`];
    const problems: string[] = [];
    if (!nonEmptyString(row.note)) problems.push(`${label} has no note`);
    if (!evidence.length) problems.push(`${label} cites no evidence`);
    if (!nonEmptyString(row.scoredBy)) problems.push(`${label} does not say who scored it`);
    return problems;
  });
}

export function rubricSummary(rubric: unknown) {
  const rows: any[] = isRecord(rubric) && Array.isArray(rubric.rows) ? rubric.rows : [];
  const live = rows.filter((row) => row.status !== UNEXERCISED);
  const scored = (score: string) => live.filter((row) => row.reviewer !== 'user' && row.score === score).length;
  return {
    rows: rows.length,
    green: scored('works'),
    annoying: scored('annoying'),
    broken: scored('broken'),
    notNoticed: scored('not-noticed'),
    unexercised: rows.length - live.length,
    userReview: live.filter((row) => row.reviewer === 'user').length,
    open: rubricProblems(rubric).length,
  };
}

const checkpointLabel = (entry: StoryIndexEntry | null, id: string) => {
  const name = entry?.checkpoints.find((checkpoint) => checkpoint.id === id)?.name;
  return name ? `${name} \`${id}\`` : `\`${id}\``;
};

const settingsText = (settings: CardSettings = {}) => {
  const parts: string[] = [];
  if (settings.judge === 'off') parts.push('judge fully off');
  else if (settings.judge === 'defaults') parts.push('every judge use on');
  else if (isRecord(settings.judge)) parts.push(`judge: ${Object.entries(settings.judge).map(([use, on]) => `${use} ${on ? 'on' : 'off'}`).join(', ')}`);
  if (settings.inlineLevel !== undefined) parts.push(`timeline level ${settings.inlineLevel}`);
  parts.push(`images ${settings.images ? 'ON' : 'off'}`, `sprites ${settings.sprites ? 'ON' : 'off'}`);
  if (settings.innerHarvest !== undefined) parts.push(`inner voice harvest (#so-inner-harvest) ${settings.innerHarvest ? 'on' : 'off'}`);
  if (settings.innerBeat !== undefined) parts.push(`inner voice beat (#so-inner-beat) ${settings.innerBeat ? 'on' : 'off'}`);
  if (settings.chapters) parts.push(`chapters: ${Object.entries(settings.chapters).map(([key, on]) => `${key} ${on ? 'on' : 'off'}`).join(', ')}`);
  if (settings.curator) parts.push(`curator ${settings.curator.enabled === false ? 'off' : 'on'}${settings.curator.acceptMode ? ` (${settings.curator.acceptMode})` : ''}`);
  if (settings.announceTransitions !== undefined) parts.push(`chat note on transitions ${settings.announceTransitions ? 'on' : 'off'}`);
  if (settings.viewport) parts.push(`viewport ${settings.viewport}`);
  if (settings.raw) parts.push(`raw settings ${JSON.stringify(settings.raw)}`);
  return parts.join('; ');
};

const storyText = (card: Card, index: StoryIndex) => {
  if (card.story.kind === 'wizard') return `a new story from the wizard${card.story.premise ? `: "${card.story.premise}"` : ''}${card.story.premiseId ? ` (premise \`${card.story.premiseId}\`)` : ''}`;
  const entry = storyEntry(card, index);
  return `\`${card.story.id}\`${entry ? ` (${entry.title})` : ''}`;
};

export function renderCard(card: Card, index: StoryIndex): string {
  const entry = storyEntry(card, index);
  const setup = card.setup;
  const lines: string[] = [`### ${card.id} ${card.title}`, ''];
  if (card.waits) lines.push(`> **Waits:** ${card.waits}`, '');
  lines.push(`- **Question:** ${card.question}`, '- **Setup:**');
  lines.push(`  - Story: ${storyText(card, index)}; ${setup.chat === 'continue' ? `continues the ${setup.continues} chat` : `fresh chat${setup.chats === 2 ? ' (two of them)' : ''}`}; ${setup.mode} mode.`);
  if (setup.also) lines.push(`  - Also open: a fresh \`${setup.also}\` chat (${index.stories[setup.also]?.title ?? ''}).`);
  lines.push(`  - Persona: ${setup.persona}`);
  if (setup.select === 'manual') lines.push('  - The story is NOT pre-selected: pick it yourself from the entry points.');
  if (setup.startAt) lines.push(`  - Starts at ${checkpointLabel(entry, setup.startAt)}${entry && setup.startAt !== entry.start ? ', seeded by `so-session start`' : ''}.`);
  if (setup.seed && Object.keys(setup.seed).length) lines.push(`  - Seeded: ${Object.entries(setup.seed).map(([key, value]) => `\`${key}\` = ${JSON.stringify(value)}`).join(', ')}.`);
  lines.push(`  - Settings: ${settingsText(setup.settings)}.`);
  for (const note of setup.notes ?? []) lines.push(`  - ${note}`);
  lines.push('- **Drive:**');
  card.drive.forEach((beat, at) => {
    const aim = beat.aim.length ? `, aims at ${beat.aim.map((id) => checkpointLabel(entry, id)).join(' or ')}` : '';
    lines.push(`  ${at + 1}. **${beat.title}**${aim}.${beat.why ? ` ${beat.why}` : ''}`);
    for (const line of beat.lines) lines.push(`     - Sample line: "${line}"`);
  });
  lines.push('- **Look for:**', ...card.lookFor.map((item) => `  - ${item.what} *(${item.where})*`));
  lines.push('- **Must not happen** (press the flag at once):', ...card.mustNotHappen.map((item) => `  - ${item}`));
  lines.push('- **Provocations:**', ...(card.provocations.length ? card.provocations.map((item) => `  - ${item}`) : ['  - none for this session']));
  lines.push('- **Flag when:**', ...card.flagWhen.map((item) => `  - ${item}`));
  lines.push(`- **Stop when:** ${card.stopWhen}`);
  lines.push('- **Rubric** (score each works / annoying / broken / not noticed, with a note and evidence):', ...card.rubric.map((row) => `  - ${row.feature}${row.ask ? `: ${row.ask}` : ''}${row.gate ? ` [blind gate ${row.gate}: paired, shuffled, unlabelled artifacts go to test/sessions/rating-pack/; the gate stays pending until the user rates them]` : ''}${row.reviewer === 'user' ? ` (${USER_REVIEW}, not decided by Claude)` : ''}${row.media ? ` (${row.media}: unexercised in the no-media variant, never counted green)` : ''}`));
  if (card.requires?.features?.length) lines.push(`- **Story data required:** ${card.requires.features.join(', ')} (preflight refuses the start when the pinned build lacks it).`);
  if (card.requires?.artifacts && Object.keys(card.requires.artifacts).length) lines.push(`- **Artifacts required at stop:** ${Object.entries(card.requires.artifacts).map(([key, count]) => `${key} >= ${count}`).join(', ')}.`);
  lines.push('- **Logged automatically:**', ...card.loggedAutomatically.map((item) => `  - ${item}`));
  lines.push('- **Known limits:**', ...card.knownLimits.map((item) => `  - ${item}`));
  return lines.join('\n');
}

export const CARDS_HEADER = '<!-- Generated from test/sessions/charters.json by `node scripts/debug/so-session.mts cards --write`. Do not edit by hand. -->';

export function renderCardsDocument(doc: CardDoc, index: StoryIndex): string {
  const out = [CARDS_HEADER, '', '# Plan 14 charter cards', '', `Pinned Adolion build \`${doc.pin}\`. ${doc.cards.length} cards. Start one with \`node scripts/debug/so-session.mts start <id> --lane <n>\`.`, ''];
  for (const tier of TIERS) {
    const cards = doc.cards.filter((card) => card.tier === tier);
    if (!cards.length) continue;
    out.push(`## ${tier}`, '');
    for (const card of cards) out.push(renderCard(card, index), '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

export function nextSessionNumber(existing: string[], id: string): number {
  const numbers = existing.map((name) => new RegExp(`^${id.replace(/[-]/g, '\\-')}-(\\d+)$`).exec(name)).filter(Boolean).map((match) => Number(match![1]));
  return (numbers.length ? Math.max(...numbers) : 0) + 1;
}
