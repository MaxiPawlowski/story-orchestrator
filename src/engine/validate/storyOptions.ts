import {
  ARC_TEMPLATE_NAMES, type ArcTemplate, type StoryRequirements, type StoryLoreSelect, HOUSE_RULES_MAX,
  HOUSE_RULE_MAX_CHARS, type StagecraftExclusion, type StorySceneRead, type StoryStagecraft, type StoryV2, type ValidationError,
  STORY_DISPLAY_TOGGLES, type StoryDisplay, STORY_KINDS, type StoryKind,
} from "../schema";
import { OBJECTIVE_BLOCK_MODES } from "../agency";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, rejectUnknownKeys } from "./common";
import { readStoryIllustrations } from "./illustrations";
import { readBriefing } from "./briefing";

const REQUIREMENT_KEYS = ["personas", "members", "lorebooks"] as const;

const STAGECRAFT_KEYS = ["lorebooks", "exclude"] as const;

const EXCLUSION_KEYS = ["lorebook", "comments"] as const;

const LORE_SELECT_KEYS = ["lorebooks", "top_k", "min_p", "exclusive"] as const;

const readRequirementList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
};

const readRequirements = (value: unknown, errors: ValidationError[]): StoryRequirements | undefined => {
  if (!isRecord(value)) {
    addError(errors, "requirements", "requirements must be an object");
    return undefined;
  }
  rejectUnknownKeys(value, REQUIREMENT_KEYS, "requirements", errors);
  const personas = readRequirementList(value.personas);
  const members = readRequirementList(value.members);
  const lorebooks = readRequirementList(value.lorebooks);
  return {
    ...(personas.length ? { personas } : {}),
    ...(members.length ? { members } : {}),
    ...(lorebooks.length ? { lorebooks } : {}),
  };
};

// The curator's write scope, authored explicitly. An empty list is no scope at all, which is the
// safe default: nothing here is inferred from requirements or world_info effects.
const readStagecraft = (value: unknown, errors: ValidationError[]): StoryStagecraft | undefined => {
  if (!isRecord(value)) {
    addError(errors, "stagecraft", "stagecraft must be an object");
    return undefined;
  }
  rejectUnknownKeys(value, STAGECRAFT_KEYS, "stagecraft", errors);
  const lorebooks = readRequirementList(value.lorebooks);
  const exclude = value.exclude === undefined ? [] : readExclusions(value.exclude, errors);
  return lorebooks.length || exclude.length ? { lorebooks, ...(exclude.length ? { exclude } : {}) } : undefined;
};

const readExclusions = (value: unknown, errors: ValidationError[]): StagecraftExclusion[] => {
  if (!Array.isArray(value)) {
    addError(errors, "stagecraft.exclude", "exclude must be a list of {lorebook, comments}");
    return [];
  }
  return value.flatMap((entry, index): StagecraftExclusion[] => {
    const path = `stagecraft.exclude.${index}`;
    if (!isRecord(entry)) {
      addError(errors, path, "an exclusion must be {lorebook, comments}");
      return [];
    }
    rejectUnknownKeys(entry, EXCLUSION_KEYS, path, errors);
    const lorebook = asString(entry.lorebook)?.trim();
    const comments = readRequirementList(entry.comments);
    if (!lorebook) addError(errors, `${path}.lorebook`, "lorebook is required");
    if (!comments.length) addError(errors, `${path}.comments`, "comments must name at least one entry");
    return lorebook && comments.length ? [{ lorebook, comments }] : [];
  });
};

const readSceneRead = (value: unknown, errors: ValidationError[]): StorySceneRead | undefined => {
  if (!isRecord(value)) {
    addError(errors, "scene_read", "scene_read must be an object");
    return undefined;
  }
  if (value.inject !== undefined && typeof value.inject !== "boolean") addError(errors, "scene_read.inject", "scene_read.inject must be true or false");
  const locations = readRequirementList(value.locations);
  const times = readRequirementList(value.times);
  const out: StorySceneRead = { ...(locations.length ? { locations } : {}), ...(times.length ? { times } : {}), ...(value.inject === false ? { inject: false } : {}) };
  return Object.keys(out).length ? out : undefined;
};

