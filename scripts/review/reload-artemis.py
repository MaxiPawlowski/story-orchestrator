import sys,json,urllib.request
from pathlib import Path
root=Path(sys.argv[1]);key=(root/'private/studio-key.txt').read_text().strip();headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'}
def call(path,body=None):
 req=urllib.request.Request('http://127.0.0.1:8888'+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
 with urllib.request.urlopen(req,timeout=120) as r:return json.load(r)
status=call('/api/inference/status')
print(json.dumps({k:v for k,v in status.items() if k not in ['chat_template','available_models']}))
print('unload',call('/api/inference/unload',{'model_path':'TheDrummer/Artemis-31B-v1.1-GGUF'}))
