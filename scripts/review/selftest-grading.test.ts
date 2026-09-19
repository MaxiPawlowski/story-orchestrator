import {runModelSelfTest} from '@runtime/selfTest';
jest.mock('@services/STAPI',()=>({getContext:()=>({chat:[]}),sendConnectionProfileRequest:jest.fn()}));
jest.mock('@extraction/client',()=>({callExtractionModel:jest.fn(async (_prompt:string,options:{debugResponse?:string})=>options.debugResponse??'')}));
const goodCore=['DELTA location value="tunnel" evidence="She leads the way into the tunnel"','DELTA has_lantern value=true evidence="I pick up the brass lantern"','MEMORY type=event importance=2 expiration=session text="The party entered the tunnel with the lantern." evidence="we go down"','[arc] The debt owed to Bel for the ferry crossing'].join('\n');
const goodCapability='[hiding] Corin from Bel | the letter in his coat\n[state:Corin:character] wound=left arm';
test('control: expected fixture semantics pass',async()=>{const r=await runModelSelfTest({profileId:'review',debugResponses:[goodCore,goodCapability]});expect(r.error).toBeUndefined();expect(r.results).toHaveLength(5);expect(r.results.every(x=>x.status==='pass')).toBe(true);});
test('control: empty output fails',async()=>{const r=await runModelSelfTest({profileId:'review',debugResponses:['NO_DELTA','NO_DELTA']});expect(r.results.every(x=>x.status==='fail')).toBe(true);});
test('R12: unrelated but well-formed tier content must not certify semantic capability',async()=>{
 const wrongCore=['DELTA location value="tunnel" evidence="tunnel"','MEMORY type=event importance=2 expiration=session text="A dragon conquered the distant moon." evidence="invented"','[arc] Win the interstellar chess tournament'].join('\n');
 const wrongCapability='[knows] Stranger | the moon is made of cheese\n[state:Stranger:character] costume=purple';
 const r=await runModelSelfTest({profileId:'review',debugResponses:[wrongCore,wrongCapability]});
 expect(r.error).toBeUndefined();expect(r.results).toHaveLength(5);
 expect(r.results.every(x=>x.status==='pass')).toBe(false);
});
