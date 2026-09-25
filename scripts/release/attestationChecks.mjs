// v2.4 plan 02 §10 (X11). What the attestation test used to hard-code — the records directory of one
// release and the journey list J0..J12 — is read from the files that own it: the attestation names its
// own evidence root, and the journey catalog is test/journeys/*.journey.json. A literal list goes stale
// the day a journey is added, and a stale list passes over the journey it forgot.

import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const JOURNEY_KEY = /^J\d+$/;

const byNumber = (left, right) => Number(left.slice(1)) - Number(right.slice(1));

export function recordsRootOf(attestation, root) {
  const cited = attestation?.evidence?.journeys;
  if (typeof cited !== "string" || !cited.trim()) throw new Error("the attestation names no evidence.journeys records root, so no citation can be checked");
  if (isAbsolute(cited)) throw new Error(`evidence.journeys must be relative to the repo, got ${cited}`);
  const dir = resolve(root, cited);
  if (relative(root, dir).startsWith("..")) throw new Error(`evidence.journeys points outside the repo: ${cited}`);
  return dir;
}

export function journeyCatalog(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".journey.json"))
    .map((name) => {
      const id = JSON.parse(readFileSync(join(dir, name), "utf8")).id;
      if (typeof id !== "string" || !JOURNEY_KEY.test(id)) throw new Error(`${name} has no journey id of the form J<n>`);
      return id;
    })
    .sort(byNumber);
}

export const attestedJourneyIds = (attestation) => Object.keys(attestation?.journeys ?? {}).filter((key) => JOURNEY_KEY.test(key)).sort(byNumber);

export function catalogProblems(attested, catalog) {
  const missing = catalog.filter((id) => !attested.includes(id)).map((id) => `${id} is in the journey catalog and not in the attestation`);
  const unknown = attested.filter((id) => !catalog.includes(id)).map((id) => `${id} is attested and has no journey file`);
  return [...missing, ...unknown];
}

export const citedRecords = (attestation) =>
  attestedJourneyIds(attestation).flatMap((id) => [
    ...(attestation.journeys[id].records ?? []),
    ...(attestation.journeys[id].runs ?? []).flatMap((run) => [run?.record, run?.header].filter((path) => typeof path === "string")),
  ]);