const readLoreSelect = (value: unknown, errors: ValidationError[]): StoryLoreSelect | undefined => {
  if (!isRecord(value)) {
    addError(errors, "lore_select", "lore_select must be an object");
    return undefined;
  }
  rejectUnknownKeys(value, LORE_SELECT_KEYS, "lore_select", errors);
  const lorebooks = readRequirementList(value.lorebooks);
  const number = (key: "top_k" | "min_p", min: number, max: number) => {
    const raw = value[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < min || raw > max) {
      addError(errors, `lore_select.${key}`, `lore_select.${key} must be a number from ${min} to ${max}`);
      return undefined;
    }
    return key === "top_k" ? Math.round(raw) : raw;
  };
  const topK = number("top_k", 1, 12);
  const minP = number("min_p", 0, 1);
  if (value.exclusive !== undefined && typeof value.exclusive !== "boolean") addError(errors, "lore_select.exclusive", "lore_select.exclusive must be true or false");
  return lorebooks.length
    ? { lorebooks, ...(topK !== undefined ? { top_k: topK } : {}), ...(minP !== undefined ? { min_p: minP } : {}), ...(value.exclusive === true ? { exclusive: true } : {}) }
    : undefined;
};

const readHouseRules = (value: unknown, errors: ValidationError[]): string[] | undefined => {
  if (!Array.isArray(value)) {
    addError(errors, "house_rules", "house_rules must be a list of rules");
    return undefined;
  }
  if (value.length > HOUSE_RULES_MAX) addError(errors, "house_rules", `house_rules holds at most ${HOUSE_RULES_MAX} rules`);
  const rules: string[] = [];
  value.forEach((entry, index) => {
    const rule = typeof entry === "string" ? entry.trim() : "";
    if (!rule) addError(errors, `house_rules.${index}`, "a house rule must be non-empty text");
    else if (rule.length > HOUSE_RULE_MAX_CHARS) addError(errors, `house_rules.${index}`, `a house rule is at most ${HOUSE_RULE_MAX_CHARS} characters`);
    else if (rules.some((kept) => kept.toLowerCase() === rule.toLowerCase())) addError(errors, `house_rules.${index}`, `duplicate house rule '${rule}'`);
    else rules.push(rule);
  });
  return rules.length ? rules : undefined;
};

const readArcTemplate = (value: unknown, errors: ValidationError[]): ArcTemplate | undefined => {
  if (isOneOf(value, ARC_TEMPLATE_NAMES)) return value;
  if (isRecord(value) && Array.isArray(value.points)) {
    const points = value.points.map((entry, index) => {
      if (!isRecord(entry) || typeof entry.at !== "number" || typeof entry.tension !== "number"
        || entry.at < 0 || entry.at > 1 || entry.tension < 0 || entry.tension > 1) {
        addError(errors, `arc_template.points.${index}`, "each point needs at and tension in [0,1]");
        return null;
      }
      return { at: entry.at, tension: entry.tension };
    }).filter((entry): entry is { at: number; tension: number } => entry !== null);
    if (!points.length) {
      addError(errors, "arc_template.points", "custom arc_template needs at least one point");
      return undefined;
    }
    return { points };
  }
  addError(errors, "arc_template", `arc_template must be one of ${ARC_TEMPLATE_NAMES.join(", ")} or { points: [...] }`);
  return undefined;
};

const readArcBridge = (entry: unknown, bridgePath: string, errors: ValidationError[]) => {
  if (!isRecord(entry)) {
    addError(errors, bridgePath, "arc bridge must be an object");
    return null;
  }
  const arcMatch = asString(entry.arcMatch);
  const anchor = asString(entry.anchor);
  const amount = typeof entry.amount === "number" && Number.isFinite(entry.amount) ? entry.amount : null;
  if (!arcMatch) addError(errors, `${bridgePath}.arcMatch`, "arcMatch is required");
  if (!anchor) addError(errors, `${bridgePath}.anchor`, "anchor is required");
  if (amount === null) addError(errors, `${bridgePath}.amount`, "amount is required");
  return arcMatch && anchor && amount !== null ? { arcMatch, anchor, amount } : null;
};

