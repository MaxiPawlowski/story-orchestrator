import sys,json
from pathlib import Path
backend=Path.home()/'.unsloth/studio/unsloth_studio/Lib/site-packages/studio/backend'
sys.path.insert(0,str(backend))
from utils.openai_auto_switch_settings import get_model_overrides,set_model_override,get_openai_auto_switch_enabled,set_openai_auto_switch
from auth.storage import get_connection, create_api_key
root=Path(sys.argv[1]); evidence=Path(sys.argv[2]); private=root/'private'; private.mkdir(exist_ok=True)
model='TheDrummer/Artemis-31B-v1.1-GGUF:Q4_K_M'
before={'auto_switch':get_openai_auto_switch_enabled(),'overrides':get_model_overrides()}
if not (evidence/'studio-before.json').exists(): (evidence/'studio-before.json').write_text(json.dumps(before,indent=2))
config=set_model_override(model,max_seq_length=32768,kv_cache_dtype='q8_0',n_parallel=1,n_ubatch=128,speculative_type='off')
set_openai_auto_switch(True, None)
conn=get_connection()
users=conn.execute('SELECT username FROM auth_user').fetchall(); conn.close()
if len(users)!=1: raise RuntimeError('Expected one Studio account; select account explicitly')
key,row=create_api_key(users[0][0],'Story Orchestrator isolated review 2026-09-18')
(private/'studio-key.txt').write_text(key)
record={'model':model,'autoload':True,'load_settings':config,'api_key_id':row['id'],'api_key_name':row['name'],'existing_presets_preserved':all(get_model_overrides().get(k)==v for k,v in before['overrides'].items())}
(evidence/'studio-setup.json').write_text(json.dumps(record,indent=2)); print(json.dumps(record))


