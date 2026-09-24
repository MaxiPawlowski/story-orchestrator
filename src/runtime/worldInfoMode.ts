// v2.4 plan 05 T13 spike. True only while `worldInfo.gatingMode` is "scan" AND the scan handler was
// seen running on a probe scan (the `wiScanGating` capability). Otherwise the file path (per-chat
// writes plus release) runs exactly as before, which is also the S6 fallback.
let scanGating = false;

export const scanGatingActive = (): boolean => scanGating;

export const setScanGatingActive = (active: boolean): void => {
  scanGating = active;
};
