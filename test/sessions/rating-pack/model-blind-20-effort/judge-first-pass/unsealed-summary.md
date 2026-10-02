# Judge first pass, unsealed

Opened with `key.sealed.json` **after** the judge scored all 20 turns blind (`scores.json`, letters only). Judge: `openai/gpt-6-astra`. Read this only after your own rating.

| config | turns | mean coherence | mean prose | mean scene | mean agency | mean overall | mean rank (1 best) | first places |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EB-stga-b400 | 20 | 4.70 | 4.65 | 3.55 | 4.90 | 3.60 | 2.20 | 7 |
| EB-stga-b128 | 20 | 4.40 | 4.70 | 3.45 | 4.90 | 3.35 | 2.50 | 5 |
| TB2-v11-think-stga | 20 | 4.45 | 4.35 | 3.30 | 4.80 | 3.35 | 2.50 | 5 |
| BL1-v11-tc-minpfirst | 20 | 4.40 | 4.85 | 3.05 | 4.85 | 3.20 | 2.80 | 3 |

Preferred (lowest mean rank): **EB-stga-b400**.
