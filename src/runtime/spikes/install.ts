import type { ArcTemplate, BoundaryLogEntry, NormalizedStory } from "@engine/index";
import { installSpikeSeams } from "../spikeSeams";
import type { SpikeSettings } from "../settingsModel";
import { onChanceDraw, type ChanceDraw } from "../chance";
import { playerTurnIds } from "../agencyRecovery";
import {
  composeComplication, createComplicationSeam, deriveReleases, logDirections, pendingRelease, readComplicationPools,
  type ComplicationEvent, type ComplicationRelease, type PromptPort, type ReleaseInput,
} from "./sp6Complications";
import { clockStates, createClockSeam, readStoryClocks, type ClockEvent, type ClockInput, type ClockState } from "./checkClocks";

export interface SpikePort {
  flags(): SpikeSettings;
  raw(): unknown;
  story?(): NormalizedStory | null;
  log?(): readonly BoundaryLogEntry[];
  shape?(): ArcTemplate | null;
  chat?(): readonly unknown[];
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
  clocks: () => ClockState[] | null;
  clockEvents: ClockEvent[];
}

export const SPIKE_DRAW_RING = 200;

export const releaseInput = (port: SpikePort): ReleaseInput | null => {
  const story = port.story?.() ?? null;
  if (!story) return null;
  const base = { story, pools: readComplicationPools(port.raw()), log: port.log?.() ?? [], shape: port.shape?.() ?? story.arc_template ?? null };
  return port.chat ? { ...base, playerTurnIds: playerTurnIds(port.chat()) } : base;
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

export const clockInput = (port: SpikePort): ClockInput | null => {
  const story = port.story?.() ?? null;
  const clocks = story ? readStoryClocks(port.raw()) : [];
  return story && clocks.length ? { story, clocks, log: port.log?.() ?? [] } : null;
};

const ring = <T>(list: T[], item: T) => {
  list.push(item);
  if (list.length > SPIKE_DRAW_RING) list.shift();
};

export const installSpikes = (port: SpikePort, publish: (debug: SpikeDebug | undefined) => void): (() => void) => {
  const spent = new Map<string, number>();
  const debug: SpikeDebug = {
    draws: [], events: [], clockEvents: [], complications: () => complicationView(port, spent),
    clocks: () => {
      const input = clockInput(port);
      return input ? clockStates(input) : null;
    },
  };
  const complications = port.prompt
    ? createComplicationSeam(() => (port.flags().sp6Complications ? releaseInput(port) : null), port.prompt, (event) => ring(debug.events, event), spent)
    : undefined;
  const clocks = port.prompt ? createClockSeam(() => (port.flags().checkClocks ? clockInput(port) : null), port.prompt, (event) => ring(debug.clockEvents, event)) : undefined;
  const generation = complications && clocks
    ? (intent: Parameters<typeof clocks>[0]) => {
      complications(intent);
      clocks(intent);
    }
    : undefined;
  const release = installSpikeSeams(generation ? { generation } : {});
  const unlisten = onChanceDraw((draw) => ring(debug.draws, draw));
  publish(debug);
  return () => {
    release();
    unlisten();
    generation?.({ kind: "closed", reason: "ended" });
    publish(undefined);
  };
};
