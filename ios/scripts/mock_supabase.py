#!/usr/bin/env python3
"""A tiny stand-in for Supabase, used by the iOS screenshots workflow.

The simulator shares the runner's network, so the real app (launched with `--cloud-test http://127.0.0.1:PORT`)
signs in, syncs and publishes a photo report against this server. Everything it receives is logged, and the
photo report row and uploaded photos are summarised so the run shows the app's own publish path works.

It also plays a company team (the signed-in user owns "Brightline AV" with an admin, technicians and a few
invite codes) so `--team` shows the Team screen filled in, and answers the team functions (rpc/*).
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

UID = "00000000-0000-0000-0000-0000000000aa"
TEAM_ID = "00000000-0000-0000-0000-00000000team"
uploads = {}


def ts(days=0):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


TEAM = {"id": TEAM_ID, "name": "Brightline AV", "owner_id": UID}
MEMBERS = [
    {"user_id": UID, "role": "owner", "name": "Jordan Reyes", "email": "test@example.com", "created_at": ts(-90)},
    {"user_id": "00000000-0000-0000-0000-0000000000b1", "role": "admin", "name": "Priya Shah", "email": "priya@brightline.example", "created_at": ts(-80)},
    {"user_id": "00000000-0000-0000-0000-0000000000b2", "role": "tech", "name": "Marcus Lee", "email": "marcus@brightline.example", "created_at": ts(-60)},
    {"user_id": "00000000-0000-0000-0000-0000000000b3", "role": "tech", "name": "Ana Torres", "email": "ana@brightline.example", "created_at": ts(-30)},
    {"user_id": "00000000-0000-0000-0000-0000000000b4", "role": "tech", "name": "", "email": "sam.park@brightline.example", "created_at": ts(-5)},
]
INVITES = [
    {"code": "K7QMXR4TPA", "team_id": TEAM_ID, "role": "tech", "name": "Devon Hart", "created_at": ts(-1), "expires_at": ts(13),
     "used_by": None, "used_at": None, "revoked": False},
    {"code": "H3WNC8YQZD", "team_id": TEAM_ID, "role": "admin", "name": "Office laptop", "created_at": ts(-2), "expires_at": ts(12),
     "used_by": None, "used_at": None, "revoked": False},
    {"code": "P9DKT2MUXE", "team_id": TEAM_ID, "role": "tech", "name": "Ana Torres", "created_at": ts(-31), "expires_at": ts(-17),
     "used_by": "00000000-0000-0000-0000-0000000000b3", "used_at": ts(-30), "revoked": False},
    {"code": "BQ4ZR7NVJS", "team_id": TEAM_ID, "role": "tech", "name": "Summer helper", "created_at": ts(-40), "expires_at": ts(-26),
     "used_by": None, "used_at": None, "revoked": False},
]


def query(path):
    return {k: v[0] for k, v in parse_qs(urlparse(path).query).items()}


def eq(q, key):
    v = q.get(key, "")
    return v[3:] if v.startswith("eq.") else None


def select(rows, q):
    cols = q.get("select", "*")
    if cols == "*":
        return rows
    keep = cols.split(",")
    return [{k: r.get(k) for k in keep} for r in rows]


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
        q = query(self.path)
        if self.path.startswith("/rest/v1/team_members"):
            uid, tid = eq(q, "user_id"), eq(q, "team_id")
            rows = [m for m in MEMBERS if (uid is None or m["user_id"] == uid) and (tid is None or tid == TEAM_ID)]
            if uid is not None:
                rows = [dict(r, team_id=TEAM_ID) for r in rows]
            log("TEAM members", len(rows))
            return self._send(200, select(rows, q))
        if self.path.startswith("/rest/v1/teams"):
            return self._send(200, select([TEAM] if eq(q, "id") in (None, TEAM_ID) else [], q))
        if self.path.startswith("/rest/v1/team_invites"):
            rows = sorted(INVITES, key=lambda i: i["created_at"], reverse=True)
            log("TEAM invites", len(rows))
            return self._send(200, select(rows, q))
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
        body = self._body()
        log("PATCH", self.path[:120])
        q = query(self.path)
        values = json.loads(body or b"{}")
        if self.path.startswith("/rest/v1/team_invites"):
            for i in INVITES:
                if i["code"] == eq(q, "code"):
                    i.update(values)
        elif self.path.startswith("/rest/v1/teams"):
            TEAM["name"] = values.get("name", TEAM["name"])
        elif self.path.startswith("/rest/v1/team_members"):
            for m in MEMBERS:
                if m["user_id"] == eq(q, "user_id"):
                    m["name"] = values.get("name", m["name"])
        return self._send(204)

    def do_POST(self):
        body = self._body()
        path = self.path
        if path.startswith("/auth/v1/token"):
            log("AUTH sign-in")
            return self._send(200, {"access_token": "test-access", "refresh_token": "test-refresh", "expires_in": 3600,
                                    "user": {"id": UID, "email": "test@example.com"}})
        if path.startswith("/rest/v1/rpc/"):
            fn = path.split("/rest/v1/rpc/", 1)[1].split("?")[0]
            args = json.loads(body or b"{}")
            log("RPC", fn, json.dumps(args)[:120])
            if fn == "team_invite_info":
                inv = next((i for i in INVITES if i["code"] == args.get("p_code") and not i["revoked"] and not i["used_by"]), None)
                return self._send(200, None if inv is None else {"team": TEAM["name"], "role": inv["role"], "name": inv["name"], "expires_at": inv["expires_at"]})
            if fn == "accept_team_invite":
                return self._send(200, {"team_id": TEAM_ID, "team": TEAM["name"], "role": "owner"})
            if fn == "create_team":
                return self._send(200, TEAM_ID)
            if fn == "set_team_member_role":
                for m in MEMBERS:
                    if m["user_id"] == args.get("p_user") and m["role"] != "owner":
                        m["role"] = args.get("p_role", m["role"])
                return self._send(200, None)
            if fn == "remove_team_member":
                MEMBERS[:] = [m for m in MEMBERS if m["user_id"] != args.get("p_user") or m["role"] == "owner"]
                return self._send(200, None)
            return self._send(404, {"code": "PGRST202", "message": "Could not find the function public.%s in the schema cache" % fn})
        if path.startswith("/rest/v1/team_invites"):
            row = json.loads(body or b"{}")
            row = dict({"created_at": ts(), "expires_at": ts(14), "used_by": None, "used_at": None, "revoked": False}, **row)
            INVITES.append(row)
            log("TEAM invite created", row.get("code"), row.get("role"))
            return self._send(201, [row])
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
