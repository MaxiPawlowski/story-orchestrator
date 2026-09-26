import json
import os
import sqlite3
import sys

DB = os.path.join(os.path.expanduser("~"), ".local", "share", "opencode", "opencode.db").replace("\\", "/")


SKIP = {"account", "control_account", "credential", "session_share", "account_state"}


def connect():
    return sqlite3.connect("file:" + DB + "?mode=ro", uri=True)


def tables(c):
    return [n for (n,) in c.execute("select name from sqlite_master where type='table' order by name")]


def columns(c, t):
    return [(r[1], r[2]) for r in c.execute(f'pragma table_info("{t}")')]


def main():
    mode = sys.argv[1]
    c = connect()
    if mode == "schema":
        print(json.dumps({t: [n for n, _ in columns(c, t)] for t in tables(c)}))
        return
    if mode == "counts":
        print(json.dumps({t: c.execute(f'select count(*) from "{t}"').fetchone()[0] for t in tables(c)}))
        return
    if mode == "attrib":
        pattern = sys.argv[2]
        ids = [r[0] for r in c.execute("select id from session where directory like ?", (pattern,))]
        out = {"session": len(ids)}
        if ids:
            marks = ",".join("?" * len(ids))
            for t, col in (("message", "session_id"), ("part", "session_id"), ("todo", "session_id"), ("session_message", "session_id"), ("session_input", "session_id"), ("session_context_epoch", "session_id"), ("session_share", "session_id"), ("event", "aggregate_id"), ("event_sequence", "aggregate_id")):
                out[t] = c.execute(f'select count(*) from "{t}" where "{col}" in ({marks})', ids).fetchone()[0]
        out["project_directory"] = c.execute("select count(*) from project_directory where directory like ?", (pattern,)).fetchone()[0]
        print(json.dumps(out))
        return
    if mode == "like":
        needles = sys.argv[2:]
        out = {}
        for t in tables(c):
            if t in SKIP:
                continue
            text_cols = [n for n, ty in columns(c, t) if ty.upper() in ("TEXT", "") or "CHAR" in ty.upper() or ty.upper() == "BLOB"]
            for needle in needles:
                total = 0
                for col in text_cols:
                    total += c.execute(f'select count(*) from "{t}" where cast("{col}" as text) like ?', (f"%{needle}%",)).fetchone()[0]
                if total:
                    out.setdefault(t, {})[needle] = total
        print(json.dumps(out))
        return
    raise SystemExit("mode: schema | counts | like <needle>...")


main()
