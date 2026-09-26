import json, random, urllib.request
URL="http://127.0.0.1:18080"
VOCAB = ("innkeeper repacked tar pot during narrow lumber yard dusk guards watched river bridge merchant "
         "lantern courier ledger archive north road washed out harbour tide rope cellar wagon smith anvil "
         "banner council tower gate market spice copper silver thread loom weaver candle chapel bell").split()
TARGET=88000
def post(path, body):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=300))
rnd = random.Random(6006)
words = ["Probe 6006."] + [rnd.choice(VOCAB) for _ in range(int(TARGET * 0.95))]
text = " ".join(words)
n = len(post("/tokenize", {"content": text})["tokens"])
while n < TARGET:
    text += " " + " ".join(rnd.choice(VOCAB) for _ in range(TARGET - n)); n = len(post("/tokenize", {"content": text})["tokens"])
print(n, len(text))
open("promptF.txt","w").write(text)
