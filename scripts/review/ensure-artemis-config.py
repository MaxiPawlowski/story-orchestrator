"""Idempotently restore the review model override without rotating API keys."""

import json
import sys
from pathlib import Path

backend = Path.home() / '.unsloth/studio/unsloth_studio/Lib/site-packages/studio/backend'
sys.path.insert(0, str(backend))

from utils.openai_auto_switch_settings import (  # noqa: E402
    get_model_overrides,
    set_model_override,
    set_openai_auto_switch,
)

MODEL = 'TheDrummer/Artemis-31B-v1.1-GGUF:Q4_K_M'

result = set_model_override(
    MODEL,
    max_seq_length=32768,
    kv_cache_dtype='q8_0',
    n_parallel=1,
    n_ubatch=128,
    speculative_type='off',
)
set_openai_auto_switch(True, None)

saved = get_model_overrides().get(MODEL)
if saved != result:
    raise RuntimeError('Artemis override did not persist')

record = {
    'model': MODEL,
    'autoSwitch': True,
    'loadSettings': result,
    'apiKeyRotated': False,
}
if len(sys.argv) > 1:
    Path(sys.argv[1]).write_text(json.dumps(record, indent=2), encoding='utf-8')
print(json.dumps(record))
