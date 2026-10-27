import { isHostGenerating, listConnectionProfiles, getScannableEntries } from "@services/STAPI";
import { voiceChainPending } from "@runtime/voiceBusy";
import { leaseOutsideTurns } from "../sprites/builder/textPriority";
import {
  imageChat, imageModel, imageSave, imageDelete, imagePlace, imageChatSettings, imageWriteChatSettings, type ImageMedia,
} from "@services/stHost/image";
import { reserveGpu, releaseGpu, gpuBrokerStatus } from "@services/stHost/gpuBroker";
import { loopbackUrl, setImageHealth, type ImageHealthView } from "@runtime/imageHealth";
import { readReplyContext } from "@services/stHost/servedContext";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { imageSize, resolutionProblem, resolveCheckpointFile, resolveUpscaler, type Aspect } from "./catalog";
import { imageServiceReady } from "./service";
import { buildGraph } from "./graph";
import { renderFacts, renderKey } from "./renderFacts";
import { imageMessages, parseImageReply, sceneForImage, assembleImagePrompt, directedTags, joinTags, templateImagePrompt, type ImageRequest, type ImageReply, type ImageScene } from "./prompt";
import { renderStImage, stImageReadiness } from "@services/stHost/stImage";
import { comfyDiscover, comfyRenderOwned, mediaStatus } from "@services/stHost/media";
import { ImageQueue } from "./queue";
import { pickImageCheckpoint, resolveImageRoute, withCheckpointFile, type ImageArgs, type Route } from "./routing";
import { automationAllowsCues, messageAlreadyDrawn, sanitizeImageChatState, sanitizeImageOverride, type AutomaticRoute, type ImageOverride, type ImageSettings } from "./settings";
import { chooseRoute, qwenPrompt, refused, visibleNames, type QwenReadiness, type QwenReady, type RenderRoute, type RouteReason } from "./autoScene";
import { setGlobalSettings } from "@runtime/settingsStore";
import { worldInfoPlan } from "@runtime/worldInfoGates";
import { firedLoreKeys, visualLore } from "./lore";
import { log } from "@utils/log";
import { authoredPlace, backgroundPlace, beatIllustrated, beatLabel, castForImage, cueText, lookFor, sceneCueLabel, stageAlreadySet } from "./cast";
import { fnv1a } from "@runtime/hash";
import { beginRun, type RunGuard } from "@runtime/runToken";
import { busyWork } from "@runtime/busy";
import { bindsPacks, visualRecord, type VisualScene } from "../sprites/packs/scene";
import { pinnedTags, visualMembers, withVisualScene } from "./visualPlan";
import { brokerSettled, withDirectorRetry } from "./directorRetry";
import { discoverWaking } from "../sprites/builder/comfyWake";
import { NEVER_ABORTS } from "@utils/signals";
const workflowKit = () => import("./workflowRender");
const qwenKit = () => import("./autoSceneHost");
const visualBridge = () => import("../sprites/packs/bridgeHost").then((kit) => kit.visualBridge());
const displayedPlace = () => import("@services/stHost/backgrounds").then((kit) => backgroundPlace(kit.getCurrentBackground().name), () => null);

export interface ImagePlan {
  backend: ImageSettings["backend"];
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
  promptSource: "directed" | "template" | "degraded";
  caption: string;
  workflow: string | null;
  visual: VisualScene | null;
  visualIssue: string | null;
  directorIssue: string | null;
  directorFrozen?: true;
  renderRoute: RenderRoute;
  routeReason: RouteReason;
  routeSetting: AutomaticRoute | null;
  qwen: { ready: QwenReady; prompt: string } | null;
}
export interface ImageCandidate { path: string; seed: number; width: number; height: number; waitedMs?: number; qwen?: Record<string, unknown> & { checkpoint: string } }
interface Routing { setting: AutomaticRoute | null; blocked?: RouteReason; check: ((names: string[]) => QwenReadiness) | null }
export interface ImageStatus { jobs: ReturnType<ImageQueue["snapshot"]>; lastError: string | null; lastPlan: ImagePlan | null; workflowNote: string | null }
export type ImageReviewer = (plan: ImagePlan, candidates: ImageCandidate[], rerender: (index: number) => Promise<ImageCandidate>) => Promise<number | null>;

