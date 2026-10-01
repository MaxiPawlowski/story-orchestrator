import { isHostGenerating, listConnectionProfiles, getScannableEntries } from "@services/STAPI";
import {
  imageChat, imageModel, imageRender, imageSave, imageDelete, imagePlace, imageChatSettings, imageWriteChatSettings, imageComfyUrl, type ImageMedia,
} from "@services/stHost/image";
import { reserveGpu, releaseGpu } from "@services/stHost/gpuBroker";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { imageSize, type Aspect } from "./catalog";
import { buildGraph } from "./graph";
import { imageMessages, parseImageReply, sceneForImage, assembleImagePrompt, type ImageRequest, type ImageReply, type ImageScene } from "./prompt";
import { ImageQueue } from "./queue";
import { pickImageCheckpoint, resolveImageRoute, type ImageArgs, type Route } from "./routing";
import { automationAllowsCues, messageAlreadyDrawn, sanitizeImageChatState, sanitizeImageOverride, type ImageOverride, type ImageSettings } from "./settings";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import { worldInfoPlan } from "@runtime/worldInfoGates";
import { visualLore } from "./lore";
import { fnv1a } from "@runtime/hash";

export interface ImagePlan {
  request: ImageRequest;
  chatId: string;
  folder: string;
  target: number | null;
  targetText: string | null;
  route: Route;
  reply: ImageReply | null;
  scene: ImageScene;
  aspect: Aspect;
  positive: string;
  negative: string;
  caption: string;
}
export interface ImageCandidate { path: string; seed: number; width: number; height: number }
export interface ImageStatus { jobs: ReturnType<ImageQueue["snapshot"]>; lastError: string | null; lastPlan: ImagePlan | null }
export type ImageReviewer = (plan: ImagePlan, candidates: ImageCandidate[], rerender: (index: number) => Promise<ImageCandidate>) => Promise<number | null>;

const current = (storyId?: string | null) => sanitizeImageChatState(imageChatSettings(), imageChat()?.id ?? "", storyId);

export class StoryImageDirector {
  readonly queue = new ImageQueue();
  reviewer: ImageReviewer | null = null;
  private lastError: string | null = null;
  private lastPlan: ImagePlan | null = null;
  private listeners = new Set<() => void>();
  private pending = new Set<string>();
  private pendingTargets = new Set<string>();

  constructor(private readonly manager: RuntimeManager) { this.queue.subscribe(() => this.notify()); }

