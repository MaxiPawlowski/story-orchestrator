import type { SpriteCastMember } from "@services/stHost/sprites";
import type { SpriteInventoryEntry } from "@runtime/spriteStageHealth";
import { frameIndex, type AnimationFrames } from "./animation";
import { readSpriteProfile, readSpriteSets, resolveSprite, spriteIndex, type SpriteFile, type SpriteProfile, type SpriteSetRule } from "./profile";
import type { SpriteSettings } from "./settings";

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
}

export type MemberGap = { name: string; folder: string; muted: boolean; reason: "no-profile" | "no-default" | "no-face"; face?: string };

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
}

async function loadMember(member: SpriteCastMember, deps: CastLoadDeps): Promise<Actor | MemberGap> {
  const profile = readSpriteProfile(member.profile, member.folder);
  if (!profile) return { name: member.name, folder: member.folder, muted: member.muted, reason: "no-profile" };
  const rules = readSpriteSets(member.profile);
  const generated = deps.builders[profile.folder]?.baseSet;
  if (generated && !rules.some((rule) => rule.id === generated)) rules.push({ id: generated, places: [], checkpoints: [], keywords: [] });
  const listed = await Promise.all(rules.map(async (rule) => {
    const [files, frames] = await Promise.all([
      deps.list(rule.id === "default" ? profile.folder : `${profile.folder}/${rule.id}`),
      deps.list(`${profile.folder}/anim-${rule.id}`),
    ]);
    return { rule, pack: spriteIndex(files), frames: frameIndex(frames) };
  }));
  const packs = new Map<string, Map<string, string>>();
  const frames = new Map<string, Map<string, AnimationFrames>>();
  for (const entry of listed) {
    if (entry.pack.size) packs.set(entry.rule.id, entry.pack);
    frames.set(entry.rule.id, entry.frames);
  }
  const defaults = packs.get("default");
  if (!defaults) return { name: member.name, folder: profile.folder, muted: member.muted, reason: "no-default" };
  const first = resolveSprite(profile, profile.default, defaults);
  if (!first) return { name: member.name, folder: profile.folder, muted: member.muted, reason: "no-face", face: profile.default };
  return {
    name: member.name, avatar: member.avatar, keys: deps.keysFor(member.name), muted: member.muted, profile, rules: rules.filter((rule) => packs.has(rule.id)), packs, frames,
    set: "default", keyword: null, label: first.label, desiredLabel: first.label, path: first.path,
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