const current = (storyId?: string | null) => sanitizeImageChatState(imageChatSettings(), imageChat()?.id ?? "", storyId);

const sourceOf = (reply: ImageReply | null, wanted: boolean): ImagePlan["promptSource"] => (reply ? "directed" : wanted ? "degraded" : "template");

async function directorReply(profileId: string, messages: Array<{ role: string; content: string }>, maxTokens: number, route: Route): Promise<{ reply: ImageReply | null; issue: string | null }> {
  const once = async () => {
    const raw = await imageModel(profileId, messages, maxTokens);
    try { return parseImageReply(raw, route); } catch {
      return parseImageReply(await imageModel(profileId, [...messages, { role: "assistant", content: raw },
        { role: "user", content: "The image JSON was invalid. Return one valid JSON object with the requested fields." }], maxTokens), route);
    }
  };
  const result = await withDirectorRetry(once, () => brokerSettled(gpuBrokerStatus, () => new Promise((resolve) => setTimeout(resolve, 1_000)), Date.now));
  if (result.issue) log.warn(result.issue, result.error);
  return { reply: result.value, issue: result.issue };
}

async function directorAnswer(request: ImageRequest, frozenAnswer: string | undefined, settings: ImageSettings, messages: () => Array<{ role: string; content: string }>,
  route: Route): Promise<{ reply: ImageReply | null; issue: string | null; frozen: boolean }> {
  if (request.raw) return { reply: null, issue: null, frozen: false };
  if (frozenAnswer !== undefined) return { reply: parseImageReply(frozenAnswer, route), issue: null, frozen: true };
  const offered = settings.directorProfileId && listConnectionProfiles().some((profile) => profile.id === settings.directorProfileId);
  return offered ? { ...await directorReply(settings.directorProfileId, messages(), settings.maxTokens, route), frozen: false } : { reply: null, issue: null, frozen: false };
}

function assemblePlan(backend: ImageSettings["backend"], request: ImageRequest, route: Route, reply: ImageReply | null, drawn: ImageScene, userName: string) {
  const fallback = !request.raw && !reply ? templateImagePrompt(drawn, request.purpose, request.text) : request.text;
  const pinned = request.purpose === "background" ? [] : pinnedTags(drawn, reply);
  const angle = reply?.shot ?? route.shot;
  const hygiene = { names: [...drawn.subjects.map((subject) => subject.name), userName], visible: request.purpose === "background" ? 0 : reply?.visible.length ?? 0,
    keepAngle: angle === "from_below" || angle === "from_above" || /from[ _](below|above)/i.test(request.text) };
  return backend === "st" ? {
    positive: joinTags([...route.positive, ...directedTags(reply, fallback, pinned, hygiene)]),
    negative: joinTags([...route.negative.filter((term) => !term.startsWith("embedding:")), reply?.negative]),
  } : assembleImagePrompt(route, reply, fallback, pinned, hygiene);
}

const QWEN_NEGATIVE = "text, watermark, different character, deformed face";

function pictureRecord(plan: ImagePlan, candidate: ImageCandidate): ImageMedia["image_director"] {
  const qwen = candidate.qwen;
  return {
    purpose: plan.route.purpose, checkpoint: qwen?.checkpoint ?? plan.route.checkpoint.file, seed: candidate.seed,
    size: { width: candidate.width, height: candidate.height }, positive: qwen ? plan.qwen?.prompt ?? "" : plan.positive,
    negative: qwen ? QWEN_NEGATIVE : plan.negative, reason: plan.reply?.reason ?? "", prompt_source: plan.promptSource,
    route: { name: plan.renderRoute, reason: plan.routeReason, ...(plan.routeSetting ? { setting: plan.routeSetting } : {}) },
    ...(candidate.waitedMs !== undefined ? { idle_wait_ms: candidate.waitedMs } : {}), ...(qwen ? { qwen } : {}),
    ...(plan.visual ? { visual: visualRecord(plan.visual) } : {}), ...(plan.visualIssue ? { visual_issue: plan.visualIssue } : {}),
    ...(plan.directorIssue ? { director_issue: plan.directorIssue } : {}), ...(plan.directorFrozen ? { director: "frozen" } : {}),
  };
}

