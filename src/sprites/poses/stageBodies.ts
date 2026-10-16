import type { RuntimeManager } from "@runtime/runtimeManager";
import { beginRun, type RunGuard } from "@runtime/runToken";
import { cardValues } from "@engine/cardFields";
import { stableStringify } from "@runtime/hash";
import { spriteBuilderMembers } from "@services/stHost/sprites";
import { pickPose } from "./pick";
import { NARRATION, type ExpressionRead } from "../classify";
import { expressionDeps, type ExpressionCallTrace } from "../expressionCalls";
import { memberPoses, poseLibrary } from "./library";
import { replayPose, poseRead } from "./stageChoice";
import { bodyStamp, fallbackBodies, lookLayers } from "./layers";
import { publishedLook, visualRoot } from "../visualManifest";
import { memberDirection, type StageDirection } from "../direction";
import { resolveSprite, spriteIndex } from "../profile";
import type { Actor } from "../castLoad";
import type { SpriteSettings } from "../settings";
import type { AnimationFrames } from "../animation";
import type { BodyRequest, PoseBodies } from "./bodyRenderer";

interface StagePoseDeps {
  manager: RuntimeManager;
  actors(): Actor[];
  settings(): SpriteSettings;
  direction(): StageDirection | null;
  notify(): void;
}
export class StagePoses {
  private bodies: PoseBodies | null = null;
  private closed = false;
  constructor(private readonly deps: StagePoseDeps) {}
  close(): void { this.closed = true; this.bodies?.close(); }
  revalidate(): void { this.bodies?.revalidate(); }
  private async request(request: BodyRequest): Promise<void> {
    const run = beginRun(this.deps.manager.getOwnership());
    try {
      if (!this.bodies) {
        const host = await import("./bodyHost");
        if (this.closed || !run.stillOwns() || !request.accepts()) return;
        this.bodies ??= host.createPoseBodies(this.deps.manager.getOwnership());
      }
      if (!this.closed && run.stillOwns() && request.accepts()) this.bodies.request(request);
    } catch {
      if (!this.closed && run.stillOwns() && request.accepts()) request.failed("The pose renderer could not load. Reload the extension and try again.");
    } finally { run.release(); }
  }
  async pick(read: ExpressionRead, text: string, speaker: string, trace: ExpressionCallTrace, run: RunGuard): Promise<void> {
    const actor = this.deps.actors().find((actor) => actor.name === (read.who === NARRATION ? speaker : read.who));
    if (!actor || !run.stillOwns()) return;
    const poses = this.allowed(actor), scope = this.scope();
    const sticky = poseRead(poses, text, null, scope), directed = memberDirection(this.deps.direction(), actor.keys).pose;
    const pick = directed || sticky.poseKeyword ? { pose: null, source: "none" as const }
      : await pickPose({ text, member: actor.name, poses }, expressionDeps(this.deps.manager, trace));
    if (!run.stillOwns() || scope !== this.scope()) return;
    Object.assign(read, poseRead(poses, text, pick.pose, scope), { poseSource: pick.source });
  }
  scope(): string {
    const checkpoint = this.deps.manager.getCachedSnapshot().activeCheckpointId;
    const log = this.deps.manager.getBoundaryLog?.() ?? [];
    const started = log.length ? log[log.length - 1].after.checkpointStartedBoundary : 0;
    return `${checkpoint}:${started}`;
  }

  allowed(actor: Actor) {
    const story = this.deps.manager.getStory();
    const member = story?.roster.find((member) => actor.keys.includes(member.id.toLowerCase()));
    return memberPoses(poseLibrary(story?.poses, this.deps.settings().customPoses), member?.sprites);
  }

