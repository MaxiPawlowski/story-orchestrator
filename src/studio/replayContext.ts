import { createContext, useContext } from "react";
import type { GateReplaySource } from "./gateReplay";

export const GateReplayContext = createContext<GateReplaySource | null>(null);

export const useGateReplaySource = (): GateReplaySource | null => useContext(GateReplayContext);
