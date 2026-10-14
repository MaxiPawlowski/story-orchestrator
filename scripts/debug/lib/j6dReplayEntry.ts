import { installGameLayer } from '../../../src/engine/validate/gameLayer';
import { GAME_LAYER } from '../../../src/engine/validate/gameLayerImpl';

installGameLayer(GAME_LAYER);

export * from '../../../src/extraction/shadowReplay';
export { parseStoryV2OrThrow } from '../../../src/engine/index';
