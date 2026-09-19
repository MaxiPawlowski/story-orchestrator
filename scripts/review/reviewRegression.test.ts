import { StoryEngine, parseStoryV2OrThrow } from '@engine/index';
import { parseSharedReadResponse } from '@extraction/parse';
import { runSharedRead } from '@extraction/sharedRead';
import { callExtractionModel } from '@extraction/client';
import { StagecraftCoordinator } from '@runtime/coordinators/stagecraftCoordinator';
import { createStagecraft } from '@runtime/extras';
import { loadLorebook, upsertWIEntry, enableWIEntry, disableWIEntry } from '@services/STAPI';
jest.mock('@services/STAPI', () => ({loadLorebook:jest.fn(),upsertWIEntry:jest.fn(),enableWIEntry:jest.fn(),disableWIEntry:jest.fn(),getContext:()=>({chat:[],extensionSettings:{}}),activateGlobalLorebook:jest.fn(async()=>true),listAllLorebooks:()=>["Existing user book"]}));
jest.mock('@extraction/client',()=>({callExtractionModel:jest.fn()}));
const story=()=>parseStoryV2OrThrow({format:2,id:'review-independent',title:'Review crossing',description:'Independent fixture',qualities:[{key:'crossed',type:'bool',source:'extractor',rubric:'Crossed?'},{key:'outside',type:'bool',source:'extractor',rubric:'Outside scope?'},{key:'locked',type:'bool',source:'code',rubric:'Code owns lock'}],checkpoints:[{id:'bank',name:'Bank',objective:'Cross',type:'anchor',start:true},{id:'island',name:'Island',objective:'Rest',type:'anchor'}],transitions:[{id:'cross',from:'bank',to:'island',priority:0,gate:{q:'crossed',op:'==',v:true}}],roster:[],stagecraft:{lorebooks:['Review Lore']}});
function harness(){
 const engine=new StoryEngine(); engine.loadStory(story()); let state=createStagecraft(); state.settings={...state.settings,curatorEnabled:true,acceptMode:'auto'};
 let content='Original'; let messageId=10;
 (loadLorebook as jest.Mock).mockImplementation(async()=>({entries:{1:{uid:1,comment:'Bridge',content,key:['bridge'],disable:false}}}));
 (upsertWIEntry as jest.Mock).mockImplementation(async(_book,_entry,text)=>{content=text;return 'updated';});
 (enableWIEntry as jest.Mock).mockResolvedValue(true);(disableWIEntry as jest.Mock).mockResolvedValue(true);
 const coordinator=new StagecraftCoordinator({getStory:story,getState:()=>({...engine.serialize(),boundary:messageId,lastMessageId:messageId}),getStagecraft:()=>state,setStagecraft:s=>{state=s},getExtractionSettings:()=>({profileId:'review'} as any),getCanon:()=>'',getOpenArcs:()=>[],journal:()=>{},persist:async()=>{},notify:()=>{}});
 return {coordinator,get state(){return state},get content(){return content},next:()=>{messageId++},switchChat:()=>{state=createStagecraft();state.settings={...state.settings,curatorEnabled:true,acceptMode:'auto'}}};
}
beforeEach(()=>jest.clearAllMocks());
test('control: normal same-session curator write applies',async()=>{const h=harness();(callExtractionModel as jest.Mock).mockResolvedValue('[rewrite] Bridge || First');await h.coordinator.runCuratorPass();await h.coordinator.applyAccepted();expect(h.content).toBe('First');});
test('R1: late curator result must not enter a different chat',async()=>{const h=harness();let release!:(s:string)=>void;(callExtractionModel as jest.Mock).mockImplementation(()=>new Promise(r=>{release=r}));const pending=h.coordinator.runCuratorPass();await Promise.resolve();await Promise.resolve();h.switchChat();release('[rewrite] Bridge || Old chat fact');await pending;expect(h.state.proposals).toHaveLength(0);});
test('R2: rollback of two writes must restore the oldest before-image',async()=>{const h=harness();for(const text of ['First','Second']){(callExtractionModel as jest.Mock).mockResolvedValue('[rewrite] Bridge || '+text);await h.coordinator.runCuratorPass();await h.coordinator.applyAccepted();h.next();}expect(h.content).toBe('Second');await h.coordinator.revertAppliedSince(10);expect(h.content).toBe('Original');});
test('R3: false host result must not be reported applied',async()=>{const h=harness();(disableWIEntry as jest.Mock).mockResolvedValue(false);(callExtractionModel as jest.Mock).mockResolvedValue('[disable] Bridge');await h.coordinator.runCuratorPass();expect(await h.coordinator.applyAccepted()).toBe(0);expect(h.state.proposals[0].ops[0].status).toBe('failed');});
test('R4: hydrated engine must recognize edits to persisted transition evidence',()=>{const e=new StoryEngine();e.loadStory(story());e.enqueue({source:'extractor',blackboardVersionSum:0,turnRange:{from:0,to:1},deltas:[{q:'crossed',v:true,source:'extractor'}]});e.commitBoundary({lastMessageId:1,chatLength:2});expect(e.shouldRollbackFromMessage(1)).toBe(true);const next=new StoryEngine();next.loadStory(story());next.hydrate(e.serialize());expect(next.shouldRollbackFromMessage(1)).toBe(true);});
test('R5: extraction must not claim code-owned quality authority',()=>{const parsed=parseSharedReadResponse('DELTA locked value=true evidence="invented"',story());expect(parsed.deltas).toHaveLength(0);});
test('R6: shared read must reject an out-of-scope quality',async()=>{const s=story();const e=new StoryEngine();e.loadStory(s);(callExtractionModel as jest.Mock).mockResolvedValue('DELTA outside value=true evidence="crossed"');const result=await runSharedRead({story:s,state:e.serialize(),priority:0,reason:'review',scope:[{quality:s.qualityByKey.crossed,key:'crossed',hints:[]}] as any,window:{from:0,to:0,messages:[{speaker:'User',text:'crossed',id:0}]} as any,client:{profileId:'review'}});expect(result.audit.acceptedDeltas).toHaveLength(0);});
test('control: unknown quality is rejected',()=>expect(parseSharedReadResponse('DELTA nonexistent value=true evidence="x"',story()).deltas).toHaveLength(0));


