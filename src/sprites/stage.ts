import { subscribeToHostEvents, capabilityState, type CapabilityState } from "@services/STAPI";
import { imageModel } from "@services/stHost/image";
import {
  spriteBuiltInExpressionsActive, spriteCast, spriteClassifyLocal, spriteDraftedName, spriteHint, spriteList, spriteMessage, spriteChatLength,
  spriteReducedMotion, spriteStreamingReply, spriteVnMode, spriteWriteExpressions,
} from "@services/stHost/sprites";
import { judgeUseActive } from "@judge/index";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { withholds } from "@runtime/generationLifecycle";
import { beginRun } from "@runtime/runToken";
import { PLAYER_COPY } from "@runtime/narrative";
import { log } from "@utils/log";
import { classifyExpressions, NARRATION, type ExpressionDeps, type ExpressionRead } from "./classify";
import { cardSet, keywordSet, placeSet, readSpriteProfile, readSpriteSets, resolveSprite, spriteIndex, unionLabels, type SpriteProfile, type SpriteSetRule } from "./profile";
import { cardValues } from "@engine/cardFields";
import { segmentText, visibleReply, type Segment } from "./segment";
import type { SpriteActivation, SpriteSettings } from "./settings";
import { spriteActivation, spritesActive, storyDirectsStage } from "./activation";
import { setGlobalSettings } from "@runtime/settingsStore";
import { isRecord } from "@utils/guards";
import { directionKeys, isSpotlit, memberDirection, readStageDirection, standsOnStage, type Framing, type StageDirection } from "./direction";
import { frameIndex, StreamActivity, type AnimationFrames } from "./animation";
import { publishSpriteLookIssues } from "@runtime/spriteLookHealth";
import { changedLookIssues } from "./lookHealth";
import { storedReads, type StoredRead } from "./storedReads";
export { storedReads, type StoredRead } from "./storedReads";

export interface StageActor {
  name: string;
  avatar: string;
  label: string;
  path: string;
  set: string;
  spotlight: boolean;
  frames?: AnimationFrames;
}

export type StagePlacement = "vn" | "strip";

export interface StageView {
  visible: boolean;
  placement: StagePlacement;
  waitsForVn: boolean;
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

interface Stream {
  chatId: string | null;
  speaker: string;
  segments: Segment[];
  reads: Map<string, ExpressionRead>;
  classifying: Promise<void>;
  streamed: boolean;
  final: boolean;
  visibleText?: string;
}

const PASSAGE_KEY = 48;
const LLM_TIMEOUT_MS = 15_000;
const keyOf = (text: string) => text.slice(0, PASSAGE_KEY);

export class SpriteStage {
  readonly activity = new StreamActivity();
  private actors: Actor[] = [];
  private speaking: string | null = null;
  private stream: Stream | null = null;
  private listeners = new Set<() => void>();
  private loading = 0;
  private playback: ReturnType<typeof setTimeout>[] = [];
  private snapshot: StageView;
  private capability: CapabilityState | "checking" = "checking";
  private hinted = new Set<string>();
  private looks: import("./builder/onDemand").OnDemandLooks | null = null;
  private lookModule: Promise<void> | null = null;

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
    this.manager.notify();
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
    const vn = spriteVnMode();
    const ready = spritesActive(activation) && settings.stage !== "off" && !spriteBuiltInExpressionsActive();
    const direction = this.direction();
    const actors = this.actors
      .filter((actor) => standsOnStage({ keys: actor.keys, muted: actor.muted, speaking: actor.name === this.speaking }, direction))
      .map(({ name, avatar, label, path, set, keys, frames }) => ({ name, avatar, label, path, set, frames: frames.get(set)?.get(label), spotlight: isSpotlit(direction, keys) }));
    return {
      visible: ready && (settings.stage === "always" || vn) && actors.length > 0,
      placement: vn ? "vn" : "strip",
      waitsForVn: ready && settings.stage === "vn" && !vn && actors.length > 0,
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
    this.publishLookIssues();
    this.hintVn();
    for (const listener of this.listeners) listener();
  };

  private publishLookIssues(): void {
    const issues = changedLookIssues(this.manager.getStory(), this.manager.getSnapshot().blackboard, this.settings(), spritesActive(this.activation()), this.actors);
    if (publishSpriteLookIssues(spriteCast().chatId, issues)) this.manager.touch?.();
  }

  private hintVn(): void {
    if (!this.snapshot.waitsForVn || this.snapshot.capability !== "present") return;
    const chatId = spriteCast().chatId;
    if (!chatId || this.hinted.has(chatId)) return;
    this.hinted.add(chatId);
    spriteHint(PLAYER_COPY.spriteNeedsVn);
  }

