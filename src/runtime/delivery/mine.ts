import { polishOn, type NormalizedStory } from "@engine/index";
import { REPETITION_MIN_EARLIER, REPETITION_WINDOW, mineRepetition, type RepetitionReport } from "@stagecraft/repetition";
import { termPresent } from "@utils/termPresent";

export interface MemberRepetition extends RepetitionReport {
  tics: string[];
}

interface Row {
  name?: unknown;
  is_user?: unknown;
  is_system?: unknown;
  mes?: unknown;
}

const fold = (text: string) => text.trim().toLowerCase();

const QUOTED = /"[^"]*"|“[^”]*”/g;

export const withoutQuotes = (text: string): string => text.replace(QUOTED, " ");

export const deliveryResolver = (story: Pick<NormalizedStory, "roster">): ((name: string) => string | null) => {
  const owners = new Map<string, Set<string>>();
  story.roster.forEach((member) => [member.name ?? member.id, ...(member.aliases ?? [])].map(fold).filter(Boolean).forEach((name) => {
    owners.set(name, (owners.get(name) ?? new Set()).add(member.id));
  }));
  return (name) => {
    const ids = owners.get(fold(name));
    return ids && ids.size === 1 ? [...ids][0] : null;
  };
};

export const repliesBy = (rows: readonly unknown[], story: Pick<NormalizedStory, "roster">): Map<string, string[]> => {
  const resolve = deliveryResolver(story);
  const omniscient = new Set(story.roster.filter((member) => member.view === "omniscient").map((member) => member.id));
  const replies = new Map<string, string[]>();
  rows.forEach((row) => {
    if (typeof row !== "object" || row === null) return;
    const shaped = row as Row;
    if (shaped.is_user === true || shaped.is_system === true || typeof shaped.mes !== "string" || typeof shaped.name !== "string") return;
    const id = resolve(shaped.name);
    if (!id) return;
    const text = omniscient.has(id) ? withoutQuotes(shaped.mes) : shaped.mes;
    if (!text.trim()) return;
    replies.set(id, [...(replies.get(id) ?? []), text]);
  });
  return replies;
};

const ticHits = (tics: readonly string[], window: readonly string[]): string[] =>
  tics.filter((tic) => window.filter((reply) => termPresent(reply, tic)).length >= REPETITION_MIN_EARLIER);

export const mineRepetitionBy = (rows: readonly unknown[], story: Pick<NormalizedStory, "roster">): Map<string, MemberRepetition> => {
  const replies = repliesBy(rows, story);
  return new Map(story.roster.flatMap((member) => {
    const own = replies.get(member.id) ?? [];
    if (!own.length) return [];
    const window = own.slice(-REPETITION_WINDOW);
    const report = mineRepetition(window);
    const tics = polishOn(member.polish) ? ticHits(member.polish.tics ?? [], window) : [];
    return [[member.id, { ...report, tics, loops: report.loops || tics.length > 0 }]];
  }));
};

export const repeatedPhrases = (report: MemberRepetition | undefined): string[] => (report ? [...new Set([...report.tics, ...report.hot])] : []);
