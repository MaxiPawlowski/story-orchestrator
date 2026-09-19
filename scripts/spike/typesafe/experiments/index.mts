import { extraction } from './extraction.mts';
import { director } from './director.mts';
import { scenes, arcs } from './narrative.mts';
import { memoryPairs, memoryVerify } from './memory.mts';
import { continuity, critic } from './guards.mts';
import { wiRelevance, backgrounds } from './stagecraft.mts';
import { performance } from './performance.mts';
import { pairRecall } from './pairRecall.mts';
import type { Experiment } from './types.mts';

export const experiments: Experiment[] = [extraction, director, scenes, arcs, memoryPairs, memoryVerify, continuity, critic, wiRelevance, backgrounds, performance, pairRecall];
