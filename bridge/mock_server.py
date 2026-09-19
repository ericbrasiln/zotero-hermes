#!/usr/bin/env python3
"""Minimal local bridge used before integrating a real Hermes service."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any


def audit_payload(payload: dict[str, Any]) -> dict[str, Any]:
    items = payload.get("items", [])
    findings: list[dict[str, Any]] = []
    titles: defaultdict[str, list[str]] = defaultdict(list)
    required = (("creators", "author"), ("date", "date"), ("publisher", "publisher"),
                ("ISBN", "ISBN"), ("language", "language"))
    for item in items:
        key = str(item.get("key", ""))
        title = str(item.get("title", ""))
        if title:
            titles[title.casefold()].append(key)
        for field, label in required:
            value = item.get(field)
            if not value:
                findings.append({
                    "itemKey": key,
                    "field": field,
                    "current": value or "",
                    "proposed": None,
                    "kind": f"missing_{label}",
                    "confidence": "high",
                    "reason": f"Campo obrigatório ausente: {label}",
                    "sources": [],
                    "action": "review",
                })
        isbn = str(item.get("ISBN", ""))
        if isbn and not re.fullmatch(r"[0-9Xx -]+", isbn):
            findings.append({
                "itemKey": key, "field": "ISBN", "current": isbn,
                "proposed": None, "kind": "suspicious_isbn", "confidence": "high",
                "reason": "ISBN contém caracteres inesperados", "sources": [], "action": "review",
            })
    for title, keys in titles.items():
        if len(keys) > 1:
            for key in keys:
                findings.append({
                    "itemKey": key, "field": "title", "current": title,
                    "proposed": None, "kind": "duplicate_title", "confidence": "medium",
                    "reason": "Título repetido na coleção; pode representar edições diferentes",
                    "sources": [], "action": "review",
                })
    return {
        "schemaVersion": "1.0",
        "collectionKey": payload.get("collection", {}).get("key", ""),
        "findings": findings,
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict[str, Any]) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send(200, {"status": "ok", "service": "zotero-hermes-mock"})
        else:
            self._send(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/audits":
            self._send(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            self._send(200, audit_payload(payload))
        except (ValueError, json.JSONDecodeError) as error:
            self._send(400, {"error": "invalid_json", "detail": str(error)})

    def log_message(self, format: str, *_args: Any) -> None:
        return


def main() -> None:
    server = HTTPServer(("127.0.0.1", 8765), Handler)
    print("zotero-hermes mock bridge listening on http://127.0.0.1:8765", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
