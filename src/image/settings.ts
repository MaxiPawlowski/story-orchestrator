import { ASPECTS, FLUX, JANKU, WAI, type Aspect, type Lora, type Placement, type Purpose, type Quality, type Shot } from "./catalog";

export interface ImageRoute {
  checkpoint: string;
  family: string;
  quality: Quality;
  aspect: Aspect | "auto";
  shot: Shot;
  placement: Placement;
  candidates: number;
  extraPositive: string;
  extraNegative: string;
  safeMode: "inherit" | "on" | "off";
  directorMayOverride: boolean;
}
export interface LoraUse { file: string; weight: number }
export interface ImageBinding {
  appearanceTags: string;
  appearanceProse: string;
  checkpoint: string;
  loras: LoraUse[];
  alwaysTags: string;
  neverTags: string;
  seed: number | null;
}
export interface ImageOverride { checkpoint: string; quality: Quality | ""; extraPositive: string; loras: LoraUse[]; paused: boolean }
export interface ImageChatState { override: ImageOverride; emitted: string[]; automationCount: number }
export interface ImageSettings {
  enabled: boolean;
  backend: "st" | "comfy";
  directorProfileId: string;
  comfyUrl: string;
  contextMessages: number;
  maxTokens: number;
  useJsonSchema: boolean;
  defaults: { quality: Quality; seedPolicy: "random" | "lockPerMessage" | "fixed"; fixedSeed: number };
  automation: { mode: "manual" | "story" | "everyN" | "tool"; everyN: number };
  safeMode: boolean;
  purposes: Record<Purpose, ImageRoute>;
  upscalers: Record<string, string>;
  loras: Lora[];
  characters: Record<string, ImageBinding>;
}

export const automationAllowsCues = (mode: ImageSettings["automation"]["mode"]): boolean => mode === "story" || mode === "everyN";

// One automatic illustration per reply: a cadence trigger and a checkpoint/scene cue that land on the
// same message collapse to the first, so a player never sees the same reply drawn twice.
export const messageAlreadyDrawn = (
  chat: { messages?: Array<{ extra?: { media?: unknown[] } }> } | null | undefined,
  messageId: number | null,
): boolean => messageId !== null && Boolean(chat?.messages?.[messageId]?.extra?.media?.length);

const row = (patch: Partial<ImageRoute> = {}): ImageRoute => ({
  checkpoint: WAI, quality: "base", aspect: "portrait", shot: "upper", placement: "inline",
  family: "sdxl-illustrious",
  candidates: 1, extraPositive: "", extraNegative: "", safeMode: "inherit", directorMayOverride: false, ...patch,
});

export const defaultImageSettings = (): ImageSettings => ({
  enabled: true,
  backend: "st",
  directorProfileId: "",
  comfyUrl: "",
  contextMessages: 6,
  maxTokens: 900,
  useJsonSchema: true,
  defaults: { quality: "base", seedPolicy: "random", fixedSeed: 1 },
  automation: { mode: "story", everyN: 5 },
  safeMode: false,
  purposes: {
    scene: row({ aspect: "auto", shot: "cowboy", directorMayOverride: true }),
    character: row({ shot: "cowboy" }),
    portrait: row({ checkpoint: JANKU, family: "sdxl-noobai", shot: "close" }),
    user: row({ shot: "upper" }),
    background: row({ checkpoint: FLUX, family: "flux-dev", aspect: "wide", shot: "wide", placement: "background", extraPositive: "no humans, scenery" }),
    free: row({ aspect: "auto", shot: "full", directorMayOverride: true }),
  },
  upscalers: {}, loras: [], characters: {},
});

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const pick = <T extends string>(choices: readonly T[], value: unknown, fallback: T): T => typeof value === "string" && (choices as readonly string[]).includes(value) ? value as T : fallback;
const purposes: Purpose[] = ["scene", "character", "portrait", "user", "background", "free"];
const shots: Shot[] = ["close", "upper", "cowboy", "full", "wide", "pov", "from_above", "from_below"];
const placements: Placement[] = ["inline", "message", "background"];

export const sanitizeImageOverride = (value: unknown): ImageOverride => {
  const raw = record(value);
  return {
    checkpoint: str(raw.checkpoint), quality: pick(["", "base", "hires"] as const, raw.quality, ""),
    extraPositive: str(raw.extraPositive),
    paused: raw.paused === true,
    loras: Array.isArray(raw.loras) ? raw.loras.map((use) => ({ file: str(record(use).file), weight: num(record(use).weight, 0.8, -2, 2) })).filter((use) => use.file) : [],
  };
};

