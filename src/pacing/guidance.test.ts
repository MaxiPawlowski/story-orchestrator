import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_AGENCY, PLAYER_ATTEMPTS_CLAUSE, guidanceMembers, guidanceShared, parseStoryV2OrThrow, type Checkpoint, type NormalizedStoryV2 } from "@engine/index";
import { INJECTION_REGISTRY, findInjectionRegistryProblems } from "@constants/injectionRegistry";
import { mergeExpansions } from "@generation/merge";
import { parseGeneratedBeats } from "@generation/parse";
import { GUIDANCE_NOT_YET, GUIDANCE_PREAMBLE, GUIDANCE_SECRECY, composeGuidanceBlock } from "./guidance";

const checkpoint = (guidance?: string): Checkpoint => ({ id: "cp", name: "CP", objective: "Reach the gate.", type: "anchor", ...(guidance === undefined ? {} : { guidance }) });

const root = join(__dirname, "..", "..");

const MIN_FOREIGN_CHARS = 24;

const directionOf = (cp: Checkpoint): string[] => [guidanceShared(cp.guidance), ...Object.values(guidanceMembers(cp.guidance)), cp.objective].map((text) => text.trim());

const foreignDirection = (story: NormalizedStoryV2, active: Checkpoint, extra: string[] = []): string[] => {
  const own = new Set(directionOf(active));
  const others = story.checkpoints.filter((cp) => cp.id !== active.id).flatMap(directionOf);
  return [...others, ...extra].filter((text) => text.length >= MIN_FOREIGN_CHARS && !own.has(text) && ![...own].some((mine) => mine.includes(text)));
};

const blocksFor = (story: NormalizedStoryV2, cp: Checkpoint): string[] => {
  const members = Object.entries(guidanceMembers(cp.guidance)).map(([id, text]) => ({ name: story.roster.find((member) => member.id === id)?.name ?? id, text }));
  return [composeGuidanceBlock(cp, DEFAULT_AGENCY, true), ...members.map((member) => composeGuidanceBlock(cp, DEFAULT_AGENCY, true, member))];
};

const leaksIn = (story: NormalizedStoryV2, extra: string[] = []) => story.checkpoints.flatMap((cp) => {
  const foreign = foreignDirection(story, cp, extra);
  return blocksFor(story, cp).flatMap((block) => foreign.filter((text) => block.includes(text)).map((text) => `${story.id}/${cp.id}: ${text.slice(0, 60)}`));
});

const unframed = (story: NormalizedStoryV2) => story.checkpoints.flatMap((cp) => blocksFor(story, cp)
  .filter((block) => block && (!block.startsWith(GUIDANCE_PREAMBLE) || /scene direction:/i.test(block)))
  .map(() => `${story.id}/${cp.id}`));

describe("composeGuidanceBlock (v2.4 plan 01, D7)", () => {
  it("renders the checkpoint's guidance, trimmed, under the private-direction preamble", () => {
    expect(composeGuidanceBlock(checkpoint("  Let the player wander.  "), DEFAULT_AGENCY)).toBe(`${GUIDANCE_PREAMBLE}\nLet the player wander.`);
  });

  it("is empty for no checkpoint, no guidance or whitespace-only guidance, so the writer clears the block", () => {
    expect(composeGuidanceBlock(null, DEFAULT_AGENCY)).toBe("");
    expect(composeGuidanceBlock(checkpoint(), DEFAULT_AGENCY)).toBe("");
    expect(composeGuidanceBlock(checkpoint(" \n "), DEFAULT_AGENCY)).toBe("");
  });

  it("does not restate the objective: that line is plan 06's, under its own rule", () => {
    expect(composeGuidanceBlock(checkpoint("Let the player wander."), DEFAULT_AGENCY)).not.toContain("Reach the gate.");
  });

  it("adds the opt-in attempts clause after the guidance, and carries it alone when there is no guidance (v2.4 plan 04, X13)", () => {
    const attempts = { ...DEFAULT_AGENCY, player_attempts_only: true };
    expect(composeGuidanceBlock(checkpoint("Let the player wander."), attempts)).toBe(`${GUIDANCE_PREAMBLE}\nLet the player wander.\n${PLAYER_ATTEMPTS_CLAUSE}`);
    expect(composeGuidanceBlock(checkpoint(), attempts)).toBe(PLAYER_ATTEMPTS_CLAUSE);
    expect(composeGuidanceBlock(null, attempts)).toBe(PLAYER_ATTEMPTS_CLAUSE);
    expect(composeGuidanceBlock(checkpoint("Let the player wander."), DEFAULT_AGENCY)).not.toContain(PLAYER_ATTEMPTS_CLAUSE);
  });

  it("is a registered depth-4 system block whose collision with facts and epistemic is allowlisted", () => {
    expect(INJECTION_REGISTRY.checkpointGuidance).toMatchObject({ key: "story_orchestrator_guidance", depth: 4, writer: "runtime/coordinators/pacingCoordinator" });
    expect(findInjectionRegistryProblems()).toEqual([]);
  });
});

