"""Adds the house-rule context (scene + fired world-book entries) to test/fixtures/judge/adolion-house-rules.json.

Reads the Adolion campaign at the commit pinned in scripts/debug/adolion-fresh.pin.json (`git show <pin>:<path>`, so the
campaign's checkout does not matter) and writes, per row, `context`:
- scene: player "the heir" (the saga's player_intro asks for the Nightriver heir), the row's playerMessage, the reply
  speaker's authored roster role, and the group members: roster members enabled on at least one path into the row's
  checkpoint, replaying cast_changes the way the campaign's scripts/check_cast.py does.
- worldBook: entries of the saga's required books that are active at the checkpoint (checkpoint-gated entries enabled
  on every path into it, other entries by their file flag) and fire for a keyword scan of the player's line plus the
  reply (ST rules: whole words, case-insensitive, /regex/ keys, secondary-key logic, character filter; recursion is off
  in every campaign book). The reply stands in for the preceding turns, which the fixture does not have.
Labels, ids and every other field are left untouched.

    python scripts/spike/typesafe/adolion-house-rules-context.py
"""
import io
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "test" / "fixtures" / "judge" / "adolion-house-rules.json"
PLAYER = "the heir"


def at_pin(repo, commit, path):
    shown = subprocess.run(["git", "-C", str(repo), "show", f"{commit}:{path}"], capture_output=True, check=True)
    return json.loads(shown.stdout.decode("utf-8"))


def successors(story):
    out = {}
    for transition in story["transitions"]:
        out.setdefault(transition["from"], []).append(transition["to"])
    for checkpoint in story["checkpoints"]:
        alternate = (checkpoint.get("agency") or {}).get("alternate")
        if alternate:
            out.setdefault(checkpoint["id"], []).append(alternate)
    return out


def walk(story, step):
    checkpoints = {c["id"]: c for c in story["checkpoints"]}
    out = successors(story)
    start = next((c["id"] for c in story["checkpoints"] if c.get("start")), story["checkpoints"][0]["id"])
    reached = {}
    seen = set()
    stack = [(start, frozenset())]
    while stack:
        cid, carried = stack.pop()
        if (cid, carried) in seen:
            continue
        seen.add((cid, carried))
        carried = step(checkpoints[cid].get("effects") or {}, carried)
        reached.setdefault(cid, []).append(carried)
        stack += [(n, carried) for n in out.get(cid, [])]
    return reached


def muted_step(effects, muted):
    changes = effects.get("cast_changes") or {}
    return frozenset((muted | set(changes.get("disable", []))) - set(changes.get("enable", [])))


def gated_step(effects, on):
    world = effects.get("world_info") or {}
    on = set(on)
    for group in world.get("enable", []):
        on |= {(group["lorebook"], comment) for comment in group["comments"]}
    for group in world.get("disable", []):
        on -= {(group["lorebook"], comment) for comment in group["comments"]}
    return frozenset(on)


def key_hit(key, text):
    key = key.strip()
    if not key:
        return False
    regex = re.match(r"^/(.*)/([a-z]*)$", key)
    if regex:
        return re.search(regex.group(1), text, re.I if "i" in regex.group(2) else 0) is not None
    return re.search(r"(?<!\w)" + re.escape(key) + r"(?!\w)", text, re.I) is not None


def fires(entry, text, speaker):
    names = (entry.get("characterFilter") or {}).get("names") or []
    if names and ((speaker in names) == bool((entry.get("characterFilter") or {}).get("isExclude"))):
        return False
    if entry.get("constant"):
        return True
    if not any(key_hit(key, text) for key in entry.get("key", [])):
        return False
    secondary = [key for key in entry.get("keysecondary", []) if key.strip()]
    if not secondary or not entry.get("selective"):
        return True
    hits = [key_hit(key, text) for key in secondary]
    return {0: any(hits), 1: not all(hits), 2: not any(hits), 3: all(hits)}[entry.get("selectiveLogic", 0)]


def main():
    pin = json.loads((ROOT / "scripts" / "debug" / "adolion-fresh.pin.json").read_text(encoding="utf-8"))
    repo, commit = pathlib.Path(pin["repo"]), pin["commit"]
    story = at_pin(repo, commit, "build/story/adolion-saga.story.json")
    books = {name: at_pin(repo, commit, f"build/lorebooks/{name}.json") for name in story["requirements"]["lorebooks"]}
    gated = {(group["lorebook"], comment) for c in story["checkpoints"] for kind in ("enable", "disable")
             for group in ((c.get("effects") or {}).get("world_info") or {}).get(kind, []) for comment in group["comments"]}
    muted = {cid: frozenset.intersection(*sets) for cid, sets in walk(story, muted_step).items()}
    enabled = {cid: frozenset.intersection(*sets) for cid, sets in walk(story, gated_step).items()}
    roster = story["roster"]
    roles = {member["name"]: member.get("role") for member in roster}
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for row in fixture["rows"]:
        cid = row["checkpoint"]
        text = row["playerMessage"] + "\n" + row["reply"]["text"]
        world = []
        for name, book in books.items():
            for entry in sorted(book["entries"].values(), key=lambda item: item["uid"]):
                ref = (name, entry["comment"])
                active = ref in enabled[cid] if ref in gated else not entry.get("disable")
                if active and entry.get("content", "").strip() and fires(entry, text, row["reply"]["speaker"]):
                    world.append({"comment": entry["comment"], "text": entry["content"], "constant": bool(entry.get("constant"))})
        scene = {"player": PLAYER, "playerMessage": row["playerMessage"]}
        if roles.get(row["reply"]["speaker"]):
            scene["speakerRole"] = roles[row["reply"]["speaker"]]
        scene["groupMembers"] = [member["name"] for member in roster if member["name"] not in muted[cid]]
        row["context"] = {"scene": scene, "worldBook": world}
    fixture["contextSource"] = (
        f"context added 2026-10-02 by scripts/spike/typesafe/adolion-house-rules-context.py from adolion-campaign {pin['commit'][:7]} "
        "(labels untouched): scene = player 'the heir' (saga player_intro), the row's playerMessage, the speaker's roster role, "
        "group members enabled on at least one path into the checkpoint (cast_changes replayed as in check_cast.py); "
        "worldBook = entries of the saga's required books active at the checkpoint (gated entries on every path, others by file flag) "
        "that fire for a keyword scan of playerMessage + reply. The reply stands in for the preceding turns, so this is an upper bound "
        "on what a live scan carries for rule 6."
    )
    io.open(FIXTURE, "w", encoding="utf-8", newline="\r\n").write(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n")
    counts = [len(row["context"]["worldBook"]) for row in fixture["rows"]]
    print(f"{len(fixture['rows'])} rows, world-book entries per row {min(counts)}-{max(counts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