  start(): () => void {
    const off = subscribeToHostEvents([
      { eventName: "CHAT_CHANGED", handler: () => void this.reload() },
      { eventName: "GROUP_UPDATED", handler: () => void this.reload() },
      { eventName: "CHARACTER_EDITED", handler: () => void this.reload() },
      { eventName: "GROUP_MEMBER_DRAFTED", handler: (id: unknown) => this.begin(typeof id === "number" || Array.isArray(id) ? spriteDraftedName(id as number | [number]) : null) },
      { eventName: "GENERATION_STARTED", handler: (type: unknown, _params: unknown, dryRun: unknown) => this.generationStarted(type, dryRun) },
      { eventName: "STREAM_TOKEN_RECEIVED", handler: () => this.streamToken() },
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
      this.activity.stop();
      this.looks?.close();
    };
  }

  async reload(): Promise<void> {
    this.activity.stop();
    this.looks?.close(); this.looks = null; this.lookModule = null;
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
      const generated = this.settings().builders[profile.folder]?.baseSet;
      if (generated && !rules.some((rule) => rule.id === generated)) rules.push({ id: generated, places: [], checkpoints: [], keywords: [] });
      const packs = new Map<string, Map<string, string>>();
      const frames = new Map<string, Map<string, AnimationFrames>>();
      for (const rule of rules) {
        const pack = spriteIndex(await spriteList(rule.id === "default" ? profile.folder : `${profile.folder}/${rule.id}`));
        if (ticket !== this.loading) return;
        if (pack.size) packs.set(rule.id, pack);
        frames.set(rule.id, frameIndex(await spriteList(`${profile.folder}/anim-${rule.id}`)));
        if (ticket !== this.loading) return;
      }
      const defaults = packs.get("default");
      const first = defaults ? resolveSprite(profile, profile.default, defaults) : null;
      if (!first) continue;
      actors.push({
        name: member.name, avatar: member.avatar, keys: this.keysFor(member.name), muted: member.muted, profile, rules: rules.filter((rule) => packs.has(rule.id)), packs, frames,
        set: "default", keyword: null, label: first.label, desiredLabel: first.label, path: first.path,
      });
    }
    this.actors = actors;
    this.placeKey = "";
    this.chooseSets();
    this.stream = null;
    this.replay();
  }

  private placeKey = "";
  private lookKey = "";

  private lookStamp(): string {
    const story = this.manager.getStory(), values = this.manager.getSnapshot().blackboard;
    return story?.cardFieldByQuality ? JSON.stringify(Object.entries(story.cardFieldByQuality).filter(([, field]) => field.visual).map(([key]) => [key, values[key]])) : "";
  }

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

  private castChanged(): boolean {
    const muted = new Map(spriteCast().members.map((member) => [member.avatar, member.muted]));
    let changed = false;
    for (const actor of this.actors) {
      const now = muted.get(actor.avatar) ?? actor.muted;
      if (now === actor.muted) continue;
      actor.muted = now;
      changed = true;
    }
    return changed;
  }

  private placeChanged(): void {
    this.looks?.revalidate();
    if (this.activation() !== this.snapshot.activation) this.notify();
    if (!this.actors.length) return;
    if (this.castChanged()) this.notify();
    const place = this.place();
    if (`${place.location}|${place.checkpoint}` === this.placeKey && this.lookStamp() === this.lookKey) return;
    if (this.chooseSets()) this.notify();
  }

