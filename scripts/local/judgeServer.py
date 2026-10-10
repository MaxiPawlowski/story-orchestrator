"""Story Orchestrator local judge server (v2.8 plan 14, A1).

Serves a System One decision model on 127.0.0.1 with TypeSafe's wire:
  GET  /health        -> {"ok", "model", "modelPath", "backend", "device", "loaded"}
  POST /v1/systemone  -> {"model", "answers", "usage"}

Backends:
  decider  in-process `decider-ai` (Mapika/decider), GGUF through its llama.cpp engine.
  proxy    forwards /v1/systemone to another System One server (e.g. jevk5-serve for Plumb-4B)
           and adds /health with the model id and path.

Started by scripts/local/judge.mjs (the tray's Start). Stdlib only, apart from the backend.
"""

import argparse
import json
import math
import os
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOOPBACK = {"127.0.0.1", "localhost", "::1"}
MAX_BODY_BYTES = 1_000_000


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def clamp01(value):
    return min(1.0, max(0.0, float(value)))


def noul_of(raw):
    if finite(raw):
        return clamp01(raw)
    if not isinstance(raw, dict):
        return None
    for key in ("noul", "probability", "p", "yes"):
        if finite(raw.get(key)):
            return clamp01(raw[key])
    probs = raw.get("probabilities") or raw.get("probs")
    if isinstance(probs, dict):
        for key in ("true", "True", "yes", "Yes"):
            if finite(probs.get(key)):
                return clamp01(probs[key])
    return None


def distribution(raw):
    if not isinstance(raw, dict):
        return None
    probs = raw.get("probabilities") or raw.get("probs")
    if not isinstance(probs, dict):
        return None
    clean = {str(key): float(value) for key, value in probs.items() if finite(value)}
    total = sum(clean.values())
    if not clean or total <= 0:
        return None
    return {key: value / total for key, value in clean.items()}


def choice_answer(raw, question):
    options = list((question.get("criteria") or {}).keys())
    probs = distribution(raw)
    if probs is None:
        return None
    probs = {key: probs.get(key, 0.0) for key in options}
    total = sum(probs.values())
    if total <= 0:
        return None
    probs = {key: value / total for key, value in probs.items()}
    choice = max(options, key=lambda key: probs[key])
    return {"type": "choice", "choice": choice, "confidence": probs[choice], "probabilities": probs}


def score_answer(raw, question):
    levels = list(question.get("criteria") or [])
    probs = distribution(raw)
    if probs is None or not levels:
        return None
    by_index = {}
    for index, level in enumerate(levels):
        value = probs.get(str(index))
        by_index[str(index)] = value if value is not None else probs.get(str(level), 0.0)
    total = sum(by_index.values())
    if total <= 0:
        return None
    by_index = {key: value / total for key, value in by_index.items()}
    score = sum(int(key) * value for key, value in by_index.items())
    top = max(by_index.values())
    return {"type": "score", "score": score, "confidence": top, "probabilities": by_index}


def normalize_answers(raw_answers, questions):
    answers = {}
    if not isinstance(raw_answers, dict):
        return answers
    for key, question in questions.items():
        raw = raw_answers.get(key)
        if raw is None:
            continue
        kind = question.get("type")
        if kind == "noul":
            value = noul_of(raw)
            if value is not None:
                answers[key] = {"type": "noul", "noul": value}
        elif kind == "choice":
            answer = choice_answer(raw, question)
            if answer:
                answers[key] = answer
        elif kind == "score":
            answer = score_answer(raw, question)
            if answer:
                answers[key] = answer
    return answers


def shape_issues(body):
    if not isinstance(body, dict):
        return ["body must be a JSON object"]
    issues = []
    if not isinstance(body.get("state"), dict):
        issues.append("state must be an object")
    questions = body.get("questions")
    if not isinstance(questions, dict) or not questions:
        return issues + ["questions must be a non-empty object"]
    for key, question in questions.items():
        if not isinstance(question, dict) or not str(question.get("instructions", "")).strip():
            issues.append(f"{key}: missing instructions")
        elif question.get("type") not in ("noul", "choice", "score"):
            issues.append(f"{key}: unknown type")
    return issues


