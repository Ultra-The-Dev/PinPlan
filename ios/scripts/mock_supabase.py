#!/usr/bin/env python3
"""A tiny stand-in for Supabase, used by the iOS screenshots workflow.

The simulator shares the runner's network, so the real app (launched with `--cloud-test http://127.0.0.1:PORT`)
signs in, syncs and publishes a photo report against this server. Everything it receives is logged, and the
photo report row and uploaded photos are summarised so the run shows the app's own publish path works.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UID = "00000000-0000-0000-0000-0000000000aa"
uploads = {}


def log(*a):
    print(*a, flush=True)


class H(BaseHTTPRequestHandler):
    def _send(self, status, body=None):
        data = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def log_message(self, *a):
        pass

    def do_GET(self):
        log("GET", self.path[:120])
        if self.path.startswith("/storage/v1/object/public/"):
            key = self.path.split("/storage/v1/object/public/", 1)[1]
            data = uploads.get(key)
            if data is None:
                return self._send(404, {"message": "not found"})
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        return self._send(200, [])

    def do_PATCH(self):
        self._body()
        log("PATCH", self.path[:120])
        return self._send(204)

    def do_POST(self):
        body = self._body()
        path = self.path
        if path.startswith("/auth/v1/token"):
            log("AUTH sign-in")
            return self._send(200, {"access_token": "test-access", "refresh_token": "test-refresh", "expires_in": 3600,
                                    "user": {"id": UID, "email": "test@example.com"}})
        if path.startswith("/storage/v1/object/"):
            key = path.split("/storage/v1/object/", 1)[1].split("?")[0]
            uploads[key] = body
            log(f"UPLOAD {key} {len(body)} bytes type={self.headers.get('Content-Type')} upsert={self.headers.get('x-upsert')}")
            return self._send(200, {"Key": key})
        if path.startswith("/rest/v1/photo_reports"):
            row = json.loads(body or b"{}")
            snap = row.get("snapshot", {})
            photos = snap.get("photos", [])
            log("PHOTO_REPORT id=%s len=%d project=%s title=%r photos=%d" % (row.get("id"), len(row.get("id", "")), row.get("project_id"), snap.get("title"), len(photos)))
            for p in photos:
                key = p.get("url", "").split("/storage/v1/object/public/", 1)[-1]
                log("  photo %r caption=%r uploaded=%s" % (key[-40:], p.get("caption"), key in uploads))
            return self._send(201, [row])
        log("POST", path[:120], len(body), "bytes")
        return self._send(201, [])


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 54399
    log(f"mock supabase on 127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
