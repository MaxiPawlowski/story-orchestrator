# Judge first pass, unsealed

Opened with `key.sealed.json` **after** the judge scored all 20 turns blind (`scores.json`, letters only). Judge: `openai/gpt-6-astra`. Read this only after your own rating.

| config | turns | mean coherence | mean prose | mean scene | mean agency | mean overall | mean rank (1 best) | first places |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL2-v12-tc-minpfirst | 20 | 4.60 | 4.55 | 3.45 | 4.70 | 3.60 | 1.85 | 10 |
| BL1-v11-tc-minpfirst | 20 | 4.45 | 4.75 | 3.50 | 4.90 | 3.55 | 2.00 | 6 |
| BL0-v11-prod-asis | 20 | 3.65 | 3.75 | 2.90 | 4.60 | 2.50 | 3.05 | 1 |
| BL3-cydonia-q5-mistral-minpfirst | 20 | 3.95 | 4.45 | 2.75 | 4.30 | 2.60 | 3.10 | 3 |

Preferred (lowest mean rank): **BL2-v12-tc-minpfirst**.
