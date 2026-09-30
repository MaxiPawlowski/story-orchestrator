import {
  imageModel, spriteBuiltInExpressionsActive, spriteCast, spriteClassifyLocal, spriteDraftedName, spriteList, spriteMessage, spriteChatLength,
  spriteReducedMotion, spriteVnMode, spriteWriteExpressions, subscribeToHostEvents, capabilityState, type CapabilityState,
} from "@services/STAPI";
import { judgeUseActive } from "@judge/index";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { withholds } from "@runtime/generationLifecycle";
import { log } from "@utils/log";
import { classifyExpressions, NARRATION, type ExpressionDeps, type ExpressionRead } from "./classify";
import { keywordSet, placeSet, readSpriteProfile, readSpriteSets, resolveSprite, spriteIndex, unionLabels, type SpriteProfile, type SpriteSetRule } from "./profile";
import { segmentText, type Segment } from "./segment";
import { spriteActivation, spritesActive, storyDirectsStage, type SpriteActivation, type SpriteSettings } from "./settings";
import { setGlobalSettings } from "@runtime/settingsStore";
import { isRecord } from "@utils/guards";
import { directionKeys, isSpotlit, memberDirection, readStageDirection, type Framing, type StageDirection } from "./direction";

export interface StoredRead {
  i: number;
  who: string;
  face: string;
  src: string;
  at: string;
}

export interface StageActor {
  name: string;
  avatar: string;
  label: string;
  path: string;
  set: string;
  spotlight: boolean;
}

export interface StageView {
  visible: boolean;
  actors: StageActor[];
  speaking: string | null;
  framing: Framing;
  settings: SpriteSettings;
  activation: SpriteActivation;
  capability: CapabilityState | "checking";
  reducedMotion: boolean;
}

interface Actor {
  name: string;
  avatar: string;
  keys: string[];
  profile: SpriteProfile;
  rules: SpriteSetRule[];
  packs: Map<string, Map<string, string>>;
  set: string;
  keyword: string | null;
  label: string;
  path: string;
}

interface Stream {
  chatId: string | null;
  speaker: string;
  segments: Segment[];
  reads: Map<string, ExpressionRead>;
  classifying: Promise<void>;
  streamed: boolean;
}

const PASSAGE_KEY = 48;
const LLM_TIMEOUT_MS = 15_000;
const keyOf = (text: string) => text.slice(0, PASSAGE_KEY);

export class SpriteStage {
  private actors: Actor[] = [];
  private speaking: string | null = null;
  private stream: Stream | null = null;
  private listeners = new Set<() => void>();
  private loading = 0;
  private playback: ReturnType<typeof setTimeout>[] = [];
  private snapshot: StageView;
  private capability: CapabilityState | "checking" = "checking";

  constructor(private readonly manager: RuntimeManager) {
    this.snapshot = this.compose();
  }

  private settings(): SpriteSettings {
    return this.manager.getGlobalSettings().sprites;
  }

  view = (): StageView => this.snapshot;

