import { installGameLayer } from "../../src/engine/validate/gameLayer";
import { GAME_LAYER } from "../../src/engine/validate/gameLayerImpl";
import { installStoryParser } from "../../src/engine/storyParser";
import { parseStory } from "../../src/engine/validate";

installGameLayer(GAME_LAYER);
installStoryParser(parseStory);
