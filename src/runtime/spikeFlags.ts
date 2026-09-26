import { isRecord } from "@utils/guards";

export const SPIKE_FLAGS = ["sp7Chance", "sp6Complications"] as const;

export type SpikeFlag = (typeof SPIKE_FLAGS)[number];

export type SpikeFlags = Record<SpikeFlag, boolean>;

export const defaultSpikeFlags = (): SpikeFlags => Object.fromEntries(SPIKE_FLAGS.map((flag) => [flag, false])) as SpikeFlags;

export const sanitizeSpikeFlags = (value: unknown): SpikeFlags =>
  Object.fromEntries(SPIKE_FLAGS.map((flag) => [flag, isRecord(value) && value[flag] === true])) as SpikeFlags;
