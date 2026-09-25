import type { SceneReadRecord } from "@judge/index";
import { MessageCitation } from "./MessageCitation";

const pct = (value: number) => `${Math.round(value * 100)}%`;

// v2.2 plan 03, author view only: every field the judge answered with its probability, and the
// checkpoints one hop ahead that play is heading toward. Future checkpoint names are spoilers.
const ScenePanel = ({ scene }: { scene: SceneReadRecord | null | undefined }) => {
  if (!scene) return null;
  const heading = (scene.headingTo ?? []).filter((entry) => entry.hops === 1).sort((left, right) => right.p - left.p);
  return (
    <div data-so="scene-read" className="text-xs opacity-80">
      <div className="font-medium opacity-100">Scene read</div>
      <div><MessageCitation messageId={scene.messageId} /> · boundary {scene.boundary}{scene.model ? ` · ${scene.model}` : ""}</div>
      {scene.sceneBreak && <div>Scene change: {pct(scene.sceneBreak.p)}{scene.sceneBreak.type && scene.sceneBreak.type !== "none" ? ` (${scene.sceneBreak.type})` : ""}{scene.sceneBreak.triggered ? " · read asked" : ""}</div>}
      {scene.location && <div>Location: {scene.location.value} ({pct(scene.location.confidence)}){scene.facts.location ? "" : " · below floor"}</div>}
      {scene.time && <div>Time: {scene.time.value} ({pct(scene.time.confidence)}){scene.facts.time ? "" : " · below floor"}</div>}
      {scene.present && scene.present.length > 0 && <div>Present: {scene.present.map((member) => `${member.name} ${pct(member.p)}`).join(" · ")}</div>}
      {heading.length > 0 && (
        <div data-so="scene-heading">Heading toward: {heading.map((entry) => `${entry.name} ${pct(entry.p)}`).join(" · ")}</div>
      )}
    </div>
  );
};

export default ScenePanel;
