import { castCardName } from "./castNames";

export interface KeyLabelSource {
  qualities?: ReadonlyArray<{ key: string; display?: { label?: string } }>;
  qualityByKey?: Readonly<Record<string, { display?: { label?: string } } | undefined>>;
  roster?: ReadonlyArray<{ id: string; name?: string }>;
  factions?: ReadonlyArray<{ id: string; name?: string }>;
}

const PLAYER = "player";
const TIME_LABELS: Record<string, string> = { story_time: "Story time", story_day: "Story day", time_of_day: "Time of day", time_part: "Part of the day", is_night: "Night" };

export const humanKey = (key: string): string => key.replace(/_+/g, " ").trim();

const possessive = (name: string): string => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

type Named = { id: string; name: string };

const splitName = (people: readonly Named[], rest: string): [Named, string] | null => {
  const hit = people.find((person) => rest === person.id || rest.startsWith(`${person.id}_`));
  return hit ? [hit, rest.slice(hit.id.length + 1)] : null;
};

const compiledLabel = (source: KeyLabelSource, key: string): string | null => {
  if (TIME_LABELS[key]) return TIME_LABELS[key];
  const cast: Named[] = (source.roster ?? []).map((member) => ({ id: member.id, name: castCardName(member) }));
  const people = [...cast, { id: PLAYER, name: "you" }].sort((a, b) => b.id.length - a.id.length);
  const members = people.filter((person) => person.id !== PLAYER);
  const prefixed = (prefix: string) => (key.startsWith(prefix) ? key.slice(prefix.length) : null);
  const rel = prefixed("rel_");
  if (rel !== null) {
    const holder = splitName(members, rel);
    const toward = holder && splitName(people, holder[1]);
    if (holder && toward && toward[1]) return `${possessive(holder[0].name)} ${humanKey(toward[1])} toward ${toward[0].name}`;
    return null;
  }
  const mood = prefixed("mood_");
  if (mood !== null) {
    const who = splitName(members, mood);
    return who && !who[1] ? `${possessive(who[0].name)} mood` : null;
  }
  const agenda = prefixed("agenda_");
  if (agenda !== null) {
    const who = splitName(members, agenda);
    const parts = who && /^(.+)_(step|wait|chapter|repeats)$/.exec(who[1]);
    return who && parts ? `${possessive(who[0].name)} ${humanKey(parts[1])} agenda ${parts[2]}` : null;
  }
  const rep = prefixed("rep_");
  if (rep !== null) {
    const faction = (source.factions ?? []).find((entry) => entry.id === rep);
    return faction ? `Standing with ${faction.name ?? humanKey(faction.id)}` : null;
  }
  return null;
};

export const labelForKey = (source: KeyLabelSource | null | undefined, key: string): string => {
  if (!source) return key;
  const authored = source.qualityByKey?.[key]?.display?.label?.trim()
    || source.qualities?.find((quality) => quality.key === key)?.display?.label?.trim();
  return authored || compiledLabel(source, key) || humanKey(key);
};

export const keyLabeler = (source: KeyLabelSource): ((key: string) => string) => {
  const cache = new Map<string, string>();
  return (key) => {
    const known = cache.get(key);
    if (known !== undefined) return known;
    const label = labelForKey(source, key);
    cache.set(key, label);
    return label;
  };
};
