export interface VoiceParty {
  id: string;
  names: readonly string[];
  player?: boolean;
}

export type CrossVoiceKind = "header" | "said";

export interface CrossVoiceHit {
  kind: CrossVoiceKind;
  party: string;
  player: boolean;
  at: number;
}

export interface CrossVoiceTrim {
  text: string;
  hit: CrossVoiceHit;
  removed: number;
}

export const CROSS_VOICE_MIN_KEPT = 40;

const SPEECH_VERBS = ["said|says|asked|asks|replied|replies|answered|answers|whispered|whispers|muttered|mutters|murmured|murmurs|called|calls",
  "shouted|shouts|added|adds|snapped|snaps|growled|growls|laughed|laughs|sighed|sighs|continued|continues|offered|offers|insisted|insists|retorted|retorts"].join("|");

const TITLES = new Set(["the", "and", "von", "van", "del", "der", "des", "sir", "lord", "lady", "dame", "captain", "king", "queen", "prince", "princess",
  "master", "mistress", "father", "mother", "brother", "sister", "doctor", "miss", "mrs", "old", "young", "saint", "elder"]);

const givenName = (word: string) => /^\p{Lu}[\p{L}'-]{2,}$/u.test(word) && !TITLES.has(word.toLowerCase());

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const partyNames = (name: string, aliases: readonly string[] = []): string[] => {
  const full = name.trim();
  const words = full.split(/\s+/).filter(givenName);
  return [...new Set([full, ...aliases.map((alias) => alias.trim()), ...words].filter((value) => value.length >= 2))];
};

interface Compiled {
  party: VoiceParty;
  header: RegExp;
  quoted: RegExp;
  leading: RegExp;
}

const alternation = (names: readonly string[]) => [...names].sort((a, b) => b.length - a.length).map((name) => escapePattern(name).replace(/ /g, "\\s+")).join("|");

const compile = (party: VoiceParty, self: ReadonlySet<string>): Compiled | null => {
  const names = party.names.filter((name) => !self.has(name.toLowerCase()));
  if (!names.length) return null;
  const who = `(?:${alternation(names)})`;
  return {
    party,
    header: new RegExp(`^[ \\t>*_~\\[(]*${who}(?![\\p{L}\\p{N}])[ \\t*_\\])]*:(?!\\/)`, "mu"),
    quoted: new RegExp(`[,.!?\\u2026\\u2014\\u2013-][*_]*["\\u201D][*_]*[ \\t]+${who}[ \\t]+(?:${SPEECH_VERBS})(?![\\p{L}])`, "u"),
    leading: new RegExp(`(?<![\\p{L}\\p{N}])${who}[ \\t]+(?:${SPEECH_VERBS})[,:]?[ \\t]*[*_]*["\\u201C]`, "u"),
  };
};

const compileAll = (self: readonly string[], others: readonly VoiceParty[]): Compiled[] => {
  const own = new Set(self.flatMap((name) => partyNames(name)).map((name) => name.toLowerCase()));
  return others.map((party) => compile(party, own)).filter((entry): entry is Compiled => entry !== null);
};

const firstMatch = (pattern: RegExp, text: string): number => {
  const match = pattern.exec(text);
  return match ? match.index : -1;
};

export const crossVoiceHits = (text: string, self: readonly string[], others: readonly VoiceParty[]): CrossVoiceHit[] => {
  const plain = text.replace(/\r\n/g, "\n");
  const hits: CrossVoiceHit[] = [];
  for (const entry of compileAll(self, others)) {
    const header = firstMatch(entry.header, plain);
    if (header >= 0) hits.push({ kind: "header", party: entry.party.id, player: entry.party.player === true, at: header });
    const said = [firstMatch(entry.quoted, plain), firstMatch(entry.leading, plain)].filter((at) => at >= 0);
    if (said.length) hits.push({ kind: "said", party: entry.party.id, player: entry.party.player === true, at: Math.min(...said) });
  }
  return hits.sort((a, b) => a.at - b.at);
};

const lineStart = (text: string, at: number) => {
  const start = text.lastIndexOf("\n", at - 1);
  return start < 0 ? 0 : start + 1;
};

export const trimCrossVoice = (text: string, self: readonly string[], others: readonly VoiceParty[], minKept: number = CROSS_VOICE_MIN_KEPT): CrossVoiceTrim | null => {
  const plain = text.replace(/\r\n/g, "\n");
  const hit = crossVoiceHits(plain, self, others).find((entry) => entry.kind === "header");
  if (!hit) return null;
  const kept = plain.slice(0, lineStart(plain, hit.at)).trimEnd();
  if (kept.replace(/[\s*_~>"“”]/g, "").length < minKept) return null;
  return { text: kept, hit, removed: plain.length - kept.length };
};
