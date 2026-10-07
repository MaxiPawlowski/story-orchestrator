import type { SpriteBuildRequest } from "./builder";

export function validateBuildRequest(request: SpriteBuildRequest): number {
  if (!request.character || /[\\/]/.test(request.character) || !/^[a-z0-9_]{1,80}$/.test(request.set) || !/^[a-z0-9_]{1,80}$/.test(request.label)) {
    throw new Error("Choose a character folder and valid lowercase set and expression ids.");
  }
  if (!Number.isInteger(request.steps) || request.steps < 1 || request.steps > 100
    || !Number.isInteger(request.seed) || request.seed < 0 || request.seed > 4294967295) {
    throw new Error("Steps must be 1–100, and the seed must be a whole number from 0 to 4294967295.");
  }
  if (request.kind === "look" && !request.value.trim()) throw new Error("Describe the visible change before generating a new look.");
  if (request.kind === "base" && !request.cutout?.files.length) {
    throw new Error("Choose an installed background-removal setup before building a base.");
  }
  const resolution = request.resolution ?? 1024;
  if (!Number.isInteger(resolution) || resolution < 256 || resolution > 2048 || resolution % 32) {
    throw new Error("Edit resolution must be 256–2048 pixels in steps of 32.");
  }
  return resolution;
}