  settings(): ImageSettings { return getGlobalSettings().image; }
  updateSettings(patch: Partial<ImageSettings>): ImageSettings { const settings = setGlobalSettings({ image: patch }).image; this.notify(); return settings; }
  override(): ImageOverride { return current().override; }
  async setOverride(override: ImageOverride): Promise<void> {
    const chatId = imageChat()?.id;
    if (!chatId) throw new Error("Open a chat before changing image preferences.");
    const saved = await imageWriteChatSettings({ ...current(this.manager.getSnapshot().storyId), override: sanitizeImageOverride(override) }, chatId);
    if (!saved.ok) throw new Error(saved.reason);
    this.notify();
  }
  status(): ImageStatus { return { jobs: this.queue.snapshot(), lastError: this.lastError, lastPlan: this.lastPlan }; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { this.listeners.forEach((listener) => listener()); }

  private async cue(kind: "checkpoint" | "scene", at: number | null, name: string): Promise<void> {
    const settings = this.settings();
    const chat = imageChat();
    const snapshot = this.manager.getSnapshot();
    const art = this.manager.getStory()?.illustrations;
    if (!chat || !this.manager.ownsImageChat(chat.id) || !snapshot.ready || !snapshot.requirements.ready || !settings.enabled || this.override().paused
      || !automationAllowsCues(settings.automation.mode) || !art?.[kind === "checkpoint" ? "checkpoints" : "scenes"]) return;
    const key = `${chat.id}:${snapshot.storyId}:${snapshot.storyIdentity.playedVersion}:${kind}:${name}:${snapshot.boundary}`;
    if (this.pending.has(key) || current(snapshot.storyId).emitted.includes(key)) return;
    if (messageAlreadyDrawn(chat, at)) return;
    const target = at === null ? null : `${chat.id}:${at}`;
    if (target && this.pendingTargets.has(target)) return;
    this.pending.add(key);
    if (target) this.pendingTargets.add(target);
    try {
      await this.direct({ purpose: "scene", text: kind === "checkpoint" ? `Establishing shot of ${name}.` : `The scene moves to ${name}.`, messageId: at }, {}, key);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.notify();
    } finally {
      this.pending.delete(key);
      if (target) this.pendingTargets.delete(target);
    }
  }

  start(): () => void {
    let initialChat: string | null = null;
    const off = [
      this.manager.subscribe(() => {
        const chat = imageChat();
        const snapshot = this.manager.getSnapshot();
        if (!chat || !this.manager.ownsImageChat(chat.id) || !snapshot.ready || snapshot.boundary !== 0 || initialChat === chat.id) return;
        initialChat = chat.id;
        void this.cue("checkpoint", null, snapshot.activeCheckpointName ?? "opening scene");
      }),
      this.manager.onBoundary((result) => {
        if (result.fired) void this.cue("checkpoint", result.context.lastMessageId, this.manager.getSnapshot().activeCheckpointName ?? result.activeCheckpointId);
      }),
      this.manager.onSceneBreakConfirmed((audit) => {
        if (audit.sceneBreak?.reason && audit.sceneBreak.reason !== "cast") void this.cue("scene", audit.window.to, audit.sceneBreak.reason);
      }),
      this.manager.onRollback(() => this.queue.cancelAll()),
      this.manager.onEpochChanged(() => { this.pending.clear(); this.pendingTargets.clear(); this.queue.cancelAll(); }),
    ];
    return () => { off.forEach((unsubscribe) => unsubscribe()); this.queue.cancelAll(); };
  }

  async onReply(messageId: number, type: unknown): Promise<void> {
    const settings = this.settings();
    if (!settings.enabled || this.override().paused || settings.automation.mode !== "everyN" || type === "extension" || type === "first_message") return;
    const chat = imageChat();
    const message = chat?.messages[messageId];
    if (!chat || !this.manager.ownsImageChat(chat.id) || !message || message.is_user || message.is_system) return;
    const state = current(this.manager.getSnapshot().storyId);
    const count = state.automationCount + 1;
    const saved = await imageWriteChatSettings({ ...state, automationCount: count }, chat.id);
    if (!saved.ok) { this.lastError = saved.reason; this.notify(); return; }
    if (count % settings.automation.everyN !== 0) return;
    if (messageAlreadyDrawn(chat, messageId)) return;
    const target = `${chat.id}:${messageId}`;
    if (this.pendingTargets.has(target)) return;
    this.pendingTargets.add(target);
    try { await this.direct({ purpose: "scene", text: "", messageId }); }
    catch { this.notify(); }
    finally { this.pendingTargets.delete(target); }
  }

  async plan(request: ImageRequest, args: ImageArgs = {}): Promise<ImagePlan> {
    const chat = imageChat();
    if (!chat) throw new Error("Open a chat before generating an image.");
    const settings = this.settings();
    const snapshot = this.manager.getSnapshot();
    const ownsStory = this.manager.ownsImageChat(chat.id) && snapshot.ready;
    const scene = sceneForImage(chat, request, settings.contextMessages, ownsStory ? snapshot.activeCheckpointName : null, ownsStory ? snapshot.scene?.facts?.location ?? null : null);
    const story = ownsStory ? this.manager.getStory() : null;
    if (story?.illustrations) {
      scene.visualStyle = story.illustrations.style;
      scene.subjects = scene.subjects.map((subject) => {
        const member = story.roster.find((entry) => entry.name?.toLowerCase() === subject.name.toLowerCase());
        const appearance = member && story.illustrations?.appearances?.[member.id];
        return appearance ? { ...subject, appearance } : subject;
      });
    }
    if (story && snapshot.requirements.ready) {
      const scoped = [...(story.requirements?.lorebooks ?? []), ...(story.lore_select?.lorebooks ?? [])];
      const gates = worldInfoPlan(story, this.manager.getEngineState()?.visitedPath ?? []);
      const entries = await getScannableEntries();
      scene.visualDetails = visualLore(entries, [...scoped, ...gates.map((gate) => gate.lorebook)], gates, [request.text, ...scene.messages.map((row) => row.text), scene.location ?? ""].join("\n"));
    }
    const focus = chat.characters.find((character) => character.key === scene.focus);
    const binding = focus ? settings.characters[focus.key] ?? null : null;
    let route = resolveImageRoute(settings, request.purpose, args, this.override(), binding);
    let reply: ImageReply | null = null;
    if (!request.raw) {
      if (!settings.directorProfileId || !listConnectionProfiles().some((profile) => profile.id === settings.directorProfileId)) throw new Error("Select an image director connection profile.");
      const messages = imageMessages(request, scene, route);
      let raw = await imageModel(settings.directorProfileId, messages, settings.maxTokens);
      try {
        reply = parseImageReply(raw, route);
      } catch {
        raw = await imageModel(settings.directorProfileId, [
          ...messages, { role: "assistant", content: raw },
          { role: "user", content: "The image JSON was invalid. Return one valid JSON object with the requested fields." },
        ], settings.maxTokens);
        reply = parseImageReply(raw, route);
      }
      route = pickImageCheckpoint(route, reply.checkpoint);
    }
    const aspect = route.aspect !== "auto" ? route.aspect : reply?.aspect ?? (request.purpose === "background" ? "wide" : "portrait");
    const assembled = assembleImagePrompt(route, reply, request.text);
    if (!assembled.positive.trim()) throw new Error("There is nothing to draw.");
    const plan = {
      request, chatId: chat.id, folder: chat.folder, target: scene.target,
      targetText: scene.target === null ? null : chat.messages[scene.target]?.mes ?? null,
      route, reply, scene, aspect, positive: assembled.positive, negative: assembled.negative,
      caption: reply?.caption || request.text.slice(0, 120) || scene.checkpoint || "Story illustration",
    };
    this.lastPlan = plan;
    this.notify();
    return plan;
  }

  private seed(plan: ImagePlan, index: number, override?: number): number {
    const settings = this.settings().defaults;
    if (override !== undefined) return override;
    if (plan.route.seed !== null) return plan.route.seed;
    if (settings.seedPolicy === "fixed") return settings.fixedSeed;
    if (settings.seedPolicy === "lockPerMessage") return Number.parseInt(fnv1a(`${plan.chatId}:${plan.target}:${index}`), 16);
    return Math.floor(Math.random() * 2 ** 32);
  }

  private async idle(signal: AbortSignal) {
    const deadline = Date.now() + 120_000;
    while (isHostGenerating()) {
      if (signal.aborted) throw new DOMException("Image cancelled", "AbortError");
      if (Date.now() > deadline) throw new Error("The text turn has not finished yet.");
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  private async render(plan: ImagePlan, index: number, signal: AbortSignal, override?: number): Promise<ImageCandidate> {
    const seed = this.seed(plan, index, override);
    const size = plan.route.family.sizes[plan.aspect];
    const image = await imageRender(imageComfyUrl(this.settings().comfyUrl), buildGraph({
      checkpoint: plan.route.checkpoint, family: plan.route.family, loras: plan.route.loras.map((lora) => ({ file: lora.entry.file, weight: lora.weight })),
      positive: plan.positive, negative: plan.negative, size, seed,
      hires: plan.route.quality === "hires", upscaler: this.settings().upscalers[plan.route.family.id] || plan.route.family.upscaler,
    }), signal);
    if (signal.aborted) throw new DOMException("Image cancelled", "AbortError");
    const path = await imageSave(image.data, image.format, plan.folder, `director_${Date.now()}_${seed}`);
    return { path, seed, ...imageSize(plan.route.family, plan.aspect, plan.route.quality === "hires" ? plan.route.checkpoint.hires : null) };
  }

  async direct(request: ImageRequest, args: ImageArgs = {}, cueKey?: string): Promise<string> {
    try {
      const plan = await this.plan(request, args);
      const count = cueKey ? 1 : plan.route.candidates;
      const candidates = await this.queue.enqueue(`${plan.route.purpose} · ${plan.route.checkpoint.label}`, async (signal) => {
        await this.idle(signal);
        const reservation = await reserveGpu(signal);
        try {
          const images: ImageCandidate[] = [];
          for (let index = 0; index < count; index += 1) images.push(await this.render(plan, index, signal));
          return images;
        } finally {
          const release = await releaseGpu(reservation.lease);
          if (reservation.brokered && !release.ok) this.lastError = release.reason;
        }
      });
      let chosen = 0;
      if (count > 1) {
        const review = this.reviewer ?? (await import("./ReviewGrid")).reviewImages;
        const result = await review(plan, candidates, async (index) => {
          const fresh = await this.queue.enqueue(`Regenerate image ${index + 1}`, async (signal) => {
            await this.idle(signal);
            const reservation = await reserveGpu(signal);
            try { return await this.render(plan, index, signal, Math.floor(Math.random() * 2 ** 32)); }
            finally { await releaseGpu(reservation.lease); }
          });
          await imageDelete(candidates[index].path);
          candidates[index] = fresh;
          return fresh;
        });
        if (result === null) { await Promise.all(candidates.map((candidate) => imageDelete(candidate.path))); return ""; }
        chosen = result;
      }
      await Promise.all(candidates.filter((_, index) => index !== chosen).map((candidate) => imageDelete(candidate.path)));
      const candidate = candidates[chosen];
      const now = imageChat();
      if (!now || now.id !== plan.chatId || (plan.target !== null && now.messages[plan.target]?.mes !== plan.targetText)) return candidate.path;
      const media: ImageMedia = {
        url: candidate.path, type: "image", title: plan.caption, source: "generated",
        image_director: {
          purpose: plan.route.purpose, checkpoint: plan.route.checkpoint.file, seed: candidate.seed,
          size: { width: candidate.width, height: candidate.height }, positive: plan.positive,
          negative: plan.negative, reason: plan.reply?.reason ?? "",
        },
      };
      const placed = await imagePlace(plan.chatId, plan.target, plan.caption, media, plan.route.placement);
      if (!placed.ok) throw new Error(placed.reason);
      if (cueKey) {
        if (imageChat()?.id !== plan.chatId) return candidate.path;
        const storyId = this.manager.getSnapshot().storyId;
        if (!this.manager.ownsImageChat(plan.chatId) || !cueKey.startsWith(`${plan.chatId}:${storyId}:`)) return candidate.path;
        const state = current(storyId);
        const saved = await imageWriteChatSettings({ ...state, emitted: [...state.emitted, cueKey].slice(-100) }, plan.chatId);
        if (!saved.ok) throw new Error(saved.reason);
      }
      this.lastError = null;
      this.notify();
      return candidate.path;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.notify();
      throw error;
    }
  }
}
