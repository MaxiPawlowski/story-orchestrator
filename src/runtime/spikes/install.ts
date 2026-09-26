import { installSpikeSeams } from "../spikeSeams";
import type { SpikeFlags } from "../spikeFlags";
import { createChanceSeams, type ChanceContext, type ChanceDraw } from "./sp7Chance";

export interface SpikePort {
  flags(): SpikeFlags;
  chatId(): string | null;
  storyId(): string | null;
  boundary(): number | null;
  raw(): unknown;
}

export interface SpikeDebug {
  draws: ChanceDraw[];
}

export const SPIKE_DRAW_RING = 200;

export const chanceContext = (port: SpikePort): ChanceContext | null => {
  if (!port.flags().sp7Chance) return null;
  const chatId = port.chatId();
  const storyId = port.storyId();
  const boundary = port.boundary();
  if (!chatId || !storyId || boundary === null) return null;
  return { chatId, storyId, boundary, raw: port.raw() };
};

export const installSpikes = (port: SpikePort, publish: (debug: SpikeDebug | undefined) => void): (() => void) => {
  const debug: SpikeDebug = { draws: [] };
  const record = (draw: ChanceDraw) => {
    debug.draws.push(draw);
    if (debug.draws.length > SPIKE_DRAW_RING) debug.draws.shift();
  };
  const release = installSpikeSeams(createChanceSeams(() => chanceContext(port), record));
  publish(debug);
  return () => {
    release();
    publish(undefined);
  };
};