  updateSettings(patch: Partial<SpriteSettings>): void {
    setGlobalSettings({ sprites: patch });
    this.notify();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private directs: { story: unknown; value: boolean } = { story: null, value: false };

  activation(): SpriteActivation {
    const story = this.manager.getStory();
    if (story !== this.directs.story) this.directs = { story, value: storyDirectsStage(story) };
    return spriteActivation(this.settings(), this.directs.value);
  }

  private compose(): StageView {
    const settings = this.settings();
    const activation = this.activation();
    const shown = spritesActive(activation) && settings.stage !== "off" && (settings.stage === "always" || spriteVnMode()) && !spriteBuiltInExpressionsActive();
    const direction = this.direction();
    const actors = this.actors
      .filter((actor) => !memberDirection(direction, actor.keys).hidden)
      .map(({ name, avatar, label, path, set, keys }) => ({ name, avatar, label, path, set, spotlight: isSpotlit(direction, keys) }));
    return {
      visible: shown && actors.length > 0,
      actors,
      speaking: this.speaking,
      framing: direction?.framing ?? "full",
      settings,
      activation,
      capability: this.capability,
      reducedMotion: spriteReducedMotion(),
    };
  }

  notify = () => {
    this.snapshot = this.compose();
    for (const listener of this.listeners) listener();
  };

  start(): () => void {
    const off = subscribeToHostEvents([
      { eventName: "CHAT_CHANGED", handler: () => void this.reload() },
      { eventName: "GROUP_UPDATED", handler: () => void this.reload() },
      { eventName: "CHARACTER_EDITED", handler: () => void this.reload() },
      { eventName: "GROUP_MEMBER_DRAFTED", handler: (id: unknown) => this.begin(typeof id === "number" || Array.isArray(id) ? spriteDraftedName(id as number | [number]) : null) },
      { eventName: "GENERATION_STARTED", handler: (type: unknown, _params: unknown, dryRun: unknown) => this.generationStarted(type, dryRun) },
      { eventName: "STREAM_TOKEN_RECEIVED", handler: (text: unknown) => { if (typeof text === "string") this.feed(text, false); } },
      { eventName: "CHARACTER_MESSAGE_RENDERED", handler: (id: unknown, type: unknown) => { if (typeof id === "number") void this.rendered(id, typeof type === "string" ? type : undefined); } },
      { eventName: "MESSAGE_SWIPED", handler: () => this.replay() },
      { eventName: "MESSAGE_DELETED", handler: () => this.replay() },
      { eventName: "SETTINGS_UPDATED", handler: this.notify },
    ]);
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(this.notify);
    observer?.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    const offStory = this.manager.subscribe(() => this.placeChanged());
    const click = (event: MouseEvent) => this.clicked(event);
    document.addEventListener("click", click);
    void this.reload();
    return () => {
      off();
      offStory();
      observer?.disconnect();
      document.removeEventListener("click", click);
      this.stopPlayback();
    };
  }

  async reload(): Promise<void> {
    const ticket = ++this.loading;
    this.capability = await capabilityState("sprites");
    if (ticket !== this.loading) return;
    if (this.capability === "absent") {
      this.actors = [];
      this.stream = null;
      this.notify();
      return;
    }
    const cast = spriteCast();
    const actors: Actor[] = [];
    for (const member of cast.members) {
      const folderGuess = member.avatar.replace(/\.[^.]+$/, "");
      const profile = readSpriteProfile(member.profile, folderGuess);
      if (!profile) continue;
      const rules = readSpriteSets(member.profile);
      const packs = new Map<string, Map<string, string>>();
      for (const rule of rules) {
        const pack = spriteIndex(await spriteList(rule.id === "default" ? profile.folder : `${profile.folder}/${rule.id}`));
        if (ticket !== this.loading) return;
        if (pack.size) packs.set(rule.id, pack);
      }
      const defaults = packs.get("default");
      const first = defaults ? resolveSprite(profile, profile.default, defaults) : null;
      if (!first) continue;
      actors.push({
        name: member.name, avatar: member.avatar, keys: this.keysFor(member.name), profile, rules: rules.filter((rule) => packs.has(rule.id)), packs,
        set: "default", keyword: null, label: first.label, path: first.path,
      });
    }
    this.actors = actors;
    this.placeKey = "";
    this.chooseSets();
    this.stream = null;
    this.replay();
  }

  private placeKey = "";

  private keysFor(name: string): string[] {
    const roster = this.manager.getStory()?.roster ?? [];
    const ids = roster.filter((member) => (member.name ?? member.id).toLowerCase() === name.toLowerCase()).map((member) => member.id);
    return directionKeys(name, ids);
  }

  private direction(): StageDirection | null {
    const story = this.manager.getStory();
    const id = this.manager.getSnapshot().activeCheckpointId;
    const effects = id ? story?.checkpointById[id]?.effects : undefined;
    return isRecord(effects) ? readStageDirection(effects.stage) : null;
  }

  private directedFace(actor: Actor, direction = this.direction()): string {
    return memberDirection(direction, actor.keys).face ?? actor.profile.default;
  }

  private place(): { location: string | null; checkpoint: string | null } {
    const snapshot = this.manager.getSnapshot();
    const location = snapshot.blackboard?.location;
    return { location: typeof location === "string" ? location : null, checkpoint: snapshot.activeCheckpointId };
  }

  private placeChanged(): void {
    if (this.activation() !== this.snapshot.activation) this.notify();
    if (!this.actors.length) return;
    const place = this.place();
    if (`${place.location}|${place.checkpoint}` === this.placeKey) return;
    if (this.chooseSets()) this.notify();
  }

  private chooseSets(text?: string): boolean {
    const place = this.place();
    const key = `${place.location}|${place.checkpoint}`;
    const moved = key !== this.placeKey;
    this.placeKey = key;
    const direction = this.direction();
    let changed = false;
    for (const actor of this.actors) {
      if (moved) actor.keyword = null;
      if (text) actor.keyword = keywordSet(actor.rules, text) ?? actor.keyword;
      const directed = memberDirection(direction, actor.keys);
      const wanted = [directed.set, actor.keyword, placeSet(actor.rules, place)].find((id) => id && actor.packs.has(id)) ?? "default";
      const face = moved && directed.face ? directed.face : actor.label;
      if (wanted === actor.set && face === actor.label) continue;
      actor.set = wanted;
      this.setFace(actor.name, face);
      changed = true;
    }
    if (moved) {
      const lit = this.actors.find((actor) => isSpotlit(direction, actor.keys));
      if (lit) this.speaking = lit.name;
      changed = true;
    }
    return changed;
  }

  private actor(name: string | null): Actor | undefined {
    return name ? this.actors.find((actor) => actor.name === name) : undefined;
  }

  private setFace(name: string, label: string): void {
    const actor = this.actor(name);
    if (!actor) return;
    const resolved = resolveSprite(actor.profile, label, actor.packs.get(actor.set) ?? actor.packs.get("default") ?? new Map<string, string>());
    if (!resolved) return;
    actor.label = resolved.label;
    actor.path = resolved.path;
  }

  private apply(read: { who: string; face: string }, speaker: string): void {
    const who = read.who === NARRATION ? speaker : read.who;
    if (this.actor(who)) {
      this.setFace(who, read.face);
      this.speaking = who;
    } else if (this.actor(speaker)) {
      this.speaking = speaker;
    }
    this.notify();
  }

  replay(): void {
    this.stopPlayback();
    const direction = this.direction();
    for (const actor of this.actors) this.setFace(actor.name, this.directedFace(actor, direction));
    const seen = new Set<string>();
    let speaking: string | null = null;
    for (let id = spriteChatLength() - 1; id >= 0 && seen.size < this.actors.length; id -= 1) {
      const message = spriteMessage(id);
      if (!message || message.isUser || message.isSystem) continue;
      const reads = storedReads(message.expressions);
      for (const read of [...reads].reverse()) {
        const who = read.who === NARRATION ? message.name : read.who;
        speaking ??= this.actor(who) ? who : null;
        if (seen.has(who) || !this.actor(who)) continue;
        seen.add(who);
        this.setFace(who, read.face);
      }
      speaking ??= this.actor(message.name) ? message.name : null;
      if (this.actor(message.name)) seen.add(message.name);
    }
    this.speaking = speaking;
    this.notify();
  }

  private generationStarted(type: unknown, dryRun: unknown): void {
    if (dryRun === true || withholds(type)) return;
    const cast = spriteCast();
    if (!cast.groupId && cast.members[0]) this.begin(cast.members[0].name);
  }

  private begin(speaker: string | null): void {
    if (!speaker) return;
    this.stopPlayback();
    this.stream = { chatId: spriteCast().chatId, speaker, segments: [], reads: new Map(), classifying: Promise.resolve(), streamed: false };
    if (this.actor(speaker)) {
      this.speaking = speaker;
      this.notify();
    }
  }

  private feed(text: string, final: boolean): void {
    const stream = this.stream;
    if (!stream || !spritesActive(this.activation()) || !this.actors.length) return;
    if (!final) stream.streamed = true;
    const segments = segmentText(text, this.settings().segmentChars, final);
    const fresh = segments.filter((segment) => !stream.reads.has(keyOf(segment.text)) && !stream.segments.some((known) => keyOf(known.text) === keyOf(segment.text)));
    if (!fresh.length) return;
    stream.segments.push(...fresh);
    stream.classifying = stream.classifying.then(() => this.classify(stream, fresh));
  }

  private async classify(stream: Stream, segments: Segment[]): Promise<void> {
    if (this.stream !== stream) return;
    const profiles = this.actors.map((actor) => actor.profile);
    const labels = unionLabels(profiles);
    const localMap = Object.assign({}, ...profiles.map((profile) => profile.localMap)) as Record<string, string>;
    const base = stream.segments.length - segments.length;
    const reads = await classifyExpressions({
      speaker: stream.speaker,
      cast: this.actors.map((actor) => actor.name),
      labels,
      localMap,
      fallbackLabel: this.actor(stream.speaker)?.profile.default ?? profiles[0]?.default ?? "neutral",
      segments: segments.map((segment, offset) => ({ index: base + offset + 1, text: segment.text })),
    }, this.deps());
    if (this.stream !== stream || spriteCast().chatId !== stream.chatId) return;
    reads.forEach((read, offset) => {
      stream.reads.set(keyOf(segments[offset].text), read);
      if (!stream.streamed) return;
      this.chooseSets(segments[offset].text);
      this.apply(read, stream.speaker);
    });
  }

  private deps(): ExpressionDeps {
    const global = this.manager.getGlobalSettings();
    const judge = this.manager.getJudge();
    const profileId = global.sprites.profileId || global.image.directorProfileId;
    return {
      judge: judge && judgeUseActive(global.judge, "expressions")
        ? async (request) => (await judge.ask("expressions", request, { timeoutMs: Math.max(global.judge.timeoutMs, 4000) })).answers
        : null,
      llm: profileId
        ? async (system, user, grammar) => await imageModel(profileId, [{ role: "system", content: system }, { role: "user", content: user }], 160, grammar, AbortSignal.timeout(LLM_TIMEOUT_MS))
        : null,
      local: spriteClassifyLocal,
      warn: (step, error) => log.warn(`Sprite expressions: ${step} failed`, error),
    };
  }

  private async rendered(id: number, type?: string): Promise<void> {
    if (type === "first_message" || type === "extension") return;
    const message = spriteMessage(id);
    if (!message || message.isUser || message.isSystem || !this.actors.length) return;
    const stored = storedReads(message.expressions);
    if (stored.length && (!this.stream || this.stream.speaker !== message.name)) {
      this.replay();
      return;
    }
    if (!this.stream || this.stream.speaker !== message.name) this.begin(message.name);
    const stream = this.stream;
    if (!stream) return;
    this.feed(message.text, true);
    await stream.classifying;
    if (this.stream !== stream) return;
    const finals = segmentText(message.text, this.settings().segmentChars, true);
    const reads: StoredRead[] = finals.flatMap((segment, index) => {
      const read = stream.reads.get(keyOf(segment.text));
      return read ? [{ i: index + 1, who: read.who, face: read.face, src: read.source, at: keyOf(segment.text) }] : [];
    });
    if (!stream.streamed) {
      this.chooseSets(message.text);
      this.play(reads, finals, stream.speaker);
    }
    else if (reads.length) this.apply(reads[reads.length - 1], stream.speaker);
    this.stream = null;
    if (reads.length && stream.chatId) {
      const saved = await spriteWriteExpressions(stream.chatId, id, reads);
      if (!saved.ok) log.warn("Sprite expressions not stored", saved.reason);
    }
  }

  private play(reads: StoredRead[], segments: Segment[], speaker: string): void {
    this.stopPlayback();
    let at = 0;
    reads.forEach((read, index) => {
      this.playback.push(setTimeout(() => this.apply(read, speaker), at));
      at += Math.min(6000, Math.max(1200, (segments[index]?.text.length ?? 0) * 30));
    });
  }

  private stopPlayback(): void {
    for (const timer of this.playback) clearTimeout(timer);
    this.playback = [];
  }

  private clicked(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const text = target?.closest(".mes_text");
    const row = target?.closest(".mes");
    if (!text || !row || !this.actors.length) return;
    const message = spriteMessage(Number(row.getAttribute("mesid")));
    if (!message) return;
    const clicked = (target?.closest("p, q, em, i, span") ?? target)?.textContent?.trim() ?? "";
    const reads = storedReads(message.expressions);
    const probe = clicked.replace(/["*]/g, "").slice(0, 24);
    const hit = probe ? reads.find((read) => read.at.replace(/["*]/g, "").includes(probe) || probe.includes(read.at.replace(/["*]/g, "").slice(0, 24))) : undefined;
    if (hit) {
      this.stopPlayback();
      this.apply(hit, message.name);
    }
  }
}

export function storedReads(value: unknown): StoredRead[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is StoredRead => Boolean(entry) && typeof entry === "object"
    && typeof (entry as StoredRead).who === "string" && typeof (entry as StoredRead).face === "string")
    .map((entry) => ({ ...entry, at: typeof entry.at === "string" ? entry.at : "" }));
}