export class StoryImageDirector {
  readonly queue = new ImageQueue();
  reviewer: ImageReviewer | null = null;
  private lastError: string | null = null;
  private lastPlan: ImagePlan | null = null;
  private workflowNote: string | null = null;
  private listeners = new Set<() => void>();
  private pending = new Set<string>();
  private pendingTargets = new Set<string>();
  private pictureCounts = new Map<string, number>();

  constructor(private readonly manager: RuntimeManager) { this.queue.subscribe(() => this.notify()); }

  settings(): ImageSettings { return this.manager.getEffectiveSettings().image; }
  updateSettings(patch: Partial<ImageSettings>): ImageSettings { const settings = setGlobalSettings({ image: patch }).image; void this.refreshHealth(); this.notify(); return settings; }

  private async storyWorkflowHealth(source: string | null): Promise<ImageHealthView["storyWorkflows"]> {
    const story = this.manager.getStory();
    if (!story?.illustrations?.workflows && !story?.checkpoints.some((checkpoint) => checkpoint.effects?.illustrations)) return undefined;
    const kit = await workflowKit();
    return kit.storyWorkflowHealth(story, source, () => comfyDiscover().then((found) => Object.keys(found.nodes ?? {}), () => null));
  }

  private async computeHealth(): Promise<ImageHealthView> {
    const settings = this.settings();
    const promptProfileMissing = Boolean(settings.enabled && settings.directorProfileId && !listConnectionProfiles().some((profile) => profile.id === settings.directorProfileId));
    const base = { enabled: settings.enabled, backend: settings.backend, automation: settings.automation.mode, localText: loopbackUrl(readReplyContext()?.url), promptProfileMissing } as const;
    const broker = (await gpuBrokerStatus())?.adapter ?? null;
    if (!settings.enabled) return { ...base, service: "unknown", detail: "Illustrations are off.", source: null, missingModels: [], broker };
    if (settings.backend === "st") {
      const ready = await stImageReadiness();
      return { ...base, service: ready.ready ? "ready" : "absent", detail: ready.reason ?? "SillyTavern's image service is ready.", source: ready.source, missingModels: [], broker,
        storyWorkflows: await this.storyWorkflowHealth(ready.source) };
    }
    const status = await mediaStatus();
    if (!status) return { ...base, service: "absent", detail: "The optional media plugin is not installed.", source: null, missingModels: [], broker };
    try {
      const discovery = await comfyDiscover();
      const missing = Object.entries(settings.purposes).flatMap(([purpose, route]) => {
        const resolved = resolveCheckpointFile(route.checkpoint, route.family, discovery.checkpoints);
        return resolved.ok ? [] : [resolutionProblem(purpose, resolved)];
      });
      return { ...base, service: "ready", detail: `ComfyUI at ${status.comfyUrl}.`, source: "comfy", missingModels: missing, broker };
    } catch (error) {
      return { ...base, service: "absent", detail: error instanceof Error ? error.message : "ComfyUI did not answer.", source: null, missingModels: [], broker };
    }
  }

