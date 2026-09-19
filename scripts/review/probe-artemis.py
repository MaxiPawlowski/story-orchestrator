import json,sys,time,urllib.request,urllib.error
from pathlib import Path
root=Path(sys.argv[1]); out=Path(sys.argv[2]); label=sys.argv[3] if len(sys.argv)>3 else 'cold-autoload'
key=(root/'private/studio-key.txt').read_text().strip()
body={'model':'TheDrummer/Artemis-31B-v1.1-GGUF:Q4_K_M','messages':[{'role':'system','content':'You are a concise roleplay narrator. Do not reason aloud.'},{'role':'user','content':'A traveler reaches a bridge at sunset. Describe the scene in two sentences, leaving their next action open.'}],'max_tokens':128,'temperature':0.7,'stream':False,'enable_thinking':False}
start=time.monotonic()
try:
 req=urllib.request.Request('http://127.0.0.1:8888/v1/chat/completions',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+key})
 with urllib.request.urlopen(req,timeout=600) as response:
  result={'status':response.status,'seconds':time.monotonic()-start,'response':json.load(response),'request':body}
except urllib.error.HTTPError as e: result={'status':e.code,'seconds':time.monotonic()-start,'error':e.read().decode()}
except Exception as e: result={'seconds':time.monotonic()-start,'error':str(e)}
(out/(label+'.json')).write_text(json.dumps(result,indent=2));print(json.dumps(result))

