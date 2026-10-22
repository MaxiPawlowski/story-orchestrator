import type { EchoesState } from "@engine/life/echoes";
import type { EchoAuthorView } from "@engine/life/echoView";
import type { CuePort } from "./cuePort";
import type { EchoRuntime } from "./echoRuntime";
import type { ManagerPort } from "./managerWiring";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";

declare module "./types" {
  interface RuntimeExtras {
    echoes?: EchoesState;
  }
  interface RuntimeSnapshot {
    echoesAuthor?: EchoAuthorView | null;
  }
}

export type EchoPort = EchoRuntime;

export function createEchoPort(port: ManagerPort, memory: MemoryCoordinator, cues: CuePort): EchoPort {
  const door: EchoPort = { relevant: () => false, provider: () => [], onLapse: () => undefined, onBoundary: () => undefined, authorView: () => null };
  cues.addOfferProvider("echoes", (ctx) => door.provider(ctx), () => door.relevant());
  cues.onLapse("echoes", (lapse) => door.onLapse(lapse));
  void import("./echoRuntimeHost").then(({ startEchoRuntime }) => { Object.assign(door, startEchoRuntime(port, memory, cues)); }, () => undefined);
  return door;
}
