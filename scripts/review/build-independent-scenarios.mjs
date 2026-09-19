import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const path=resolve(process.argv[2]);const story=JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
for(const route of ['bridge','ferry']){
 const steps=[
  {import_story:story},
  {eval:"for (const key of Object.keys(globalThis).filter(k=>k.startsWith('storyOrchestratorDebug'))) delete globalThis[key]; const r=globalThis.storyOrchestratorRuntime; r.setExtractionSettings({enabled:true,profileId:'so-review-artemis',cadence:0}); if(r.getSnapshot().activeCheckpointId!=='bank') throw Error('Independent story did not load'); return r.getExtractionSettings();"},
  {send_generate:`At the river, I explicitly choose the ${route}. I am still on the near bank and have not crossed yet. Describe only the immediate surroundings and wait for my next action.`},
  {wait:{idle:true,timeoutMs:180000}},
  {extract:{reason:`review-independent-${route}-choice`}},
  {expect:{activeCheckpoint:route,blackboard:{route}}},
  {send_generate:`I complete my crossing using the ${route} and step onto the far shore. I have arrived. Leave my next destination undecided.`},
  {wait:{idle:true,timeoutMs:180000}},
  {extract:{reason:`review-independent-${route}-arrival`}},
  {expect:{activeCheckpoint:'shore',blackboard:{route,arrived:true},latched:['arrived']}}
 ];
 await writeFile(resolve(dirname(path),`live-two-ways-${route}.json`),JSON.stringify({steps},null,2));
}
