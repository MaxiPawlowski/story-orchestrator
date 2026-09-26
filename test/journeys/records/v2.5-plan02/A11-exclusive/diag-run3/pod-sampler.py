import subprocess, time, urllib.request, sys
out = open(sys.argv[1], "a", buffering=1)
out.write("utc\tprocessing\tn_decode\tprompt_tokens\tcached\tpredicted\tconns\n")
end = time.time() + float(sys.argv[2])
while time.time() < end:
    try:
        t = urllib.request.urlopen("http://127.0.0.1:8080/metrics", timeout=5).read().decode()
        m = {l.split()[0][9:]: l.split()[1] for l in t.splitlines() if l.startswith("llamacpp:")}
    except Exception as e:
        m = {}
    ss = subprocess.run(["ss", "-tnH", "state", "established", "( sport = :8080 )"], capture_output=True, text=True).stdout.split("\n")
    peers = " ".join(l.split()[-1] for l in ss if l.strip())
    out.write("%s\t%s\t%s\t%s\t%s\t%s\t%s\n" % (time.strftime("%H:%M:%S", time.gmtime()), m.get("requests_processing"), m.get("n_decode_total"), m.get("prompt_tokens_total"), m.get("prompt_tokens_cached_total"), m.get("tokens_predicted_total"), peers))
    time.sleep(1)
