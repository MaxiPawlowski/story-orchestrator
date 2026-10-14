import React from "react";

export default function PresentationRoutes() {
  return <details aria-label="Visual use-case routes"><summary>Visual use-case routes and status</summary><dl className="text-sm">
    <dt>Base, expressions, changed looks and poses</dt><dd>Configured Qwen 2.1 edit route; BiRefNet for base/body cutouts.
      Review base identity here. Pose floors remain unresolved, including side lying.</dd>
    <dt>Reference bust and live head</dt><dd>Author-reviewed crop of accepted base. A changed look needs a new bust/rig.
      Static fallback until rebuilt (Changed-look bust and rig) or imported. Landmark rigs await their real-art trial.</dd>
    <dt>Reference views (optional)</dt><dd>Same Qwen 2.1 route with BiRefNet: three-quarter left and right, profile and back drawn from the accepted base,
      which with the bust makes six views. Accepting stamps the pack hash into every later key; no recipe uses the views as references yet.</dd>
    <dt>Prepared cast illustration</dt><dd>Chat → Illustrations → Illustrate prepared cast. One or two accepted current-look identities,
      distinct Qwen 2.1 scene recipe. Pending/stale looks are refused.</dd>
    <dt>Background and cast-free illustration</dt><dd>Existing Picture types and story workflow controls, including SDXL backgrounds. No measured replacement route or guaranteed fast tier.</dd>
  </dl></details>;
}