describe("T0-2 spoiler leak: the guidance block is private direction, never a quotable scene script (v2.6 plan 14)", () => {
  const firstNight = checkpoint("The fog comes first, red and thick. Show one fall and bubble away. At dawn the fog withdraws into the trees.");

  it("opens with the secrecy and not-yet rules before any authored text", () => {
    const block = composeGuidanceBlock(firstNight, DEFAULT_AGENCY, true, { name: "Narrator", text: "One of them breaks and shouts a name." });
    const [preamble, ...rest] = block.split("\n");
    expect(preamble).toBe(GUIDANCE_PREAMBLE);
    expect(preamble).toContain(GUIDANCE_SECRECY);
    expect(preamble).toContain(GUIDANCE_NOT_YET);
    expect(GUIDANCE_SECRECY).toMatch(/never quote/i);
    expect(GUIDANCE_NOT_YET).toMatch(/not what has happened/i);
    expect(rest.join("\n")).toContain("At dawn the fog withdraws");
  });

  it("carries no `Label: text` line a model can copy as a bracketed note", () => {
    const block = composeGuidanceBlock(firstNight, DEFAULT_AGENCY, true);
    expect(block).not.toMatch(/scene direction:/i);
    expect(block).not.toMatch(/^\[/m);
    expect(block.split("\n")[1]).toBe(guidanceShared(firstNight.guidance));
  });

  it("frames an objective-only block too, so the objective is never quotable on its own", () => {
    expect(composeGuidanceBlock(checkpoint(), DEFAULT_AGENCY, true).startsWith(`${GUIDANCE_PREAMBLE}\n`)).toBe(true);
  });

  it("never carries a later checkpoint's direction or a generated outcome label (the future the scene has not reached)", () => {
    const raw = JSON.parse(readFileSync(join(root, "test/fixtures/background-generation.story.json"), "utf8"));
    const base = parseStoryV2OrThrow(raw);
    const parsed = parseGeneratedBeats(readFileSync(join(root, "test/goldens/background-generator1.response.txt"), "utf8"), base);
    const merged = mergeExpansions(raw, { chain: { status: "inserted", sourceCheckpointId: "start", stubId: "bridge_stub", targetAnchorId: "finish", beats: parsed.beats } } as never);
    const labels = parsed.beats.flatMap((beat) => beat.outcomes.map((outcome) => outcome.label));
    expect(merged.checkpoints.some((cp) => cp.id.startsWith("gen_"))).toBe(true);
    expect(leaksIn(merged)).toEqual([]);
    merged.checkpoints.forEach((cp) => {
      const authored = directionOf(cp).join("\n");
      const added = labels.filter((label) => !authored.includes(label));
      blocksFor(merged, cp).forEach((block) => added.forEach((label) => expect(block).not.toContain(label)));
    });
    expect(unframed(merged)).toEqual([]);
  });
});

const pin = JSON.parse(readFileSync(join(root, "scripts/debug/adolion-fresh.pin.json"), "utf8")) as { repo: string; commit: string };
const campaignAt = (path: string) => execFileSync("git", ["-C", pin.repo, "show", `${pin.commit}:${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const campaignStories = (): string[] => {
  if (!existsSync(pin.repo)) return [];
  try {
    return execFileSync("git", ["-C", pin.repo, "ls-tree", "--name-only", pin.commit, "build/story/"], { encoding: "utf8" })
      .split(/\r?\n/).filter((path) => path.endsWith(".story.json"));
  } catch {
    return [];
  }
};
const stories = campaignStories();

(stories.length ? describe : describe.skip)("the nine Adolion stories at the adolion-fresh pin", () => {
  const parsed = stories.map((path) => parseStoryV2OrThrow(JSON.parse(campaignAt(path))));

  it("are the nine the sessions play", () => {
    expect(parsed).toHaveLength(9);
  });

  it("frame every checkpoint's block as private direction, with no `Scene direction:` label", () => {
    expect(parsed.flatMap(unframed)).toEqual([]);
  });

  it("never put another checkpoint's direction into the active checkpoint's block", () => {
    expect(parsed.flatMap((story) => leaksIn(story))).toEqual([]);
  });
});