class DeciderBackend:
    name = "decider"

    def __init__(self, args):
        if args.gpu_layers == 0:
            os.environ["CUDA_VISIBLE_DEVICES"] = ""
        from decider.infer import Decider

        options = {"n_ctx": args.n_ctx, "n_gpu_layers": args.gpu_layers}
        if args.threads:
            options["n_threads"] = args.threads
        folder, file = os.path.split(os.path.abspath(args.model_path))
        self.decider = Decider(folder, gguf_file=file, gguf_options=options)
        self.max_state_tokens = args.max_state_tokens
        self.device = "cpu" if args.gpu_layers == 0 else f"gpu-layers:{args.gpu_layers}"

    def ask(self, state, questions):
        out = self.decider.system_one(state, questions, max_state_tokens=self.max_state_tokens)
        usage = out.get("usage") if isinstance(out, dict) else None
        return (out.get("answers") if isinstance(out, dict) else None), usage


class ProxyBackend:
    name = "proxy"
    device = "upstream"

    def __init__(self, args):
        self.url = args.upstream.rstrip("/") + "/v1/systemone"

    def ask(self, state, questions):
        data = json.dumps({"state": state, "questions": questions}).encode("utf-8")
        request = urllib.request.Request(self.url, data=data, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=30) as response:
            out = json.loads(response.read().decode("utf-8"))
        return out.get("answers"), out.get("usage")


def make_handler(state):
    class Handler(BaseHTTPRequestHandler):
        server_version = "so-local-judge/1"

        def log_message(self, fmt, *values):
            sys.stderr.write("[local-judge] " + (fmt % values) + "\n")

        def reply(self, status, body):
            data = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path.rstrip("/") != "/health":
                return self.reply(404, {"error": "not found"})
            return self.reply(200, {
                "ok": state["backend"] is not None,
                "model": state["model_id"],
                "modelPath": state["model_path"],
                "backend": state["backend_name"],
                "device": getattr(state["backend"], "device", None),
                "loaded": state["backend"] is not None,
                "loadSeconds": state["load_seconds"],
            })

        def do_POST(self):
            if self.path.rstrip("/") != "/v1/systemone":
                return self.reply(404, {"error": "not found"})
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY_BYTES:
                return self.reply(413, {"error": "request too large", "tooLarge": True})
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                return self.reply(400, {"error": "request body is not JSON"})
            issues = shape_issues(body)
            if issues:
                return self.reply(400, {"error": "invalid request", "issues": issues})
            started = time.perf_counter()
            try:
                with state["lock"]:
                    raw, usage = state["backend"].ask(body["state"], body["questions"])
            except ValueError as error:
                text = str(error)
                if "token" in text.lower() or "context" in text.lower():
                    return self.reply(413, {"error": "request too large for the local model", "tooLarge": True, "detail": text})
                return self.reply(400, {"error": text})
            except Exception as error:
                return self.reply(500, {"error": f"the local model failed: {error}"})
            answers = normalize_answers(raw, body["questions"])
            usage = usage if isinstance(usage, dict) else {}
            return self.reply(200, {
                "model": state["model_id"],
                "answers": answers,
                "usage": {"input_tokens": int(usage.get("input_tokens") or 0), "output_tokens": int(usage.get("output_tokens") or 0)},
                "latencyMs": round((time.perf_counter() - started) * 1000),
            })

    return Handler


