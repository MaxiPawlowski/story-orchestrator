import sys, json, hashlib, time
from pathlib import Path
backend = Path.home()/'.unsloth/studio/unsloth_studio/Lib/site-packages/studio/backend'
sys.path.insert(0,str(backend))
from utils.hf_cache_settings import get_hf_cache_paths
from huggingface_hub import HfApi, hf_hub_download
repo='TheDrummer/Artemis-31B-v1.1-GGUF'
filename='Artemis-31B-v1m-Q4_K_M.gguf'
out=Path(sys.argv[1]); out.mkdir(parents=True,exist_ok=True)
info=HfApi().model_info(repo,files_metadata=True)
entry=next(x for x in info.siblings if x.rfilename==filename)
record={'repository':repo,'revision':info.sha,'filename':filename,'size':entry.size,'expected_sha256':entry.lfs.sha256,'status':'downloading'}
(out/'artemis-download.json').write_text(json.dumps(record,indent=2))
print(json.dumps(record),flush=True)
p=hf_hub_download(repo,filename,revision=info.sha,cache_dir=str(get_hf_cache_paths().hub_cache))
sha=hashlib.sha256()
with open(p,'rb') as f:
    for block in iter(lambda:f.read(8*1024*1024),b''):sha.update(block)
record.update(path=p,sha256=sha.hexdigest(),verified=sha.hexdigest()==entry.lfs.sha256,status='complete')
(out/'artemis-download.json').write_text(json.dumps(record,indent=2))
print(json.dumps(record),flush=True)
if not record['verified']:raise RuntimeError('SHA-256 mismatch')
