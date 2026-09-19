#!/usr/bin/env python3
"""Tailscale-facing bridge that delegates audits to the Hermes API server."""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

UPSTREAM = os.environ.get(
    "HERMES_API_URL", "http://127.0.0.1:8642/v1/chat/completions"
)
MODEL = os.environ.get("HERMES_MODEL", "hermes-agent")
BRIDGE_TOKEN = os.environ.get("BRIDGE_TOKEN", "")

SYSTEM_PROMPT = """You audit Zotero bibliographic metadata. Return only valid JSON.
Do not use markdown. Do not invent missing bibliographic data. Do not modify Zotero.
The response must have exactly this shape:
{"schemaVersion":"1.0","collectionKey":"...","findings":[{
"itemKey":"...","field":"...","current":"...","proposed":null,
"kind":"...","confidence":"high|medium|low","reason":"...",
"sources":[],"action":"review"}]}
Use action 'review' for every finding. Report only evidence-based findings.
"""


def _json_response(status: int, body: dict[str, Any]) -> tuple[int, bytes]:
    return status, json.dumps(body, ensure_ascii=False).encode("utf-8")


def validate_result(result: Any, collection_key: str) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise ValueError("Hermes response is not an object")
    findings = result.get("findings")
    if not isinstance(findings, list):
        raise ValueError("Hermes response has no findings array")
    clean: list[dict[str, Any]] = []
    for finding in findings:
        if not isinstance(finding, dict):
            raise ValueError("Finding is not an object")
        required = ("itemKey", "field", "current", "proposed", "kind", "confidence", "reason", "sources", "action")
        if any(key not in finding for key in required):
            raise ValueError("Finding is missing required fields")
        if finding["confidence"] not in {"high", "medium", "low"}:
            raise ValueError("Finding has invalid confidence")
        if finding["action"] != "review":
            raise ValueError("Bridge only permits review actions")
        clean.append({key: finding[key] for key in required})
    return {"schemaVersion": "1.0", "collectionKey": collection_key, "findings": clean}


def call_hermes(payload: dict[str, Any]) -> dict[str, Any]:
    collection_key = str(payload.get("collection", {}).get("key", ""))
    prompt = (
        "Audit this Zotero collection. Return the required JSON schema.\n\n"
        + json.dumps(payload, ensure_ascii=False)
    )
    request_body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
    }
    request = Request(
        UPSTREAM,
        data=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {os.environ['HERMES_API_KEY']}", "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=int(os.environ.get("HERMES_API_TIMEOUT", "120"))) as response:
        upstream = json.loads(response.read().decode("utf-8"))
    content = upstream["choices"][0]["message"]["content"]
    return validate_result(json.loads(content), collection_key)


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict[str, Any]) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _authorized(self) -> bool:
        return bool(BRIDGE_TOKEN) and self.headers.get("Authorization") == f"Bearer {BRIDGE_TOKEN}"

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send(200, {"status": "ok", "service": "zotero-hermes-bridge"})
        else:
            self._send(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/audits":
            self._send(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._send(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            self._send(200, call_hermes(payload))
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            self._send(400, {"error": "invalid_audit_or_response", "detail": str(error)})
        except (HTTPError, URLError, TimeoutError) as error:
            self._send(502, {"error": "hermes_unavailable", "detail": str(error)})

    def log_message(self, format: str, *_args: Any) -> None:
        return


def main() -> None:
    if not os.environ.get("HERMES_API_KEY"):
        raise SystemExit("HERMES_API_KEY is required")
    if not BRIDGE_TOKEN:
        raise SystemExit("BRIDGE_TOKEN is required")
    host = os.environ.get("BRIDGE_HOST", "127.0.0.1")
    port = int(os.environ.get("BRIDGE_PORT", "18766"))
    server = HTTPServer((host, port), Handler)
    print(f"zotero-hermes bridge listening on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