export const sanitizeImageChatState = (value: unknown, chatId: string, storyId?: string | null): ImageChatState => {
  const raw = record(value);
  const own = !raw.chatId || raw.chatId === chatId;
  const prefix = storyId ? `${chatId}:${storyId}:` : `${chatId}:`;
  return {
    override: sanitizeImageOverride(own ? raw.override : null),
    emitted: own && Array.isArray(raw.emitted) ? raw.emitted.filter(
      (key): key is string => typeof key === "string" && key.startsWith(prefix),
    ).slice(-100) : [],
    automationCount: own ? Math.floor(num(raw.automationCount, 0, 0, Number.MAX_SAFE_INTEGER)) : 0,
  };
};

export const sanitizeImageSettings = (value: unknown): ImageSettings => {
  const defaults = defaultImageSettings();
  const raw = record(value);
  const originalPurposes = record(raw.purposes);
  const originalDefaults = record(raw.defaults);
  const originalAutomation = record(raw.automation);
  const originalCharacters = record(raw.characters);
  const routes = Object.fromEntries(purposes.map((purpose): [Purpose, ImageRoute] => {
    const current = record(originalPurposes[purpose]);
    const fallback = defaults.purposes[purpose];
    return [purpose, {
      checkpoint: str(current.checkpoint, fallback.checkpoint) || fallback.checkpoint,
      family: pick(["sdxl-illustrious", "sdxl-noobai", "flux-dev"], current.family, fallback.family),
      quality: pick(["base", "hires"] as const, current.quality, fallback.quality),
      aspect: pick([...ASPECTS, "auto"] as const, current.aspect, fallback.aspect),
      shot: pick(shots, current.shot, fallback.shot),
      placement: pick(placements, current.placement, fallback.placement),
      candidates: Math.round(num(current.candidates, fallback.candidates, 1, 4)),
      extraPositive: str(current.extraPositive, fallback.extraPositive),
      extraNegative: str(current.extraNegative, fallback.extraNegative),
      safeMode: pick(["inherit", "on", "off"] as const, current.safeMode, fallback.safeMode),
      directorMayOverride: current.directorMayOverride === true,
    }];
  })) as Record<Purpose, ImageRoute>;
  const characters = Object.fromEntries(Object.entries(originalCharacters).map(([key, item]) => {
    const binding = record(item);
    return [key, {
      appearanceTags: str(binding.appearanceTags), appearanceProse: str(binding.appearanceProse),
      checkpoint: str(binding.checkpoint), loras: sanitizeImageOverride(binding).loras,
      alwaysTags: str(binding.alwaysTags), neverTags: str(binding.neverTags),
      seed: typeof binding.seed === "number" && Number.isFinite(binding.seed) ? binding.seed : null,
    }];
  })) as Record<string, ImageBinding>;
  const loras = Array.isArray(raw.loras) ? raw.loras.filter((item): item is Lora => {
    const entry = record(item);
    return typeof entry.file === "string" && typeof entry.label === "string" && (entry.base === "flux" || entry.base === "illustrious") && typeof entry.weight === "object" && entry.weight !== null;
  }) : [];
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    backend: raw.backend === "comfy" ? "comfy" : "st",
    directorProfileId: str(raw.directorProfileId), comfyUrl: str(raw.comfyUrl),
    contextMessages: Math.round(num(raw.contextMessages, defaults.contextMessages, 1, 30)),
    maxTokens: Math.round(num(raw.maxTokens, defaults.maxTokens, 200, 4000)),
    useJsonSchema: raw.useJsonSchema !== false,
    defaults: {
      quality: pick(["base", "hires"] as const, originalDefaults.quality, "base"),
      seedPolicy: pick(["random", "lockPerMessage", "fixed"] as const, originalDefaults.seedPolicy, "random"),
      fixedSeed: num(originalDefaults.fixedSeed, 1, 0, 2 ** 32 - 1),
    },
    automation: {
      mode: pick(["manual", "story", "everyN", "tool"] as const, originalAutomation.mode, defaults.automation.mode),
      everyN: Math.round(num(originalAutomation.everyN, defaults.automation.everyN, 1, 100)),
    },
    safeMode: raw.safeMode === true, purposes: routes,
    upscalers: Object.fromEntries(Object.entries(record(raw.upscalers)).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    loras, characters,
  };
};