  private chooseSets(text?: string): boolean {
    const place = this.place();
    const story = this.manager.getStory();
    const values = this.manager.getSnapshot().blackboard;
    const key = `${place.location}|${place.checkpoint}`;
    const moved = key !== this.placeKey;
    this.placeKey = key;
    this.lookKey = this.lookStamp();
    const direction = this.direction();
    let changed = false;
    for (const actor of this.actors) {
      if (moved) actor.keyword = null;
      if (text) actor.keyword = keywordSet(actor.rules, text) ?? actor.keyword;
      const directed = memberDirection(direction, actor.keys);
      const member = story?.roster.find((member) => (member.name ?? member.id).toLowerCase() === actor.name.toLowerCase());
      const fields = member && story ? cardValues(story, values, member.id, true) : {};
      const stamp = JSON.stringify(fields);
      if (actor.lookStamp !== stamp) { actor.lookError = undefined; actor.lookStamp = stamp; }
      const look = cardSet(actor.rules, fields);
      this.requestLook(actor);
      const cached = actor.generatedLook === JSON.stringify(fields) && actor.set.startsWith("look_") ? actor.set : null;
      const pending = Object.keys(fields).length && !look && this.settings().onDemand ? actor.set : null;
      const wanted = [directed.set, look, cached, pending, actor.keyword, placeSet(actor.rules, place)].find((id) => id && actor.packs.has(id)) ?? "default";
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
    actor.desiredLabel = label;
    const resolved = resolveSprite(actor.profile, label, actor.packs.get(actor.set) ?? actor.packs.get("default") ?? new Map<string, string>());
    if (!resolved) return;
    actor.label = resolved.label;
    actor.path = resolved.path;
    this.requestLook(actor);
  }

  private requestLook(actor: Actor): void {
    const story = this.manager.getStory();
    if (!story || !this.settings().onDemand) return;
    const member = story.roster.find((member) => (member.name ?? member.id).toLowerCase() === actor.name.toLowerCase());
    if (!member) return;
    const fields = cardValues(story, this.manager.getSnapshot().blackboard, member.id, true);
    if (!Object.keys(fields).length || cardSet(actor.rules, fields)) return;
    if (!this.looks) {
      const ticket = this.loading;
      if (!this.lookModule) this.lookModule = import("./builder/onDemand").then(({ OnDemandLooks }) => {
        if (ticket !== this.loading) return;
        this.looks = new OnDemandLooks(this.manager);
        for (const current of this.actors) this.requestLook(current);
      });
      return;
    }
    const stamp = JSON.stringify(fields), label = actor.desiredLabel, storyId = this.manager.getSnapshot().storyId;
    if (actor.generatedLook === stamp && actor.set.startsWith("look_") && actor.packs.get(actor.set)?.has(label)) return;
    this.looks.request({ folder: actor.profile.folder, member: member.id, label, fields,
      accepts: () => this.actors.includes(actor) && this.settings().onDemand && this.manager.getSnapshot().storyId === storyId
        && JSON.stringify(cardValues(story, this.manager.getSnapshot().blackboard, member.id, true)) === stamp,
      apply: (set, files, frames) => {
        actor.lookError = undefined;
        actor.packs.set(set, spriteIndex(files));
        if (frames) {
          const index = actor.frames.get(set) ?? new Map<string, AnimationFrames>();
          index.set(label, frames);
          actor.frames.set(set, index);
        }
        if (actor.desiredLabel !== label) return;
        actor.set = set;
        actor.generatedLook = stamp;
        const hit = resolveSprite(actor.profile, label, actor.packs.get(set) ?? new Map());
        if (hit) { actor.path = hit.path; actor.label = hit.label; this.notify(); }
      },
      failed: (reason) => { actor.lookError = reason; this.notify(); },
    });
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
    this.activity.stop();
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
  }

  private begin(speaker: string | null): void {
    if (!speaker) return;
    this.castChanged();
    this.stopPlayback();
    this.stream = { chatId: spriteCast().chatId, speaker, segments: [], reads: new Map(), classifying: Promise.resolve(), streamed: false, final: false };
    if (this.actor(speaker)) {
      this.speaking = speaker;
      this.notify();
    }
  }

  private streamToken(): void {
    const stream = this.stream;
    const reply = stream ? spriteStreamingReply() : null;
    if (!stream || !reply || reply.name !== stream.speaker) return;
    const text = visibleReply(reply.text);
    if (text && text !== stream.visibleText) { stream.visibleText = text; this.activity.pulse(stream.speaker); }
    this.feed(stream, text, false);
  }

  private feed(stream: Stream, text: string, final: boolean): void {
    if (!text || !spritesActive(this.activation()) || !this.actors.length) return;
    if (!final) stream.streamed = true;
    const segments = segmentText(text, this.settings().segmentChars, final);
    const fresh = segments.filter((segment) => !stream.reads.has(keyOf(segment.text)) && !stream.segments.some((known) => keyOf(known.text) === keyOf(segment.text)));
    if (!fresh.length) return;
    stream.segments.push(...fresh);
    stream.classifying = stream.classifying.then(() => this.classify(stream, fresh));
  }

  private async classify(stream: Stream, segments: Segment[]): Promise<void> {
    if (this.stream !== stream && !stream.final) return;
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
    if (spriteCast().chatId !== stream.chatId) return;
    reads.forEach((read, offset) => {
      stream.reads.set(keyOf(segments[offset].text), read);
      if (!stream.streamed || this.stream !== stream) return;
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
    const live = this.stream && this.stream.speaker === message.name && !this.stream.final ? this.stream : null;
    this.activity.stop();
    if (storedReads(message.expressions).length && !live) {
      this.replay();
      return;
    }
    const text = visibleReply(message.text);
    if (!text) {
      if (live) this.stream = null;
      return;
    }
    const run = beginRun(this.manager.getOwnership(), { from: id, to: id });
    if (!live) this.begin(message.name);
    const stream = live ?? this.stream;
    if (!stream) return;
    stream.final = true;
    this.feed(stream, text, true);
    await stream.classifying;
    const finals = segmentText(text, this.settings().segmentChars, true);
    const reads: StoredRead[] = finals.flatMap((segment, index) => {
      const read = stream.reads.get(keyOf(segment.text));
      return read ? [{ i: index + 1, who: read.who, face: read.face, src: read.source, at: keyOf(segment.text) }] : [];
    });
    if (this.stream === stream) {
      if (!stream.streamed) {
        this.chooseSets(text);
        this.play(reads, finals, stream.speaker);
      } else if (reads.length) this.apply(reads[reads.length - 1], stream.speaker);
      this.stream = null;
    }
    if (!reads.length || !stream.chatId) return;
    if (!run.stillOwns()) {
      log.warn("Sprite expressions not stored", run.lapsedDetail());
      return;
    }
    const saved = await spriteWriteExpressions(stream.chatId, id, reads, message.text);
    if (!saved.ok) log.warn("Sprite expressions not stored", saved.reason);
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
