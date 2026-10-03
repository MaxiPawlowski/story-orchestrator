export type ProfileLocality = "local" | "cloud" | "unknown";

export interface GroupableProfile {
  id: string;
  name: string;
  model?: string;
  kind?: "chat" | "text";
  source?: string;
  apiUrl?: string;
}

export interface ProfileGroup<T extends GroupableProfile> {
  key: string;
  label: string;
  vendor: string;
  locality: ProfileLocality;
  profiles: T[];
}

export const LOCALITY_LABELS: Record<ProfileLocality, string> = { local: "local", cloud: "cloud", unknown: "unknown" };

const VENDOR_LABELS: Record<string, string> = {
  openai: "OpenAI",
  azure_openai: "Azure OpenAI",
  claude: "Anthropic Claude",
  openrouter: "OpenRouter",
  makersuite: "Google AI Studio",
  vertexai: "Google Vertex AI",
  mistralai: "Mistral",
  custom: "Custom (OpenAI-compatible)",
  cohere: "Cohere",
  perplexity: "Perplexity",
  groq: "Groq",
  deepseek: "DeepSeek",
  xai: "xAI",
  moonshot: "Moonshot",
  fireworks: "Fireworks",
  zai: "Z.ai",
  ai21: "AI21",
  nanogpt: "NanoGPT",
  chutes: "Chutes",
  electronhub: "Electron Hub",
  aimlapi: "AI/ML API",
  pollinations: "Pollinations",
  cometapi: "CometAPI",
  siliconflow: "SiliconFlow",
  workers_ai: "Workers AI",
  minimax: "MiniMax",
  llamacpp: "llama.cpp",
  koboldcpp: "KoboldCpp",
  ollama: "Ollama",
  ooba: "Text Generation WebUI",
  vllm: "vLLM",
  aphrodite: "Aphrodite",
  tabby: "TabbyAPI",
  generic: "Generic text completion",
  mancer: "Mancer",
  togetherai: "Together AI",
  infermaticai: "InfermaticAI",
  dreamgen: "DreamGen",
  featherless: "Featherless",
  huggingface: "Hugging Face",
};

const HOSTED_TEXT = new Set(["mancer", "togetherai", "infermaticai", "dreamgen", "openrouter", "featherless", "huggingface"]);

const PRIVATE_HOST = [
  /^localhost$/, /\.localhost$/, /\.local$/, /^127\./, /^0\.0\.0\.0$/, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^\[?::1\]?$/, /^\[?f[cd][0-9a-f]{2}:/i, /^\[?fe80:/i,
];

const URL_HOST = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/]*@)?(\[[^\]]*\]|[^:/?#]*)/i;

export const hostOf = (url: string): string | null => URL_HOST.exec(url.trim())?.[1]?.toLowerCase() || null;

export const isPrivateHost = (host: string): boolean => PRIVATE_HOST.some((pattern) => pattern.test(host));

export function profileLocality(profile: GroupableProfile): ProfileLocality {
  const host = profile.apiUrl ? hostOf(profile.apiUrl) : null;
  if (profile.kind === "text") {
    if (profile.source && HOSTED_TEXT.has(profile.source)) return "cloud";
    return host && !isPrivateHost(host) ? "cloud" : "local";
  }
  if (profile.kind !== "chat") return "unknown";
  if (profile.source === "custom") return host && isPrivateHost(host) ? "local" : "cloud";
  return "cloud";
}

export const vendorLabel = (source: string | undefined): string => (source ? VENDOR_LABELS[source] ?? source : "Other");

export function groupProfiles<T extends GroupableProfile>(profiles: readonly T[]): ProfileGroup<T>[] {
  const groups = new Map<string, ProfileGroup<T>>();
  for (const profile of profiles) {
    const locality = profileLocality(profile);
    const vendor = vendorLabel(profile.source);
    const key = locality === "unknown" ? "unknown" : `${locality}:${profile.source ?? ""}`;
    const group = groups.get(key) ?? { key, vendor, locality, label: locality === "unknown" ? "Connection profiles" : `${vendor} · ${LOCALITY_LABELS[locality]}`, profiles: [] };
    group.profiles.push(profile);
    groups.set(key, group);
  }
  const rank: Record<ProfileLocality, number> = { local: 0, cloud: 1, unknown: 2 };
  return [...groups.values()].sort((a, b) => rank[a.locality] - rank[b.locality] || a.vendor.localeCompare(b.vendor));
}

export const profileOptionText = (profile: GroupableProfile): string => `${profile.name}${profile.model ? ` (${profile.model})` : ""}`;
