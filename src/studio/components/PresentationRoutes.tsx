import React from "react";

export default function PresentationRoutes() {
  return <details aria-label="Visual use-case routes"><summary>Visual use-case routes and status</summary><dl className="text-sm">
    <dt>Base, expressions, changed looks and poses</dt><dd>Configured Qwen 2.1 edit route; BiRefNet for base/body cutouts.
      Review base identity here. Pose floors remain unresolved, including side lying.</dd>
    <dt>Reference bust and live head</dt><dd>Author-reviewed crop of accepted base. A changed look needs a new bust/rig.
      Static fallback until a matching rig is imported. Vision rig preparation awaits its real product trial.</dd>
    <dt>Prepared cast illustration</dt><dd>Chat → Illustrations → Illustrate prepared cast. One or two accepted current-look identities,
      distinct Qwen 2.1 scene recipe. Pending/stale looks are refused.</dd>
    <dt>Background and cast-free illustration</dt><dd>Existing Picture types and story workflow controls, including SDXL backgrounds. No measured replacement route or guaranteed fast tier.</dd>
  </dl></details>;
}
