import { questClosedKey, type GateNode, type Quest, type QuestConsequence, type Story } from "@engine/schema";
import { isRecord } from "@utils/guards";

export interface MatrixConsequence {
  id: string;
  when: GateNode | null;
  writes: string[];
  effects: string[];
  label: string | null;
}

export interface MatrixRow {
  id: string;
  label: string | null;
  from: string[];
  sugar: boolean;
  consequences: MatrixConsequence[];
  readers: string[];
}

const consequenceOf = (consequence: QuestConsequence): MatrixConsequence => ({
  id: consequence.id, when: consequence.when ?? null, writes: Object.keys(consequence.set ?? {}), effects: Object.keys(consequence.effects ?? {}), label: consequence.label ?? null,
});

const sugarDone = (quest: Quest): boolean => Boolean(quest.done_when || (!quest.resolutions?.length && (quest.steps?.length || quest.progress)));

const readsResolution = (leaf: Record<string, unknown>, key: string, resolution: string): boolean => {
  if (leaf.q !== key) return false;
  if (leaf.op === "==") return leaf.v === resolution;
  if (leaf.op === "in") return Array.isArray(leaf.v) && leaf.v.includes(resolution);
  return leaf.op === "!=";
};

const walk = (value: unknown, path: string, visit: (node: Record<string, unknown>, path: string) => void): void => {
  if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}.${index}`, visit));
  if (!isRecord(value)) return;
  visit(value, path);
  Object.entries(value).forEach(([key, child]) => walk(child, path ? `${path}.${key}` : key, visit));
};

const located = (path: string, draft: Story): string => {
  const [list, index, ...rest] = path.split(".");
  const item = (draft as unknown as Record<string, unknown>)[list];
  const entry = Array.isArray(item) ? item[Number(index)] : undefined;
  const name = isRecord(entry) ? String(entry.id ?? (entry.from && entry.to ? `${String(entry.from)} → ${String(entry.to)}` : index)) : index;
  return [list, name, ...rest.filter((part) => !/^\d+$/.test(part) && !["all", "any", "not", "q", "op", "v"].includes(part))].filter(Boolean).join(" ");
};

export const resolutionReaders = (draft: Story, questId: string, resolution: string): string[] => {
  const key = questClosedKey(questId);
  const found = new Set<string>();
  walk(draft, "", (node, path) => {
    if (readsResolution(node, key, resolution)) found.add(located(path, draft));
    if (isRecord(node.after) && node.after.quest === questId && node.after.to === resolution) found.add(located(path, draft));
    if (node.kind === "quest" && node.id === questId && node.to === resolution) found.add(located(path, draft));
    if (node.quest === questId && Array.isArray(node.resolution) && node.resolution.includes(resolution)) found.add(located(path, draft));
  });
  (draft.quests ?? []).forEach((quest) => (quest.requires ?? []).forEach((entry) => {
    if (entry === questId && resolution === "done") found.add(`quests ${quest.id} requires`);
  }));
  return [...found].sort();
};

export const questMatrix = (draft: Story, quest: Quest): MatrixRow[] => {
  const rows: Array<Omit<MatrixRow, "readers">> = [
    ...(sugarDone(quest) ? [{ id: "done", label: quest.labels?.done ?? null, from: ["active"], sugar: true, consequences: quest.reward ? [consequenceOf({ id: "reward", ...quest.reward })] : [] }] : []),
    ...(quest.failed_when ? [{ id: "failed", label: quest.labels?.failed ?? null, from: ["active"], sugar: true, consequences: [] }] : []),
    ...(quest.resolutions ?? []).map((resolution) => ({
      id: resolution.id, label: resolution.label ?? null, from: resolution.from ?? ["active"], sugar: false, consequences: (resolution.consequences ?? []).map(consequenceOf),
    })),
  ];
  return rows.map((row) => ({ ...row, readers: resolutionReaders(draft, quest.id, row.id) }));
};

export const consequenceWriteConflicts = (draft: Story): Array<{ key: string; quests: string[] }> => {
  const writers = new Map<string, Set<string>>();
  (draft.quests ?? []).forEach((quest) => {
    const sets = [quest.reward?.set, ...(quest.resolutions ?? []).flatMap((resolution) => (resolution.consequences ?? []).map((consequence) => consequence.set))];
    sets.forEach((set) => Object.entries(set ?? {}).forEach(([key, write]) => {
      if (typeof write === "object") return;
      writers.set(key, (writers.get(key) ?? new Set()).add(quest.id));
    }));
  });
  return [...writers].filter(([, quests]) => quests.size > 1).map(([key, quests]) => ({ key, quests: [...quests].sort() }));
};