  async refreshHealth(): Promise<void> {
    try { setImageHealth(await this.computeHealth()); } catch { setImageHealth(null); }
    this.manager.touch?.();
    this.notify();
  }
  private serviceReady(settings: ImageSettings): Promise<boolean> {
    return imageServiceReady(settings.backend, { st: stImageReadiness, media: mediaStatus });
  }
  override(): ImageOverride { return current().override; }
  async setOverride(override: ImageOverride): Promise<void> {
    const chatId = imageChat()?.id;
    if (!chatId) throw new Error("Open a chat before changing image preferences.");
    const saved = await imageWriteChatSettings({ ...current(this.manager.getSnapshot().storyId), override: sanitizeImageOverride(override) }, chatId);
    if (!saved.ok) throw new Error(saved.reason);
    this.notify();
  }
  private storyPath(): string[] {
    return [...(this.manager.getEngineState()?.visitedPath ?? []), this.manager.getSnapshot().activeCheckpointId ?? ""];
  }
  private placeFor(story: ReturnType<RuntimeManager["getStory"]>): string | null {
    return this.manager.getSnapshot().scene?.facts?.location ?? authoredPlace(story, this.storyPath());
  }
  private async visualScene(story: ReturnType<RuntimeManager["getStory"]>, subjects: ImageScene["subjects"], family: string): Promise<{ visual: VisualScene | null; issue: string | null }> {
    if (!story || !bindsPacks(story)) return { visual: null, issue: null };
    try {
      return { visual: await (await visualBridge()).scene({ story, members: visualMembers(subjects, story), values: this.manager.getSnapshot().blackboard,
        path: this.storyPath(), family }, { fresh: true }), issue: null };
    } catch (error) {
      return { visual: null, issue: `The installed visual packs could not be read, so this picture used the text route: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  status(): ImageStatus { return { jobs: this.queue.snapshot(), lastError: this.lastError, lastPlan: this.lastPlan, workflowNote: this.workflowNote }; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { this.listeners.forEach((listener) => listener()); }

  private async cue(kind: "checkpoint" | "scene", at: number | null, name: string): Promise<void> {
    const settings = this.settings();
    const chat = imageChat();
    const snapshot = this.manager.getSnapshot();
    const story = this.manager.getStory();
    const art = story?.illustrations;
    if (!chat || !this.manager.ownsImageChat(chat.id) || !snapshot.ready || !snapshot.requirements.ready || !settings.enabled || this.override().paused
      || !automationAllowsCues(settings.automation.mode) || !art?.[kind === "checkpoint" ? "checkpoints" : "scenes"]
      || !beatIllustrated(story, kind === "checkpoint" ? name : snapshot.activeCheckpointId)) return;
    const key = `${chat.id}:${snapshot.storyId}:${kind}:${name}:${snapshot.boundary}`;
    if (this.pending.has(key) || current(snapshot.storyId).emitted.includes(key)) return;
    const run = beginRun(this.manager.getOwnership(), at === null ? null : { from: at, to: at });
    if (!(await this.serviceReady(settings)) || !run.stillOwns() || imageChat()?.id !== chat.id) return;
    if (messageAlreadyDrawn(chat, at)) return;
    const target = at === null ? null : `${chat.id}:${at}`;
    if (target && this.pendingTargets.has(target)) return;
    this.pending.add(key);
    if (target) this.pendingTargets.add(target);
    try {
      const label = kind === "checkpoint" ? beatLabel(story?.checkpointById[name]) : sceneCueLabel(name, this.manager.getSnapshot().scene?.facts?.location);
      await this.direct({ purpose: "scene", text: cueText(kind, label), messageId: at, automatic: true }, {}, key);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.notify();
    } finally {
      this.pending.delete(key);
      if (target) this.pendingTargets.delete(target);
    }
  }

  start(): () => void {
    void workflowKit().then((kit) => { const reconciled = kit.reconcileComfyWorkflowSwap(); if (reconciled.note) { this.workflowNote = reconciled.note; this.notify(); } },
      (error: unknown) => { this.lastError = error instanceof Error ? error.message : String(error); });
    void this.refreshHealth();
    let initialChat: string | null = null;
    const off = [
      this.manager.subscribe(() => {
        const chat = imageChat();
        const snapshot = this.manager.getSnapshot();
        if (!chat || !this.manager.ownsImageChat(chat.id) || !snapshot.ready || !snapshot.requirements.ready || snapshot.boundary !== 0 || initialChat === chat.id) return;
        initialChat = chat.id;
        if (stageAlreadySet(this.manager.getStory(), snapshot.activeCheckpointId)) return;
        void this.cue("checkpoint", null, snapshot.activeCheckpointId ?? "opening");
      }),
      this.manager.onBoundary((result) => {
        if (result.fired) void this.cue("checkpoint", result.context.lastMessageId, result.activeCheckpointId);
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
    if (!settings.enabled || this.override().paused || settings.automation.mode === "manual" || type === "extension" || type === "first_message") return;
    const chat = imageChat();
    const message = chat?.messages[messageId];
    if (!chat || !this.manager.ownsImageChat(chat.id) || !message || message.is_user || message.is_system) return;
    const before = chat.messages.slice(0, messageId);
    const count = before.filter((row) => row.is_user).length;
    const lastPlayer = before.map((row) => row.is_user).lastIndexOf(true);
    if (!count || before.slice(lastPlayer + 1).some((row) => !row.is_user && !row.is_system)) return;
    const run = beginRun(this.manager.getOwnership(), { from: messageId, to: messageId });
    const replyText = message.mes;
    try {
      if (!run.stillOwns() || messageAlreadyDrawn(chat, messageId) || !(await this.serviceReady(settings)) || !run.stillOwns()) return;
      const cadence = settings.automation.mode === "everyN" && count % settings.automation.everyN === 0;
      const judge = this.manager.getJudge();
      const pick = judge?.active("pictureCue") ? await (await import("./judgePicture")).judgePicture(judge, replyText).catch(() => null) : null;
      if (!run.stillOwns() || replyText !== imageChat()?.messages[messageId]?.mes) return;
      if (pick === false || (!cadence && pick !== true)) return;
      const pictureKey = `${chat.id}:${this.manager.getSnapshot().storyId}`;
      if (pick === true && count - (this.pictureCounts.get(pictureKey) ?? -4) < 4) return;
      const target = `${chat.id}:${messageId}`;
      if (this.pendingTargets.has(target)) return;
      this.pendingTargets.add(target);
      try {
        if (!run.stillOwns()) return;
        await this.direct({ purpose: "scene", text: "", messageId, automatic: true });
        if (run.stillOwns()) this.pictureCounts.set(pictureKey, count);
      } catch { this.notify(); }
      finally { this.pendingTargets.delete(target); }
    } finally { run.release(); }
  }

  async plan(request: ImageRequest, args: ImageArgs = {}, signal: AbortSignal = NEVER_ABORTS): Promise<ImagePlan> {
    const chat = imageChat();
    if (!chat) throw new Error("Open a chat before generating an image.");
    if (!chat.groupId) throw new Error("Open a group chat before generating story illustrations.");
    const settings = this.settings();
    const snapshot = this.manager.getSnapshot();
    const ownsStory = this.manager.ownsImageChat(chat.id) && snapshot.ready;
    const story = ownsStory ? this.manager.getStory() : null;
    const beat = story && snapshot.activeCheckpointId ? story.checkpointById[snapshot.activeCheckpointId] : null;
    const place = ownsStory ? this.placeFor(story) ?? await displayedPlace() : null;
    const scene = sceneForImage(chat, request, settings.contextMessages, ownsStory ? beatLabel(beat) : null, place);
    if (story) {
      const look = lookFor(story, snapshot.activeCheckpointId);
      if (look.style) scene.visualStyle = look.style;
      scene.subjects = castForImage(scene.subjects, story, look, snapshot.blackboard);
    }
    if (story && snapshot.requirements.ready) {
      const scoped = [...(story.requirements?.lorebooks ?? []), ...(story.lore_select?.lorebooks ?? [])];
      const gates = worldInfoPlan(story, this.manager.getEngineState()?.visitedPath ?? []);
      const entries = await getScannableEntries();
      scene.visualDetails = visualLore(entries, [...scoped, ...gates.map((gate) => gate.lorebook)], gates,
        [request.text, ...scene.messages.map((row) => row.text), scene.location ?? ""].join("\n"), firedLoreKeys(snapshot.lore?.fired ?? []));
    }
    let route = resolveImageRoute(settings, request.purpose, args, this.override());
    if (settings.backend === "comfy") {
      const resolved = resolveCheckpointFile(route.checkpoint.file, route.family.id, (await discoverWaking(signal)).checkpoints);
      if (!resolved.ok) throw new Error(`No image was drawn. ${resolutionProblem(request.purpose, resolved)} under Picture types.`);
      route = withCheckpointFile(route, resolved.file);
      route = { ...route, allowed: [resolved.file] };
    }
    const { visual, issue: visualIssue } = await this.visualScene(story, scene.subjects, route.family.id);
    const drawn = visual ? withVisualScene(scene, visual) : scene;
    const routing = await this.routing(request, args, story, drawn, visual, signal);
    const frozenVisible = args.director !== undefined && !request.raw ? parseImageReply(args.director, route).visible : undefined;
    const early = routing.check?.(visibleNames(drawn.subjects, frozenVisible)) ?? null;
    if (routing.setting === "qwen") chooseRoute({ ...routing, readiness: early });
    const directed = await directorAnswer(request, args.director, settings, () => imageMessages(request, drawn, route, { instruction: Boolean(early?.ok) }), route);
    const { reply, frozen } = directed;
    const choice = chooseRoute({ ...routing, readiness: routing.check?.(visibleNames(drawn.subjects, reply?.visible)) ?? null });
    if (reply) route = pickImageCheckpoint(route, reply.checkpoint);
    const promptSource = sourceOf(reply, Boolean((settings.directorProfileId || frozen) && !request.raw));
    const aspect = route.aspect !== "auto" ? route.aspect : reply?.aspect ?? (request.purpose === "background" ? "wide" : "portrait");
    const assembled = assemblePlan(settings.backend, request, route, reply, drawn, chat.userName);
    if (!assembled.positive.trim()) throw new Error("There is nothing to draw.");
    const plan = {
      backend: settings.backend,
      request, chatId: chat.id, folder: chat.folder, target: scene.target, workflow: await this.storyWorkflow(settings.backend, story, request.purpose),
      targetText: scene.target === null ? null : chat.messages[scene.target]?.mes ?? null,
      route, reply, scene: drawn, aspect, positive: assembled.positive, negative: assembled.negative, promptSource, visual, visualIssue, directorIssue: directed.issue,
      ...(frozen ? { directorFrozen: true as const } : {}),
      caption: reply?.caption || request.text.slice(0, 120) || scene.checkpoint || "Story illustration",
      renderRoute: choice.route, routeReason: choice.reason, routeSetting: choice.setting, qwen: choice.ready ? { ready: choice.ready, prompt: qwenPrompt(choice.ready, drawn, reply, request) } : null,
    };
    this.lastPlan = plan;
    this.notify();
    return plan;
  }

  private async routing(request: ImageRequest, args: ImageArgs, story: ReturnType<RuntimeManager["getStory"]>, drawn: ImageScene, visual: VisualScene | null, signal: AbortSignal): Promise<Routing> {
    const setting = request.automatic || args.route ? args.route ?? this.settings().automaticRoute : null;
    if (!setting || setting === "sdxl") return { setting, check: null };
    if (request.purpose !== "scene" || request.raw) return { setting, blocked: request.purpose === "background" ? "background" : "not-automatic", check: null };
    if (!story) return { setting, check: null };
    if (!drawn.subjects.length) return { setting, check: () => refused("no-one-visible") };
    return { setting, check: await (await qwenKit()).qwenCheck(story, visual, this.manager.getSnapshot().blackboard, signal) };
  }

  private seed(plan: ImagePlan, index: number, override?: number): number {
    const settings = this.settings().defaults;
    if (override !== undefined) return override;
    if (plan.route.seed !== null) return plan.route.seed;
    if (settings.seedPolicy === "fixed") return settings.fixedSeed;
    if (settings.seedPolicy === "lockPerMessage") return Number.parseInt(fnv1a(`${plan.chatId}:${plan.target}:${index}`), 16);
    return Math.floor(Math.random() * 2 ** 32);
  }

  private async reserveOutsideTurns(request: Omit<Parameters<typeof reserveGpu>[0], "signal" | "foreground">, signal: AbortSignal) {
    await this.idle(signal);
    return leaseOutsideTurns({ acquire: () => reserveGpu({ ...request, signal, foreground: true }), release: async (held) => { await releaseGpu(held.lease); },
      loud: async () => isHostGenerating() || voiceChainPending(), sleep: () => new Promise((resolve) => setTimeout(resolve, 350)), signal });
  }

  private async idle(signal: AbortSignal) {
    const deadline = Date.now() + 120_000;
    while (isHostGenerating() || voiceChainPending()) {
      if (signal.aborted) throw new DOMException("Image cancelled", "AbortError");
      if (Date.now() > deadline) throw new Error("The text turn has not finished yet.");
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  private async storyWorkflow(backend: ImageSettings["backend"], story: ReturnType<RuntimeManager["getStory"]>, purpose: ImageRequest["purpose"]): Promise<string | null> {
    if (backend !== "st" || !story) return null;
    return (await workflowKit()).workflowFor(story, this.manager.getEngineState()?.visitedPath ?? [], purpose);
  }

  private async renderSt(plan: ImagePlan): Promise<string> {
    if (!plan.workflow) return renderStImage(plan.positive, plan.negative);
    const rendered = await (await workflowKit()).renderWithStoryWorkflow(plan.workflow, plan.positive, plan.negative);
    this.workflowNote = rendered.note;
    return rendered.path;
  }

  private async render(plan: ImagePlan, index: number, signal: AbortSignal, run: RunGuard, override?: number): Promise<ImageCandidate> {
    const seed = this.seed(plan, index, override);
    const size = plan.route.family.sizes[plan.aspect];
    if (plan.backend === "st") {
      signal.throwIfAborted();
      if (!run.stillOwns()) throw new Error("The story changed before the image could be drawn.");
      const path = await this.renderSt(plan);
      if (!run.stillOwns() || signal.aborted) { await imageDelete(path); throw new Error("The image was discarded because the story changed."); }
      signal.throwIfAborted();
      return { path, seed, ...size };
    }
    const discovery = await comfyDiscover(signal);
    if (!discovery.checkpoints.includes(plan.route.checkpoint.file)) throw new Error("Choose an installed model for this picture type before rendering.");
    if (plan.route.loras.some((lora) => !discovery.loras.includes(lora.entry.file))) throw new Error("A selected LoRA is not installed on this ComfyUI.");
    const upscaler = plan.route.quality === "hires" ? resolveUpscaler(this.settings().upscalers[plan.route.family.id] ?? "", plan.route.family, discovery.upscalers) : "";
    if (upscaler === null) throw new Error("Choose an installed upscaler before using hires.");
    const cleanEmbeddings = (text: string) => text.replace(/embedding:([\w-]+)/g, (tag, name: string) => discovery.embeddings.includes(name) ? tag : "");
    const image = await comfyRenderOwned(buildGraph({
      checkpoint: plan.route.checkpoint, family: plan.route.family, loras: plan.route.loras.map((lora) => ({ file: lora.entry.file, weight: lora.weight })),
      positive: cleanEmbeddings(plan.positive), negative: cleanEmbeddings(plan.negative), size, seed,
      hires: plan.route.quality === "hires", upscaler,
    }), signal);
    if (signal.aborted) throw new DOMException("Image cancelled", "AbortError");
    if (!run.stillOwns()) throw new Error("The story changed before this image could be saved.");
    const path = await imageSave(image.data, image.format, plan.folder, `director_${Date.now()}_${seed}`);
    return { path, seed, ...imageSize(plan.route.family, plan.aspect, plan.route.quality === "hires" ? plan.route.checkpoint.hires : null) };
  }

  async direct(request: ImageRequest, args: ImageArgs = {}, cueKey?: string): Promise<string> {
    const run = beginRun(this.manager.getOwnership());
    const busy = busyWork.begin("image", imageChat()?.id ?? null);
    try {
      const plan = await this.plan(request, args, run.signal);
      if (!run.stillOwns()) throw new Error("The story changed while the image was being planned.");
      const qwen = plan.renderRoute === "qwen";
      const count = cueKey || qwen ? 1 : plan.route.candidates;
      const gpuFacts = renderFacts({ checkpoint: plan.route.checkpoint, loras: plan.route.loras, family: plan.route.family, aspect: plan.aspect, quality: plan.route.quality });
      const gpuRequest = { ...gpuFacts, workflowKey: renderKey(gpuFacts) };
      const candidates = await this.queue.enqueue(`${plan.route.purpose} · ${qwen ? "Qwen references" : plan.route.checkpoint.label}`, async (signal) => {
        if (qwen) return [await (await qwenKit()).renderAutomaticQwen(this.manager, plan, signal, run, this.seed(plan, 0, args.seed))];
        const started = Date.now();
        const reservation = await this.reserveOutsideTurns(gpuRequest, signal);
        const waitedMs = Date.now() - started;
        try {
          const images: ImageCandidate[] = [];
          for (let index = 0; index < count; index += 1) images.push({ ...await this.render(plan, index, signal, run), waitedMs });
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
            const reservation = await this.reserveOutsideTurns(gpuRequest, signal);
            try { return await this.render(plan, index, signal, run, Math.floor(Math.random() * 2 ** 32)); }
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
      if (!run.stillOwns() || !now || now.id !== plan.chatId || (plan.target !== null && now.messages[plan.target]?.mes !== plan.targetText)) {
        await imageDelete(candidate.path);
        return "";
      }
      if (plan.visual && !(await (await visualBridge()).stillCurrent(plan.visual).catch(() => false))) {
        await imageDelete(candidate.path);
        throw new Error("A visual pack or one of its files changed while this picture was drawn, so it was discarded.");
      }
      const media: ImageMedia = { url: candidate.path, type: "image", title: plan.caption, source: "generated", image_director: pictureRecord(plan, candidate) };
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
    } finally { busy.end(); run.release(); }
  }
}
