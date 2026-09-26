import json, sys, time
sys.argv = [sys.argv[0], "88000", sys.argv[1]]
exec(open("/tmp/probe.py").read().split("threading.Thread(target=sampler")[0])
threading.Thread(target=sampler, daemon=True).start()
res = {"abort_s": ABORT_S}
G, nG = make_prompt(7007)
res["tokens"] = nG; print("tokens", nG, flush=True)
res["abort"] = complete(G, ABORT_S); print("abort", res["abort"], flush=True)
res["retry"] = complete(G, 400); print("retry", res["retry"], flush=True)
time.sleep(3); stop = True; time.sleep(2.5)
res["metrics"] = log
json.dump(res, open("/tmp/llama-abort-probe2.json", "w"), indent=1)
print("done", flush=True)
