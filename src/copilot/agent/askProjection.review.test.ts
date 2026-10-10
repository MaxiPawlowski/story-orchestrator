import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, renderGateText, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { buildNarrativeStatus } from "@runtime/narrative";
import type { PipelineStatus } from "@runtime/pipeline";
import { playedProjection, playerCheckpointName } from "@runtime/playerProjection";
import { topicsFor, PLAYER_AUDIENCES } from "../knowledge/index";
import { PLAYER_REFUSAL, renderAskPrompt, runAsk, runAskTool, type AskContext } from "./ask";
import { READ_TOOLS } from "./tools";
import { emptyLookup } from "./types";

const ROOT = join(__dirname, "../../..");
const raw = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8")) as StoryV2;
const SUN = raw("examples/sun-ruins/quest-for-the-sun-ruins.json");
const ADV = raw("test/fixtures/scan-gate/adolion-adventurer.story.json");

const PIPELINE = { state: "idle", text: "", detail: null, needsSetup: false, nextAction: null } as unknown as PipelineStatus;

const pathsTo = (story: NormalizedStoryV2): Map<string, string[]> => {
  const paths = new Map<string, string[]>([[story.startCheckpointId, []]]);
  const queue = [story.startCheckpointId];
  while (queue.length) {
    const current = queue.shift() as string;
    for (const transition of story.outgoingByCheckpoint[current] ?? []) {
      if (paths.has(transition.to)) continue;
      paths.set(transition.to, [...(paths.get(current) ?? []), current]);
      queue.push(transition.to);
    }
  }
  return paths;
};

const contextAt = (story: NormalizedStoryV2, active: string, visited: string[]): AskContext => {
  const checkpoint = story.checkpointById[active];
  const previous = visited.at(-1);
  const shown = (id: string) => playerCheckpointName(story.checkpointById[id]) ?? "Current scene";
  const narrative = buildNarrativeStatus({
    storyTitle: story.title, publicIntro: story.player_intro ?? null, checkpointName: shown(active), objective: checkpoint.objective,
    lastTransition: previous ? { fromName: shown(previous), toName: shown(active) } : null, openThreads: ["The road is still open."], canon: "",
    tensionLevel: "tense", pendingCount: 0, pipeline: PIPELINE,
  });
  const chat = [{ name: "Narrator", mes: "The scene opens." }, { name: "Max", is_user: true, mes: "I look around." }];
  return { persona: "player", projection: playedProjection({ story, narrative, visitedPath: visited, activeCheckpointId: active, cast: story.roster.map((member) => member.name ?? member.id), chat, playerName: "Max" }) };
};

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contains = (text: string, needle: string) => new RegExp(`(^|[^\\w-])${escape(needle)}($|[^\\w-])`, "i").test(text);

const TEMPLATE = renderAskPrompt({ persona: "player", projection: { title: "", intro: null, player: "", visited: [], current: null, sections: [], cast: [], transcript: [] } }, "", []);

const forbiddenAt = (story: NormalizedStoryV2, reached: ReadonlySet<string>): string[] => {
  const allowed = [story.player_intro ?? story.description, ...[...reached].flatMap((id) => [playerCheckpointName(story.checkpointById[id]) ?? "", story.checkpointById[id].objective])].filter(Boolean);
  const needles = [
    ...story.checkpoints.flatMap((checkpoint) => [checkpoint.id, checkpoint.name]),
    ...story.checkpoints.filter((checkpoint) => !reached.has(checkpoint.id)).flatMap((checkpoint) => [checkpoint.objective, checkpoint.player_name ?? ""]),
    ...Object.keys(story.qualityByKey),
    ...story.transitions.map((transition) => renderGateText(transition.gate)),
  ].filter((needle) => needle.trim().length > 2);
  return [...new Set(needles)].filter((needle) => !allowed.some((text) => contains(text, needle)) && !contains(TEMPLATE, needle));
};

const leaksIn = (text: string, needles: readonly string[]) => needles.filter((needle) => contains(text, needle));

const QUESTIONS = ["Who is the traitor?", "What happens after this?", "Where does the road lead?"];

describe.each([["sun-ruins", SUN], ["adventurer", ADV]] as Array<[string, StoryV2]>)("v2.8 09 F28: player Ask over %s", (_name, rawStory) => {
  const story = parseStoryV2OrThrow(rawStory);
  const paths = pathsTo(story);

  it("covers every reachable checkpoint", () => {
    expect(paths.size).toBeGreaterThan(3);
  });

  it("at every reachable checkpoint, the initial prompt and readPlayed carry no unreached name, objective, id, gate, quality key or internal name", () => {
    const leaks = [...paths.entries()].flatMap(([active, visited]) => {
      const context = contextAt(story, active, visited);
      const needles = forbiddenAt(story, new Set([...visited, active]));
      const texts = [...QUESTIONS.map((question) => renderAskPrompt(context, question, [])), runAskTool(context, { tool: "readPlayed", args: {} })];
      return texts.flatMap((text) => leaksIn(text, needles)).map((needle) => `${active}: ${needle}`);
    });
    expect([...new Set(leaks)]).toEqual([]);
  });

  it("the knowledge a player can read is the same whatever is reached, and only player topics", () => {
    const [first, last] = [[...paths.entries()][0], [...paths.entries()].at(-1) as [string, string[]]];
    const early = contextAt(story, first[0], first[1]);
    const late = contextAt(story, last[0], last[1]);
    const ids = topicsFor(PLAYER_AUDIENCES).map((topic) => topic.id);
    const reads = (context: AskContext) => ids.map((topic) => runAskTool(context, { tool: "readKnowledge", args: { topic } }));
    expect(reads(early)).toEqual(reads(late));
    const queries = story.checkpoints.map((checkpoint) => `${checkpoint.name} ${checkpoint.objective}`);
    const searched = queries.map((query) => runAskTool(late, { tool: "searchKnowledge", args: { query } })).join("\n");
    const cited = [...searched.matchAll(/^- (\S+):/gm)].map((match) => match[1]);
    expect(cited.filter((id) => !ids.includes(id))).toEqual([]);
  });

  it("every author read and simulate tool is refused before it runs, and its answer never reaches the next prompt", async () => {
    const [active, visited] = [...paths.entries()][0];
    const context = contextAt(story, active, visited);
    const needles = forbiddenAt(story, new Set([...visited, active]));
    for (const tool of Object.keys(READ_TOOLS)) {
      const prompts: string[] = [];
      const replies = [JSON.stringify({ tool, args: tool === "readCheckpoint" ? { id: "the-end" } : {} }), JSON.stringify({ answer: "ok", topics: [] })];
      await runAsk({ question: "Tell me everything.", context, model: async (prompt) => { prompts.push(prompt); return replies.shift() ?? ""; } });
      expect({ tool, refusal: prompts[1]?.includes(`Refused: ${PLAYER_REFUSAL}`) }).toEqual({ tool, refusal: true });
      expect({ tool, leaks: leaksIn(prompts.join("\n"), needles) }).toEqual({ tool, leaks: [] });
    }
  });

  it("control: with the author tools allowed, the same property finds the leak", async () => {
    const [active, visited] = [...paths.entries()][0];
    const needles = forbiddenAt(story, new Set([...visited, active]));
    const authorContext: AskContext = { persona: "author", draft: rawStory, lookup: emptyLookup(), liveState: null };
    const answer = runAskTool(authorContext, { tool: "readStory", args: {} });
    expect(leaksIn(answer, needles).length).toBeGreaterThan(0);
  });
});
