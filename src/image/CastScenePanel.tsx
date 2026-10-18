import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { startImage } from "./start";
import CastSceneControls from "./CastSceneControls";

export default function CastScenePanel({ manager, snapshot }: { manager: RuntimeManager; snapshot: RuntimeSnapshot }) {
  return <CastSceneControls manager={manager} snapshot={snapshot} queue={startImage(manager).queue} />;
}
