import json,sys,shutil,uuid
from pathlib import Path
root=Path(sys.argv[1]); ext=Path(sys.argv[2]); data=root/'host/data/default-user'
s=json.loads((data/'settings.json').read_text(encoding='utf-8-sig'))
s.update(firstRun=False,username='Review Player',main_api='openai')
model='TheDrummer/Artemis-31B-v1.1-GGUF:Q4_K_M'
o=s['oai_settings'];o.update(chat_completion_source='custom',custom_url='http://127.0.0.1:8888/v1',custom_model=model,custom_include_body='enable_thinking: false',custom_include_headers='',custom_exclude_body='',openai_max_tokens=384,openai_max_context=32768,stream_openai=True,preset_settings_openai='Artemis Narration',temperature=0.8,top_p=0.95)
def write(path,value):path.write_text(json.dumps(value,indent=2),encoding='utf-8')
base=json.loads((data/'OpenAI Settings/Default.json').read_text(encoding='utf-8-sig'))
base.update(o)
write(data/'OpenAI Settings/Artemis Narration.json',base)
bg=dict(base); bg.update(temperature=0.2,top_p=0.9,stream_openai=False,openai_max_tokens=2048)
write(data/'OpenAI Settings/Artemis Background.json',bg)
secret_id=str(uuid.uuid4());secret=json.loads((data/'secrets.json').read_text(encoding='utf-8-sig'))
secret['api_key_custom']=[{'id':secret_id,'value':(root/'private/studio-key.txt').read_text().strip(),'label':'Artemis review','active':True}]
write(data/'secrets.json',secret)
profile={'id':'so-review-artemis','name':'Artemis Background Review','mode':'cc','api':'custom','api-url':o['custom_url'],'model':model,'preset':'Artemis Background','secret-id':secret_id,'exclude':[]}
s['extension_settings']['connectionManager']={'profiles':[profile],'selectedProfile':None}
# Start unconfigured; J1 exercises choosing the profile through the shipped UI.
s['extension_settings'].pop('story-orchestrator',None)
s['world_info_settings'].setdefault('world_info',{})['globalSelect']=['Xentar Checkpoints']
write(data/'settings.json',s)
for p in (ext/'examples/sun-ruins').glob('*.png'):shutil.copy2(p,data/'characters'/p.name)
shutil.copy2(ext/'examples/sun-ruins/Xentar Checkpoints.json',data/'worlds/Xentar Checkpoints.json')
group={'id':'so-review-group','name':'Story Orchestrator Review','members':['DM Narrator.png','Arin.png','Ponticius.png','Luke.png'],'avatar_url':'img/ai4.png','allow_self_responses':False,'activation_strategy':0,'generation_mode':0,'disabled_members':[],'fav':False,'chat_id':'so-review-initial','chats':['so-review-initial'],'auto_mode_delay':5,'date_added':1789750800000}
write(data/'groups/so-review-group.json',group)
(root/'fixture-setup.json').write_text(json.dumps({'group':group['name'],'profile':profile['id'],'model':model,'templates':'Chat-completion message array; embedded GGUF template applied by Studio only','narration':{'temperature':0.8,'max_tokens':384},'background':{'temperature':0.2,'max_tokens':2048},'thinking':False},indent=2))
print('Seeded disposable examples, group, lorebook, narration preset, background profile, and dedicated secret.')
