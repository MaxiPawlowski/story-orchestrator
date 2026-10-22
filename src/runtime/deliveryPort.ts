import { polishOn, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";

type Kit = typeof import("./delivery/kit");

let kit: Kit | null = null;

export const loadDelivery = async (): Promise<Kit> => (kit ??= await import("./delivery/kit"));

export const deliveryKit = (): Kit | null => kit;

export interface DeliverySwitches {
  enabled: boolean;
  repetition: boolean;
}

export const memberDelivers = (story: NormalizedStory | null | undefined, rosterId: string, switches: DeliverySwitches): boolean => {
  const member = story?.roster.find((entry) => entry.id === rosterId);
  if (!member || !switches.enabled || member.polish?.enabled === false) return false;
  return polishOn(member.polish) || switches.repetition;
};

export const hasDeliverySheet = (story: NormalizedStory | null | undefined, switches: DeliverySwitches): boolean =>
  Boolean(story?.roster.some((member) => memberDelivers(story, member.id, switches)));

export interface MemberRepetitionRow {
  id: string;
  name: string;
  replies: number;
  phrases: string[];
}

export const memberRepetitionRows = (story: NormalizedStory | null, rows: readonly unknown[]): MemberRepetitionRow[] | undefined => {
  const loaded = kit;
  if (!story || !loaded) return undefined;
  const readout = loaded.deliveryReadout(story, rows);
  return story.roster.flatMap((member) => {
    const report = readout[member.id];
    const phrases = report ? loaded.repeatedPhrases(report) : [];
    return report && phrases.length ? [{ id: member.id, name: member.name ?? member.id, replies: report.replies, phrases }] : [];
  });
};

export interface DeliveryPortDeps {
  story: () => NormalizedStory | null;
  values: () => Record<string, PrimitiveValue> | null;
  rows: () => readonly unknown[];
  switches: () => DeliverySwitches;
  refresh: () => void;
}

const moodOf = (story: NormalizedStory, rosterId: string, values: Record<string, PrimitiveValue>): string | null => {
  const member = story.life?.members.find((entry) => entry.id === rosterId);
  const layer = member?.mood ? gameLayer() : null;
  return member && layer ? layer.life.effectiveMood(member, values) : null;
};

export function createDeliveryPort(deps: DeliveryPortDeps) {
  let waiting = false;
  let early = 0;
  const load = () => {
    if (kit || waiting) return;
    waiting = true;
    void loadDelivery().then(() => { waiting = false; deps.refresh(); });
  };
  return {
    active(): boolean {
      const on = hasDeliverySheet(deps.story(), deps.switches());
      if (on) load();
      return on;
    },
    delivers(rosterId: string): boolean {
      return memberDelivers(deps.story(), rosterId, deps.switches());
    },
    lines(rosterId: string): string[] {
      const story = deps.story();
      const switches = deps.switches();
      if (!story || !memberDelivers(story, rosterId, switches)) return [];
      if (!kit) {
        early += 1;
        load();
        return [];
      }
      return kit.deliveryLines({ story, rosterId, rows: deps.rows(), mood: moodOf(story, rosterId, deps.values() ?? {}), repetition: switches.repetition });
    },
    earlyDrafts: () => early,
  };
}
