import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { isInCharacterPlayerLine, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { addressedAmong } from "@talk/index";
import { withholds } from "./generationLifecycle";
import { awayRosterIds } from "./whereabouts";

const latestTurnText = (chat: readonly unknown[]): string | null => {
  for (let index = chat.length - 1; index >= 0; index -= 1) {
    const row = chat[index] as { mes?: unknown };
    if (isInCharacterPlayerLine(row)) return typeof row.mes === "string" ? row.mes : null;
  }
  return null;
};

const listed = (names: string[]): string => (names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

export const awayNoticeLine = (story: NormalizedStoryV2 | null, values: Readonly<Record<string, PrimitiveValue>>, chat: readonly unknown[]): string | null => {
  const away = awayRosterIds(story, values);
  if (!story || !away.length) return null;
  const text = latestTurnText(chat);
  const names = text ? addressedAmong(story.roster, away, text).map((member) => member.name) : [];
  if (!names.length) return null;
  const who = listed(names);
  const are = names.length > 1 ? "are" : "is";
  return `${who} ${are} not here: the player spoke to ${who}, who ${are} elsewhere right now. Nobody answers as ${who} in this reply; the narrator says ${who} ${are} not present.`;
};

export interface AwayNoticeDeps {
  line: () => string | null;
  set: (key: string, text: string, depth: number) => unknown;
  clear: (key: string) => unknown;
}

export const createAwayNotice = (deps: AwayNoticeDeps) => {
  const spec = INJECTION_REGISTRY.awayNotice;
  let active = false;
  const clear = () => {
    if (!active) return;
    active = false;
    deps.clear(spec.key);
  };
  return {
    opened(type: unknown) {
      const text = withholds(type) ? null : deps.line();
      if (!text) return clear();
      deps.set(spec.key, text, spec.depth);
      active = true;
    },
    closed: clear,
  };
};
