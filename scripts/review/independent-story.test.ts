import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {StoryEngine,parseStoryV2OrThrow} from '@engine/index';
const raw=JSON.parse(readFileSync(join(__dirname,'../../scripts/review/fixtures/two-ways-across.story.json'),'utf8').replace(/^\uFEFF/,''));
test.each(['bridge','ferry'])('independent fixture preserves explicit %s choice and converges',route=>{
 const s=parseStoryV2OrThrow(raw);const e=new StoryEngine();e.loadStory(s);
 expect(s.outgoingByCheckpoint.bank).toHaveLength(2);
 e.enqueue({source:'extractor',blackboardVersionSum:0,turnRange:{from:0,to:0},deltas:[{q:'route',v:route,source:'extractor'}]});e.commitBoundary({lastMessageId:0,chatLength:1});expect(e.serialize().activeCheckpointId).toBe(route);
 e.enqueue({source:'extractor',blackboardVersionSum:1,turnRange:{from:1,to:1},deltas:[{q:'arrived',v:true,source:'extractor'}]});e.commitBoundary({lastMessageId:1,chatLength:2});expect(e.serialize().activeCheckpointId).toBe('shore');
});
