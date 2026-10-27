import type { SpriteCastMember } from "@services/stHost/sprites";
import type { SpriteInventoryEntry } from "@runtime/spriteStageHealth";
import { frameIndex, type AnimationFrames } from "./animation";
import { readSpriteProfile, readSpriteSets, resolveSprite, spriteIndex, type SpriteFile, type SpriteProfile, type SpriteSetRule } from "./profile";
import type { SpriteSettings } from "./settings";
import type { VisualSources, VisualManifest } from "./visualManifest";
import type { StageIdentity } from "./packs/stageLooks";
import { log } from "@utils/log";

export interface Actor {
  name: string;
  avatar: string;
  keys: string[];
  muted: boolean;
  profile: SpriteProfile;
  rules: SpriteSetRule[];
  packs: Map<string, Map<string, string>>;
  frames: Map<string, Map<string, AnimationFrames>>;
  set: string;
  keyword: string | null;
  label: string;
  path: string;
  desiredLabel: string;
  generatedLook?: string;
  lookError?: string;
  lookStamp?: string;
  pose?: string;
  poseReads?: import("./poses/stageChoice").PoseRead[];
  bodies?: import("./poses/layers").CachedBody[];
  renderedStamp?: string;
  identity?: { pack: string; looks: Record<string, { set: string }> };
}

export type MemberGap = { name: string; folder: string; muted: boolean; reason: "no-profile" | "no-default" | "no-face" | "stale-source"; face?: string };

export interface CastLoad {
  actors: Actor[];
  gaps: MemberGap[];
}

type Lister = (folder: string) => Promise<SpriteFile[]>;

export class SpriteListCache {
  private chatId: string | null = null;
  private lists = new Map<string, Promise<SpriteFile[]>>();

  constructor(private readonly list: Lister) {}

  get(chatId: string | null, folder: string): Promise<SpriteFile[]> {
    if (chatId !== this.chatId) this.clear(chatId);
    const known = this.lists.get(folder);
    if (known) return known;
    const pending = this.list(folder).catch((error: unknown) => {
      this.lists.delete(folder);
      throw error;
    });
    this.lists.set(folder, pending);
    return pending;
  }

  clear(chatId: string | null = this.chatId): void {
    this.chatId = chatId;
    this.lists = new Map();
  }
}

export interface CastLoadDeps {
  list: (folder: string) => Promise<SpriteFile[]>;
  keysFor: (name: string) => string[];
  builders: SpriteSettings["builders"];
  bodies?: (folder: string) => Promise<import("@services/stHost/media").SpriteManifest[]>;
  storyId?: string;
  sources?: VisualSources;
  verifySource?(source: VisualManifest): Promise<void>;
  identity?(member: SpriteCastMember): Promise<StageIdentity | null>;
}

async function loadMember(member: SpriteCastMember, deps: CastLoadDeps): Promise<Actor | MemberGap> {
  const accepted = deps.sources?.[member.folder];
  if (accepted && deps.verifySource) {
    try { await deps.verifySource(accepted); }
    catch (error) { log.warn("prepared cast source is stale", error); return { name: member.name, folder: member.folder, muted: member.muted, reason: "stale-source" }; }
  }
  const identity = deps.identity ? await deps.identity(member).catch((error: unknown) => { log.warn("visual pack for the stage is unavailable", error); return null; }) : null;
  const profile = readSpriteProfile(member.profile, member.folder) ?? (accepted || identity ? {
    folder: member.folder, default: "neutral", labels: Object.fromEntries(["neutral", "happy", "angry", "worried"].map((label) =>
      [label, { what: label, notFor: "", examples: [], fallback: label === "neutral" ? [] : ["neutral"] }])), localMap: {},
  } : null);
  if (!profile) return { name: member.name, folder: member.folder, muted: member.muted, reason: "no-profile" };
  const rules = readSpriteSets(member.profile);
  const generated = deps.builders[profile.folder]?.baseSet;
  if (generated && !rules.some((rule) => rule.id === generated)) rules.push({ id: generated, places: [], checkpoints: [], keywords: [] });
  const listed = await Promise.all(rules.map(async (rule) => {
    const [files, frames] = await Promise.all([
      deps.list(rule.id === "default" ? accepted ? `${profile.folder}/${accepted.baseSet}` : profile.folder : `${profile.folder}/${rule.id}`),
      deps.list(`${profile.folder}/anim-${rule.id === "default" && accepted ? accepted.baseSet : rule.id}`),
    ]);
    return { rule, pack: spriteIndex(files), frames: frameIndex(frames) };
  }));
  const packs = new Map<string, Map<string, string>>();
  const frames = new Map<string, Map<string, AnimationFrames>>();
  for (const entry of listed) {
    if (entry.pack.size) packs.set(entry.rule.id, entry.pack);
    frames.set(entry.rule.id, entry.frames);
  }
  if (identity) {
    if (!packs.has("default") && identity.defaultFiles) packs.set("default", identity.defaultFiles);
    for (const look of Object.values(identity.looks)) packs.set(look.set, look.files);
  }
  const defaults = packs.get("default");
  if (!defaults) return { name: member.name, folder: profile.folder, muted: member.muted, reason: "no-default" };
  const first = resolveSprite(profile, profile.default, defaults);
  if (!first) return { name: member.name, folder: profile.folder, muted: member.muted, reason: "no-face", face: profile.default };
  const bodies: NonNullable<Actor["bodies"]> = [];
  if (deps.bodies && deps.storyId) for (const manifest of await deps.bodies(profile.folder).catch(() => [])) {
    if (!/^lp_[a-f0-9]{8}$/.test(manifest.set)) continue;
    const body = Object.values(manifest.labels).find((row) => row.status === "complete")?.inputs?.body;
if (!body || body.story !== deps.storyId || !deps.keysFor(member.name).includes(body.member.toLowerCase()) || typeof body.look !== "string" ||
      typeof body.pose !== "string" || !Array.isArray(body.tags)) continue;
    const files = await deps.list(`${profile.folder}/${manifest.set}`);
    const owned = files.filter((file) => manifest.labels[file.label]?.status === "complete");
    const pack = spriteIndex(owned);
    if (!pack.size) continue;
    packs.set(manifest.set, pack);
    frames.set(manifest.set, frameIndex(await deps.list(`${profile.folder}/anim-${manifest.set}`)));
    bodies.push({ ...body, set: manifest.set });
  }
  return {
    name: member.name, avatar: member.avatar, keys: deps.keysFor(member.name), muted: member.muted, profile, rules: rules.filter((rule) => packs.has(rule.id)), packs, frames,
    set: "default", keyword: null, label: first.label, desiredLabel: first.label, path: first.path, bodies,
    ...(identity ? { identity: { pack: identity.pack, looks: Object.fromEntries(Object.entries(identity.looks).map(([signature, look]) => [signature, { set: look.set }])) } } : {}),
  };
}

export async function loadCast(members: SpriteCastMember[], deps: CastLoadDeps): Promise<CastLoad> {
  const loaded = await Promise.all(members.map((member) => loadMember(member, deps)));
  const actors = loaded.filter((entry): entry is Actor => "avatar" in entry);
  const gaps = loaded.filter((entry): entry is MemberGap => !("avatar" in entry));
  return { actors, gaps };
}

export function castInventory(actors: readonly Actor[]): Record<string, SpriteInventoryEntry> {
  return Object.fromEntries(actors.map((actor) => [actor.name.toLowerCase(), {
    sets: [...actor.packs.keys()].sort(),
    faces: [...new Set([...actor.packs.values()].flatMap((pack) => [...pack.keys()]))].sort(),
  }]));
}
