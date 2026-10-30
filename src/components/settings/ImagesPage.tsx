import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { RuntimeManager } from "@runtime/index";
import type { WorkspaceNavigate } from "@components/workspace/WorkspaceShell";

const ImageGroup = lazyRetry(() => import("../../image/ImageGroup"));
const SpriteGroup = lazyRetry(() => import("../../sprites/SpriteGroup"));

export interface ImagesPageProps {
  manager: RuntimeManager;
  sub?: string;
  navigate: WorkspaceNavigate;
}

export const ImagesPage = ({ manager, sub, navigate }: ImagesPageProps) => {
  const view = sub === "picture-types" || sub === "model-sources" ? sub : "main";
  return <div className="so-settings-page">
    {view === "main" && <header className="so-page-head"><h2>Images & stage</h2>
      <p className="so-section-desc">Your picture service, when pictures are drawn, and the character stage. Affects every chat; stage rows can differ on this device.</p></header>}
    <Lazy fallback={<p className="so-setting-desc">Loading image setup…</p>}><ImageGroup manager={manager} view={view}
      onOpenView={(next) => navigate({ context: "orchestrator", page: "images", sub: next })} /></Lazy>
    {view === "main" && <Lazy fallback={null}><SpriteGroup manager={manager} /></Lazy>}
  </div>;
};

export default ImagesPage;