import { describeStoryUpdate } from '@runtime/storyUpdate';
import { CopilotCoordinator } from '@runtime/coordinators/copilotCoordinator';
import { mergeExpansions } from '@generation/merge';
import { parseGeneratedBeats } from '@generation/parse';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('R7: imported title must be escaped in story update HTML',()=>{
 const marker='<img src=x onerror="globalThis.reviewMarker=1">';
 const html=describeStoryUpdate(marker,{classification:'invalidating',entries:[],droppedQualityKeys:[]} as any,1,2);
 expect(html).not.toContain(marker);
 expect(html).toContain('&lt;img');
});

test('R8: declaring a dependency must not grant wizard write ownership',async()=>{
 const s=story();s.requirements={lorebooks:['Existing user book']};
 const c=new CopilotCoordinator({getStory:()=>s,getState:()=>null,getSettings:()=>({}) as any,getProfileId:()=>null,getCanon:()=>'',notify:()=>{}});
 (upsertWIEntry as jest.Mock).mockResolvedValue('updated');
 const result=await c.applyProvisioning({kind:'upsertLorebookEntry',lorebook:'Existing user book',comment:'User entry',content:'Overwritten',keys:[]});
 expect(result.ok).toBe(false);
 expect(upsertWIEntry).not.toHaveBeenCalled();
});

test('R9: generated alternative outcomes must survive graph merge',()=>{
 const root=join(__dirname,'../..');
 const raw=JSON.parse(readFileSync(join(root,'test/fixtures/background-generation.story.json'),'utf8'));
 const s=parseStoryV2OrThrow(raw);
 const parsed=parseGeneratedBeats(readFileSync(join(root,'test/goldens/background-generator1.response.txt'),'utf8'),s);
 expect(parsed.issues).toEqual([]);
 const baseline=mergeExpansions(raw,{review:{status:'inserted',sourceCheckpointId:'start',stubId:'bridge_stub',targetAnchorId:'finish',beats:parsed.beats}} as any);
 expect(baseline.outgoingByCheckpoint.gen_bridge_stub_1).toHaveLength(1);
 parsed.beats[0].outcomes.push({...parsed.beats[0].outcomes[0],label:'Alternative route',gate:{q:'approach',op:'==',v:'blocked'}});
 const checked=parseGeneratedBeats(JSON.stringify({beats:parsed.beats}),s);
 expect(checked.issues).toEqual([]);expect(checked.beats[0].outcomes).toHaveLength(2);
 const entry={key:'review',status:'inserted',sourceCheckpointId:'start',stubId:'bridge_stub',targetAnchorId:'finish',beats:parsed.beats};
 const merged=mergeExpansions(raw,{review:entry} as any);
 expect(merged.outgoingByCheckpoint.gen_bridge_stub_1).toHaveLength(2);
});


test('control: plain story title is retained',()=>expect(describeStoryUpdate('Crossing',{classification:'invalidating',entries:[]} as any,1,2)).toContain('Crossing'));
test('control: wizard rejects a book absent from story requirements',async()=>{
 const c=new CopilotCoordinator({getStory:story,getState:()=>null,getSettings:()=>({}) as any,getProfileId:()=>null,getCanon:()=>'',notify:()=>{}});
 const result=await c.applyProvisioning({kind:'upsertLorebookEntry',lorebook:'Other book',comment:'Entry',content:'Text',keys:[]});
 expect(result.ok).toBe(false);
});

