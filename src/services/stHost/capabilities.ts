import { getContext, hostMacrosAvailable } from "./context";
import { judgeStatus, JUDGE_PLUGIN_BASE } from "./judge";
import { backgroundsModule } from "./modules";
import { listSlashCommands } from "./selectors";
import { getHostVersion, macroEngineInUse } from "./version";

// v2.3 plan 06. Every seam this extension reaches through has a way of being missing, and the ways
// differ: a build with no MacrosParser, a route this ST version never mounted, a plugin nobody
// installed. Until now each consumer found out by failing, which reported a missing capability as a
// story defect — the shape of every trap in this project's history. A probe answers the question
// first, and a consumer that reads `absent` takes its documented fallback instead of the failure.
//
// `absent` is a fact about the install and is cached for the page load; `error` is a fact about this
// attempt, and is NOT cached, so the next use retries it.

export type CapabilityState = "present" | "absent" | "error";
export type CapabilityId = "macros" | "slashCommands" | "backgrounds" | "vectors" | "judge";

export interface CapabilityReport {
  id: CapabilityId;
  state: CapabilityState;
  /** What was found, in the terms of the thing that is missing. Shown to the author, never the player. */
  detail: string;
}

// `/bg` switches a background and `/sendas` posts a scripted npc reply: both are effects this
// extension applies on the author's behalf, so a build without them cannot run those effects at all.
const REQUIRED_COMMANDS = ["bg", "sendas"];

type Probe = () => Promise<{ state: CapabilityState; detail: string }> | { state: CapabilityState; detail: string };

const present = (detail: string) => ({ state: "present" as const, detail });
const absent = (detail: string) => ({ state: "absent" as const, detail });

// V17: the probe used to look for `getContext().MacrosParser`, which real ST never exposes (st-context.js
// hands out `registerMacro`, bound), so it read `absent` on every working install. It now asks the
// module `registerHostMacro` registers through.
const macrosProbe: Probe = () =>
  hostMacrosAvailable() ? present("MacrosParser") : absent("this build exposes no MacrosParser, so {{story_*}} macros never resolve in a prompt");

const slashCommandsProbe: Probe = () => {
  const names = new Set(listSlashCommands().flatMap((command) => [command.name, ...command.aliases]).map((name) => name.toLowerCase()));
  const missing = REQUIRED_COMMANDS.filter((name) => !names.has(name));
  return missing.length ? absent(`no /${missing.join(", /")} command: the effects that use ${missing.length > 1 ? "them" : "it"} cannot run`) : present(`${REQUIRED_COMMANDS.length} commands`);
};

// v2.3 plan 08. `background_settings` is the live export `/bg` switches (backgrounds.js:108) — the
// module either loaded or it did not, and a checkpoint's `effects.background` needs it.
const backgroundsProbe: Probe = () => {
  const settings = backgroundsModule?.background_settings;
  return settings && typeof settings === "object" ? present(`background is "${String((settings as { name?: unknown }).name ?? "")}"`) : absent("scripts/backgrounds.js exposed no background_settings, so a checkpoint's background effect cannot switch anything");
};

// `/api/vector/list` is a pure read of saved hashes (src/endpoints/vectors.js:530) — it loads no
// model, unlike a query, so this costs one request rather than an embedding cold start.
const vectorsProbe: Probe = async () => {
  const headers = (getContext() as unknown as { getRequestHeaders: () => Record<string, string> }).getRequestHeaders();
  const response = await fetch("/api/vector/list", { method: "POST", headers, body: JSON.stringify({ collectionId: "so-capability-probe", source: "transformers" }) });
  if (response.status === 404 || response.status === 405) return absent("this build has no /api/vector routes, so memory consolidation falls back to keyword overlap");
  // V17: any other non-OK status is this attempt failing, not the install lacking the feature, so it
  // throws: the caller reports `error` and does not cache it.
  if (!response.ok) throw new Error(`the vectors API answered ${String(response.status)}`);
  return present("vectors API");
};

const judgeProbe: Probe = async () => {
  const status = await judgeStatus();
  if (!status) return absent(`nothing answered ${JUDGE_PLUGIN_BASE}/status (not installed, or the route refused) — every judge use stays off`);
  return status.configured ? present(`plugin ${status.pluginVersion ?? "?"}, ${status.model ?? "model unknown"}`) : absent("the judge plugin is installed but holds no key");
};

const PROBES: Record<CapabilityId, Probe> = { macros: macrosProbe, slashCommands: slashCommandsProbe, backgrounds: backgroundsProbe, vectors: vectorsProbe, judge: judgeProbe };

export const CAPABILITY_IDS = Object.keys(PROBES) as CapabilityId[];

/**
 * v2.3 plan 08: the facts a bug report needs that are not a present/absent question — which
 * SillyTavern this is, and which macro engine registered our `{{story_*}}` macros. A probe answers
 * what is missing; this says what it is running on.
 */
export interface HostFacts {
  stVersion: string | null;
  stCommit: string | null;
  macroEngine: "new" | "legacy" | "unknown";
}

export const hostFacts = async (): Promise<HostFacts> => {
  const version = await getHostVersion();
  return { stVersion: version?.version ?? null, stCommit: version?.commit ?? null, macroEngine: macroEngineInUse() };
};

/** One block of text for the clipboard, so a report carries the whole picture. */
export const renderCapabilityReport = (reports: CapabilityReport[], facts: HostFacts, extensionVersion: string): string => [
  `Story Orchestrator ${extensionVersion}`,
  `SillyTavern ${facts.stVersion ?? "unknown"}${facts.stCommit ? ` (${facts.stCommit})` : ""}`,
  `macros: ${facts.macroEngine} engine`,
  ...reports.map((report) => `${report.id}: ${report.state} — ${report.detail}`),
].join("\n");

const cache = new Map<CapabilityId, CapabilityReport>();

/**
 * One probe, cached for the page load. Pass `refresh` to re-run it (the settings panel's Recheck).
 * A probe that threw is returned but not cached: an unreachable server is not an absent feature.
 */
export async function probeCapability(id: CapabilityId, options: { refresh?: boolean } = {}): Promise<CapabilityReport> {
  const cached = options.refresh ? undefined : cache.get(id);
  if (cached) return cached;
  let report: CapabilityReport;
  try {
    report = { id, ...(await PROBES[id]()) };
  } catch (error) {
    return { id, state: "error", detail: error instanceof Error ? error.message : "the probe failed" };
  }
  cache.set(id, report);
  return report;
}

export const capabilityReport = (options: { refresh?: boolean } = {}): Promise<CapabilityReport[]> =>
  Promise.all(CAPABILITY_IDS.map((id) => probeCapability(id, options)));

export const invalidateCapabilities = (): void => cache.clear();

export const capabilityState = async (id: CapabilityId): Promise<CapabilityState> => (await probeCapability(id)).state;