  choose(actor: Actor): boolean {
    if (!this.deps.settings().poses) return false;
    const story = this.deps.manager.getStory(), snapshot = this.deps.manager.getCachedSnapshot();
    const member = story?.roster.find((member) => actor.keys.includes(member.id.toLowerCase()));
    if (!story || !member) return false;
    const direction = memberDirection(this.deps.direction(), actor.keys), poses = this.allowed(actor);
    const pose = replayPose(poses, actor.poseReads ?? [], this.scope(), direction.pose, member.sprites?.pose);
    actor.pose = pose?.id;
    if (!pose || direction.set) return false;
    const fields = cardValues(story, snapshot.blackboard, member.id, true), layers = lookLayers(member.card, fields);
    if (pose.id === "stand_relaxed" && !Object.keys(fields).length) return false;
    const source = this.deps.settings().visualSources[actor.profile.folder], root = source ? visualRoot(source) : undefined;
    const config = this.deps.settings().builders[actor.profile.folder], stamp = bodyStamp(pose, layers, config, root);
    const available = (actor.bodies ?? []).filter((body) => body.visualRoot === root);
    const exact = available.find((body) => body.stamp === stamp && actor.packs.get(body.set)?.has(actor.desiredLabel));
    const wanted = exact ?? { set: "", pose: pose.id, tags: pose.tags, look: stableStringify(layers.base) };
    const standIn = !exact && source ? publishedLook(source, layers.base) : null;
    if (standIn && !actor.packs.has(standIn.set)) actor.packs.set(standIn.set, new Map([["neutral", standIn.path]]));
    const nearest = fallbackBodies(wanted, available, actor.set, standIn?.set).find((set) => actor.packs.has(set));
    const label = actor.desiredLabel;
    if (nearest) {
      actor.set = nearest;
      const pack = actor.packs.get(nearest) ?? new Map<string, string>();
      const resolved = resolveSprite(actor.profile, label, pack) ?? (pack.get("neutral") ? { label: "neutral", path: pack.get("neutral") as string } : null);
      if (resolved) { actor.label = resolved.label; actor.path = resolved.path; }
    }
    if (!config || !this.deps.settings().onDemand || !snapshot.storyId) return true;
    if (exact && actor.packs.get(exact.set)?.has(actor.desiredLabel)) return true;
    const storyId = snapshot.storyId;
    void this.request({ story: storyId, member: member.id, folder: actor.profile.folder, label, pose, layers, config, frames: this.deps.settings().blink || this.deps.settings().mouth !== "off",
      cardArt: spriteBuilderMembers([actor.name])[0]?.image,
      accepts: () => this.deps.actors().includes(actor) && this.deps.settings().poses && this.deps.settings().onDemand
        && this.deps.manager.getCachedSnapshot().storyId === storyId && actor.pose === pose.id && actor.desiredLabel === label
        && stableStringify(replayPose(this.allowed(actor), actor.poseReads ?? [], this.scope(),
          memberDirection(this.deps.direction(), actor.keys).pose, member.sprites?.pose)) === stableStringify(pose)
        && bodyStamp(pose, lookLayers(member.card, cardValues(story, this.deps.manager.getCachedSnapshot().blackboard, member.id, true)),
           this.deps.settings().builders[actor.profile.folder], root) === stamp,
      apply: (result) => {
        actor.bodies = [...(actor.bodies ?? []).filter((body) => body.set !== result.set), result.body];
        const pack = actor.packs.get(result.set) ?? new Map<string, string>();
        for (const [id, path] of spriteIndex(result.files)) pack.set(id, path);
        actor.packs.set(result.set, pack);
        if (result.frames) { const frames = actor.frames.get(result.set) ?? new Map<string, AnimationFrames>(); frames.set(label, result.frames); actor.frames.set(result.set, frames); }
        actor.set = result.set; actor.renderedStamp = stamp; actor.generatedLook = JSON.stringify(fields); actor.lookError = undefined;
        const resolved = resolveSprite(actor.profile, label, pack);
        if (resolved) { actor.label = resolved.label; actor.path = resolved.path; }
        this.deps.notify();
      }, failed: (reason) => { actor.lookError = reason; this.deps.notify(); },
    });
    const resolved = resolveSprite(actor.profile, label, actor.packs.get(actor.set) ?? new Map<string, string>());
    if (resolved) { actor.label = resolved.label; actor.path = resolved.path; }
    return true;
  }

}