export const readArcBridges = (value: unknown, errors: ValidationError[]) => (Array.isArray(value)
  ? value.map((entry, index) => readArcBridge(entry, `arc_bridges.${index}`, errors)).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  : undefined);

const readObjectiveBlock = (value: unknown, errors: ValidationError[]) => {
  const objectiveBlock = value === undefined || (OBJECTIVE_BLOCK_MODES as readonly unknown[]).includes(value) ? value as StoryV2["objective_block"] : undefined;
  if (value !== undefined && !objectiveBlock) addError(errors, "objective_block", "objective_block must be \"auto\" or \"off\"");
  return objectiveBlock;
};

const readDisplay = (value: unknown, errors: ValidationError[]): StoryV2["display"] => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    addError(errors, "display", "display must be an object");
    return undefined;
  }
  rejectUnknownKeys(value, ["lore_names_public", ...STORY_DISPLAY_TOGGLES], "display", errors);
  if (value.lore_names_public !== undefined && typeof value.lore_names_public !== "boolean") addError(errors, "display.lore_names_public", "lore_names_public must be true or false");
  const display: StoryDisplay = value.lore_names_public === true ? { lore_names_public: true } : {};
  for (const key of STORY_DISPLAY_TOGGLES) {
    const flag = value[key];
    if (typeof flag === "boolean") display[key] = flag;
    else if (flag !== undefined) addError(errors, `display.${key}`, `${key} must be true or false`);
  }
  return Object.keys(display).length ? display : undefined;
};

const readKind = (value: unknown, errors: ValidationError[]): StoryKind | undefined => {
  if (value === undefined) return undefined;
  if (isOneOf(value, STORY_KINDS)) return value;
  addError(errors, "kind", "kind must be \"saga\" or \"story\"");
  return undefined;
};

export const readStoryOptions = (json: Record<string, unknown>, errors: ValidationError[]) => {
  if (json.player_intro !== undefined && typeof json.player_intro !== "string") addError(errors, "player_intro", "player_intro must be text");
  const playerIntro = typeof json.player_intro === "string" ? json.player_intro.trim() : "";
  const briefing = readBriefing(json.briefing, "briefing", errors);
  const illustrations = readStoryIllustrations(json.illustrations, errors);
  const arcTemplate = json.arc_template !== undefined ? readArcTemplate(json.arc_template, errors) : undefined;
  const requirements = json.requirements !== undefined ? readRequirements(json.requirements, errors) : undefined;
  const stagecraft = json.stagecraft !== undefined ? readStagecraft(json.stagecraft, errors) : undefined;
  const sceneRead = json.scene_read !== undefined ? readSceneRead(json.scene_read, errors) : undefined;
  const loreSelect = json.lore_select !== undefined ? readLoreSelect(json.lore_select, errors) : undefined;
  const houseRules = json.house_rules !== undefined ? readHouseRules(json.house_rules, errors) : undefined;
  const objectiveBlock = readObjectiveBlock(json.objective_block, errors);
  const display = readDisplay(json.display, errors);
  const kind = readKind(json.kind, errors);
  return {
    ...(kind ? { kind } : {}),
    ...(playerIntro ? { player_intro: playerIntro } : {}),
    ...(briefing ? { briefing } : {}),
    ...(illustrations ? { illustrations } : {}),
    ...(arcTemplate !== undefined ? { arc_template: arcTemplate } : {}),
    ...(requirements ? { requirements } : {}),
    ...(stagecraft ? { stagecraft } : {}),
    ...(sceneRead ? { scene_read: sceneRead } : {}),
    ...(loreSelect ? { lore_select: loreSelect } : {}),
    ...(houseRules ? { house_rules: houseRules } : {}),
    ...(objectiveBlock ? { objective_block: objectiveBlock } : {}),
    ...(display ? { display } : {}),
  };
};
