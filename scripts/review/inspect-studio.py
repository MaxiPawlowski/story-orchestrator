import sys, json
from pathlib import Path
backend = Path.home()/'.unsloth/studio/unsloth_studio/Lib/site-packages/studio/backend'
sys.path.insert(0,str(backend))
from utils.hf_cache_settings import get_hf_cache_paths
from utils.openai_auto_switch_settings import get_openai_auto_switch_enabled, get_model_overrides
print('cache',get_hf_cache_paths())
print('auto_switch',get_openai_auto_switch_enabled())
print('overrides',get_model_overrides())
