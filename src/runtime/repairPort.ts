import type { RepairStep, SetupCounts } from "./repair";
import type { RuntimeSnapshot } from "./types";

type RepairKit = typeof import("./repair");

let kit: RepairKit | null = null;

export const loadRepairKit = async (): Promise<RepairKit> => (kit ??= await import("./repair"));

const NO_COUNTS: SetupCounts = { blocks: 0, degrades: 0 };

export const hudSetupAlert = (snapshot: RuntimeSnapshot): RepairStep | null => kit?.setupAlert(snapshot) ?? null;

export const hudSetupCounts = (snapshot: RuntimeSnapshot): SetupCounts => kit?.setupCounts(snapshot) ?? NO_COUNTS;
