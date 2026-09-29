import type { ArcTemplate, BoundaryLogEntry, NormalizedStoryV2 } from "@engine/index";
import { installSpikeSeams } from "../spikeSeams";
import type { SpikeSettings } from "../settingsModel";
import { createChanceSeams, type ChanceContext, type ChanceDraw } from "./sp7Chance";
import {
  composeComplication, createComplicationSeam, deriveReleases, logDirections, pendingRelease, readComplicationPools,
  type ComplicationEvent, type ComplicationRelease, type PromptPort, type ReleaseInput,
} from "./sp6Complications";

export interface SpikePort {
  flags(): SpikeSettings;
  chatId(): string | null;
  storyId(): string | null;
  boundary(): number | null;
  raw(): unknown;
  story?(): NormalizedStoryV2 | null;
  log?(): readonly BoundaryLogEntry[];
  shape?(): ArcTemplate | null;
  prompt?: PromptPort;
}

export interface ComplicationView {
  flag: boolean;
  releases: ComplicationRelease[];
  pending: ComplicationRelease | null;
  directions: string[];
  compose: (release: ComplicationRelease) => string;
}

export interface SpikeDebug {
  draws: ChanceDraw[];
  events: ComplicationEvent[];
  complications: () => ComplicationView | null;
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

export const releaseInput = (port: SpikePort): ReleaseInput | null => {
  const story = port.story?.() ?? null;
  if (!story) return null;
  return { story, pools: readComplicationPools(port.raw()), log: port.log?.() ?? [], shape: port.shape?.() ?? story.arc_template ?? null };
};

export const complicationView = (port: SpikePort, spent?: ReadonlyMap<string, number>): ComplicationView | null => {
  const input = releaseInput(port);
  if (!input) return null;
  const withSpent = spent ? { ...input, spent } : input;
  return {
    flag: port.flags().sp6Complications,
    releases: deriveReleases(withSpent),
    pending: pendingRelease(withSpent),
    directions: logDirections(withSpent),
    compose: (release) => composeComplication(input.story, release),
  };
};

const ring = <T>(list: T[], item: T) => {
  list.push(item);
  if (list.length > SPIKE_DRAW_RING) list.shift();
};

export const installSpikes = (port: SpikePort, publish: (debug: SpikeDebug | undefined) => void): (() => void) => {
  const spent = new Map<string, number>();
  const debug: SpikeDebug = { draws: [], events: [], complications: () => complicationView(port, spent) };
  const generation = port.prompt
    ? createComplicationSeam(() => (port.flags().sp6Complications ? releaseInput(port) : null), port.prompt, (event) => ring(debug.events, event), spent)
    : undefined;
  const release = installSpikeSeams({ ...createChanceSeams(() => chanceContext(port), (draw) => ring(debug.draws, draw)), ...(generation ? { generation } : {}) });
  publish(debug);
  return () => {
    release();
    generation?.({ kind: "closed", reason: "ended" });
    publish(undefined);
  };
};
