import json, random, subprocess, sys, time, urllib.request, threading
URL = "http://127.0.0.1:8080"
VOCAB = ("innkeeper repacked tar pot during narrow lumber yard dusk guards watched river bridge merchant "
         "lantern courier ledger archive north road washed out harbour tide rope cellar wagon smith anvil "
         "banner council tower gate market spice copper silver thread loom weaver candle chapel bell").split()
TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 88000
ABORT_S = float(sys.argv[2]) if len(sys.argv) > 2 else 60

def post(path, body, timeout=900):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=timeout))

def make_prompt(seed):
    rnd = random.Random(seed)
    words = [f"Probe {seed}."] + [rnd.choice(VOCAB) for _ in range(int(TARGET * 0.95))]
    text = " ".join(words)
    n = len(post("/tokenize", {"content": text})["tokens"])
    while n < TARGET:
        text += " " + " ".join(rnd.choice(VOCAB) for _ in range(TARGET - n)); n = len(post("/tokenize", {"content": text})["tokens"])
    return text, n

def metrics():
    t = urllib.request.urlopen(URL + "/metrics", timeout=10).read().decode()
    out = {}
    for line in t.splitlines():
        if line.startswith("llamacpp:"):
            k, v = line.split()[:2]; out[k[9:]] = float(v)
    return out

log = []
stop = False
def sampler():
    while not stop:
        try:
            m = metrics(); log.append({"t": round(time.time(), 1), "processing": m.get("requests_processing"), "deferred": m.get("requests_deferred"), "n_decode_total": m.get("n_decode_total"), "prompt_tokens_total": m.get("prompt_tokens_total"), "tokens_predicted_total": m.get("tokens_predicted_total")})
        except Exception as e:
            log.append({"t": time.time(), "err": str(e)})
        time.sleep(2)

def complete(prompt, max_time=None):
    body = json.dumps({"prompt": prompt, "n_predict": 8, "temperature": 0, "cache_prompt": True})
    cmd = ["curl", "-s", "-o", "-", "-w", "\n%{http_code}", "-H", "Content-Type: application/json", "--data-binary", "@-", URL + "/completion"]
    if max_time: cmd[1:1] = ["--max-time", str(max_time)]
    t0 = time.time()
    p = subprocess.run(cmd, input=body.encode(), capture_output=True)
    ms = round((time.time() - t0) * 1000)
    out = p.stdout.decode(errors="replace")
    body_txt, _, code = out.rpartition("\n")
    timings = None
    try:
        timings = json.loads(body_txt).get("timings")
    except Exception:
        pass
    return {"t0": round(t0, 1), "ms": ms, "curl_rc": p.returncode, "http": code, "timings": timings}

threading.Thread(target=sampler, daemon=True).start()
res = {"target": TARGET, "abort_s": ABORT_S}
A, nA = make_prompt(1001); B, nB = make_prompt(2002); C, nC = make_prompt(3003); Dp, nD = make_prompt(4004)
res["tokens"] = {"A": nA, "B": nB, "C": nC, "D": nD}
print("tokens", res["tokens"], flush=True)
res["E1_cold_A"] = complete(A); print("E1", res["E1_cold_A"], flush=True); time.sleep(5)
res["E2_abort_B"] = complete(B, ABORT_S); print("E2a", res["E2_abort_B"], flush=True)
res["E2_retry_same_B"] = complete(B); print("E2b", res["E2_retry_same_B"], flush=True); time.sleep(5)
res["E3_abort_C"] = complete(C, ABORT_S); print("E3a", res["E3_abort_C"], flush=True)
res["E3_next_different_D"] = complete(Dp); print("E3b", res["E3_next_different_D"], flush=True)
time.sleep(4); stop = True; time.sleep(2.5)
res["metrics"] = log
json.dump(res, open("/tmp/llama-abort-probe.json", "w"), indent=1)
print("done", flush=True)
