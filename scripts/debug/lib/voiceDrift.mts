export type Profile = Map<string, number>;

export const DRIFT_BUCKETS = [
  { id: '1-10', from: 1, to: 10 },
  { id: '11-30', from: 11, to: 30 },
  { id: '31-60', from: 31, to: 60 },
  { id: '61+', from: 61, to: Infinity },
] as const;

export type BucketId = (typeof DRIFT_BUCKETS)[number]['id'];

export const DRIFT_FLOORS = { ownLateOverMid: 1.25, betweenLateOverMid: 0.8 } as const;

export const bucketOf = (position: number): BucketId | null => DRIFT_BUCKETS.find((bucket) => position >= bucket.from && position <= bucket.to)?.id ?? null;

export const normaliseVoice = (text: string, names: readonly string[] = []): string => {
  let plain = text.toLowerCase().replace(/<[^>]+>/g, ' ');
  for (const name of names) {
    for (const word of name.toLowerCase().split(/\s+/).filter((part) => part.length >= 2)) {
      plain = plain.split(word).join(' ');
    }
  }
  return plain.replace(/[^\p{L}\p{N}'",.!?*\- ]+/gu, ' ').replace(/\s+/g, ' ').trim();
};

export const trigramProfile = (texts: readonly string[]): Profile => {
  const profile: Profile = new Map();
  for (const text of texts) {
    const padded = ` ${text} `;
    for (let index = 0; index + 3 <= padded.length; index += 1) {
      const gram = padded.slice(index, index + 3);
      profile.set(gram, (profile.get(gram) ?? 0) + 1);
    }
  }
  return profile;
};

export const cosineDistance = (left: Profile, right: Profile): number | null => {
  let dot = 0;
  let a = 0;
  let b = 0;
  for (const [gram, count] of left) {
    a += count * count;
    const other = right.get(gram);
    if (other) dot += count * other;
  }
  for (const count of right.values()) b += count * count;
  if (!a || !b) return null;
  return 1 - dot / Math.sqrt(a * b);
};

export interface DriftReply {
  member: string;
  position: number;
  text: string;
}

export interface MemberDrift {
  member: string;
  replies: number;
  own: Partial<Record<BucketId, number>>;
  card: Partial<Record<BucketId, number>>;
}

export interface ChatDrift {
  members: MemberDrift[];
  between: Partial<Record<BucketId, number>>;
}

const mean = (values: readonly number[]): number | null => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

const round = (value: number) => Number(value.toFixed(4));

export const MIN_BUCKET_REPLIES = 3;

export const chatDrift = (replies: readonly DriftReply[], cards: Readonly<Record<string, string>> = {}, names: readonly string[] = []): ChatDrift => {
  const byMember = new Map<string, DriftReply[]>();
  for (const reply of replies) byMember.set(reply.member, [...(byMember.get(reply.member) ?? []), reply]);
  const profiles = new Map<string, Partial<Record<BucketId, Profile>>>();
  const members: MemberDrift[] = [];
  for (const [member, own] of byMember) {
    const buckets: Partial<Record<BucketId, Profile>> = {};
    for (const bucket of DRIFT_BUCKETS) {
      const texts = own.filter((reply) => bucketOf(reply.position) === bucket.id).map((reply) => normaliseVoice(reply.text, names));
      if (texts.length >= MIN_BUCKET_REPLIES) buckets[bucket.id] = trigramProfile(texts);
    }
    profiles.set(member, buckets);
    const first = buckets['1-10'];
    const card = cards[member] ? trigramProfile([normaliseVoice(cards[member], names)]) : null;
    const ownDistance: Partial<Record<BucketId, number>> = {};
    const cardDistance: Partial<Record<BucketId, number>> = {};
    for (const bucket of DRIFT_BUCKETS) {
      const profile = buckets[bucket.id];
      if (!profile) continue;
      const toFirst = first && bucket.id !== '1-10' ? cosineDistance(profile, first) : null;
      if (toFirst !== null) ownDistance[bucket.id] = round(toFirst);
      const toCard = card ? cosineDistance(profile, card) : null;
      if (toCard !== null) cardDistance[bucket.id] = round(toCard);
    }
    members.push({ member, replies: own.length, own: ownDistance, card: cardDistance });
  }
  const between: Partial<Record<BucketId, number>> = {};
  const names2 = [...profiles.keys()];
  for (const bucket of DRIFT_BUCKETS) {
    const distances: number[] = [];
    for (let i = 0; i < names2.length; i += 1) {
      for (let j = i + 1; j < names2.length; j += 1) {
        const left = profiles.get(names2[i])?.[bucket.id];
        const right = profiles.get(names2[j])?.[bucket.id];
        const distance = left && right ? cosineDistance(left, right) : null;
        if (distance !== null) distances.push(distance);
      }
    }
    const value = mean(distances);
    if (value !== null) between[bucket.id] = round(value);
  }
  return { members: members.sort((a, b) => a.member.localeCompare(b.member)), between };
};

export interface DriftVerdict {
  ownRatio: number | null;
  betweenRatio: number | null;
  ownOk: boolean | null;
  betweenOk: boolean | null;
}

export const driftVerdict = (drifts: readonly ChatDrift[]): DriftVerdict => {
  const ownMid = mean(drifts.flatMap((drift) => drift.members.flatMap((member) => (member.own['61+'] !== undefined && member.own['11-30'] !== undefined ? [member.own['11-30']] : []))));
  const ownLate = mean(drifts.flatMap((drift) => drift.members.flatMap((member) => (member.own['61+'] !== undefined && member.own['11-30'] !== undefined ? [member.own['61+']] : []))));
  const pairs = drifts.filter((drift) => drift.between['61+'] !== undefined && drift.between['11-30'] !== undefined);
  const betweenMid = mean(pairs.map((drift) => drift.between['11-30'] as number));
  const betweenLate = mean(pairs.map((drift) => drift.between['61+'] as number));
  const ownRatio = ownMid && ownLate !== null ? round(ownLate / ownMid) : null;
  const betweenRatio = betweenMid && betweenLate !== null ? round(betweenLate / betweenMid) : null;
  return {
    ownRatio, betweenRatio,
    ownOk: ownRatio === null ? null : ownRatio <= DRIFT_FLOORS.ownLateOverMid,
    betweenOk: betweenRatio === null ? null : betweenRatio >= DRIFT_FLOORS.betweenLateOverMid,
  };
};

export const editDistance = (left: string, right: string, cap = 3): number => {
  if (Math.abs(left.length - right.length) > cap) return cap + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
};

export const NAME_MIN_LENGTH = 4;

export const nameAllowance = (name: string) => (name.length >= 6 ? 2 : 1);

export interface NameVocabulary {
  known: ReadonlySet<string>;
  lowercase: ReadonlySet<string>;
}

const stem = (word: string) => word.replace(/(?:'s|s'|')$/u, '');

export const nameVocabulary = (texts: readonly string[], names: readonly string[], establishedIn: ReadonlyMap<string, number> = new Map(), established = 3): NameVocabulary => {
  const lowercase = new Set<string>();
  for (const text of texts) for (const match of text.matchAll(/(?<![\p{L}])\p{Ll}[\p{L}'-]+/gu)) lowercase.add(match[0]);
  const known = new Set(names.flatMap((name) => name.split(/\s+/)));
  for (const [word, chats] of establishedIn) if (chats >= established) known.add(word);
  return { known, lowercase };
};

export const nameNearMisses = (text: string, names: readonly string[], vocabulary: NameVocabulary = { known: new Set(), lowercase: new Set() }): Array<{ name: string; seen: string }> => {
  const targets = [...new Set(names.flatMap((name) => name.split(/\s+/)).filter((word) => /^\p{Lu}/u.test(word) && word.length >= NAME_MIN_LENGTH))];
  const exact = new Set(targets);
  const out: Array<{ name: string; seen: string }> = [];
  for (const match of text.matchAll(/(?<![\p{L}\p{N}])\p{Lu}[\p{L}'-]{2,}(?![\p{L}\p{N}])/gu)) {
    const word = stem(match[0]);
    const plural = word.replace(/s$/u, '');
    if (exact.has(word) || exact.has(plural) || vocabulary.known.has(word) || vocabulary.lowercase.has(word.toLowerCase())) continue;
    const target = targets.find((name) => {
      const distance = editDistance(word, name, 2);
      return name[0] === word[0] && distance > 0 && distance <= nameAllowance(name);
    });
    if (target) out.push({ name: target, seen: word });
  }
  return out;
};

export const capitalisedChats = (chats: ReadonlyArray<readonly string[]>): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const texts of chats) {
    const seen = new Set<string>();
    for (const text of texts) for (const match of text.matchAll(/(?<![\p{L}\p{N}])\p{Lu}[\p{L}'-]{2,}(?![\p{L}\p{N}])/gu)) seen.add(stem(match[0]));
    for (const word of seen) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
};