SELF_TEST = [
    ({"a": 0.8}, {"a": {"type": "noul", "instructions": "x"}}, {"a": {"type": "noul", "noul": 0.8}}),
    ({"a": {"noul": 1.4}}, {"a": {"type": "noul", "instructions": "x"}}, {"a": {"type": "noul", "noul": 1.0}}),
    ({"a": {"probabilities": {"true": 0.3, "false": 0.7}}}, {"a": {"type": "noul", "instructions": "x"}}, {"a": {"type": "noul", "noul": 0.3}}),
    ({"a": {"choice": "y", "probabilities": {"x": 1, "y": 3}}}, {"a": {"type": "choice", "instructions": "x", "criteria": {"x": None, "y": None}}},
     {"a": {"type": "choice", "choice": "y", "confidence": 0.75, "probabilities": {"x": 0.25, "y": 0.75}}}),
    ({"a": {"probabilities": {"low": 0.5, "high": 0.5}}}, {"a": {"type": "score", "instructions": "x", "criteria": ["low", "high"]}},
     {"a": {"type": "score", "score": 0.5, "confidence": 0.5, "probabilities": {"0": 0.5, "1": 0.5}}}),
    ({"a": {"probabilities": {"0": 0.2, "1": 0.8}}}, {"a": {"type": "score", "instructions": "x", "criteria": ["low", "high"]}},
     {"a": {"type": "score", "score": 0.8, "confidence": 0.8, "probabilities": {"0": 0.2, "1": 0.8}}}),
    ({"a": "nonsense", "b": 0.1}, {"a": {"type": "noul", "instructions": "x"}}, {}),
]


def self_test():
    failures = 0
    for raw, questions, expected in SELF_TEST:
        got = normalize_answers(raw, questions)
        if json.dumps(got, sort_keys=True) != json.dumps(expected, sort_keys=True):
            failures += 1
            print(f"FAIL {raw!r}: {got!r} != {expected!r}")
    if shape_issues({"state": {}, "questions": {"a": {"type": "wat", "instructions": "x"}}}) != ["a: unknown type"]:
        failures += 1
        print("FAIL shape_issues")
    print("self-test ok" if failures == 0 else f"self-test: {failures} failed")
    return 0 if failures == 0 else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description="Story Orchestrator local judge server")
    parser.add_argument("--backend", choices=["decider", "proxy"], default="decider")
    parser.add_argument("--model-path", default="")
    parser.add_argument("--model-id", default="")
    parser.add_argument("--upstream", default="")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8095)
    parser.add_argument("--threads", type=int, default=0)
    parser.add_argument("--gpu-layers", type=int, default=0)
    parser.add_argument("--n-ctx", type=int, default=32768)
    parser.add_argument("--max-state-tokens", type=int, default=28800)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return self_test()
    if args.host not in LOOPBACK:
        print(f"refusing to listen on {args.host}: the local judge listens on 127.0.0.1 only", file=sys.stderr)
        return 2
    if not args.model_id:
        print("--model-id is required (the served model id a calibration row binds to)", file=sys.stderr)
        return 2
    if args.backend == "decider" and not os.path.isfile(args.model_path):
        print(f"model file not found: {args.model_path} (run: node scripts/local/judge.mjs setup --yes)", file=sys.stderr)
        return 2
    if args.backend == "proxy" and not args.upstream:
        print("--upstream is required for the proxy backend", file=sys.stderr)
        return 2
    started = time.perf_counter()
    backend = DeciderBackend(args) if args.backend == "decider" else ProxyBackend(args)
    state = {
        "backend": backend,
        "backend_name": backend.name,
        "model_id": args.model_id,
        "model_path": os.path.abspath(args.model_path) if args.model_path else None,
        "lock": threading.Lock(),
        "load_seconds": round(time.perf_counter() - started, 1),
    }
    server = ThreadingHTTPServer((args.host, args.port), make_handler(state))
    print(f"[local-judge] {args.model_id} ({backend.name}, {getattr(backend, 'device', '?')}) on http://{args.host}:{args.port}, loaded in {state['load_seconds']} s", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
