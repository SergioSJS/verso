#!/usr/bin/env python3
# Live game-master invitation and console-link attack (ADR 0083 item 19;
# ADR 0117 R6 and R5, 2026-11-13/14): an account the admin lets make
# folders invites newcomers into its own tables only — readers only, at
# most 20 waiting, never into another's folder, and not once the power is
# taken away, even from a window opened before; the console's link routes
# answer the admin alone. Each attack has a control that must succeed.
# Lab only.
#
# Usage: python3 -I ws_gm.py https://localhost:18443
import base64, json, os, socket, ssl, sys, time, urllib.request, urllib.error, http.cookiejar

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://localhost:18443"
HOST = BASE.split("://", 1)[1].split(":")[0]
PORT = int(BASE.rsplit(":", 1)[1])
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
SECRET_MARK = "ZZ-hidden-note-text-ZZ"
OPEN_MARK = "ZZ-open-note-text-ZZ"
findings = []


def note(level, title, detail=""):
    findings.append((level, title, detail))
    print(f"  [{level}] {title}" + (f" — {detail}" if detail else ""))


class Http:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=CTX),
            urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = None

    def call(self, m, p, b=None):
        h = {"Origin": BASE}
        d = None
        if b is not None:
            d = json.dumps(b).encode()
            h["content-type"] = "application/json"
        if self.csrf and m != "GET":
            h["x-verso-csrf"] = self.csrf
        try:
            r = self.op.open(urllib.request.Request(BASE + p, data=d, method=m, headers=h), timeout=15)
            return r.status, r.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()

    def signin(self, e, pw):
        st, b = self.call("POST", "/api/signin", {"email": e, "password": pw})
        try:
            self.csrf = json.loads(b).get("csrf")
        except Exception:
            pass
        return st, b

    def cookie(self):
        return "; ".join(f"{c.name}={c.value}" for c in self.jar)


class Ws:
    def __init__(self, cookie):
        raw = socket.create_connection((HOST, PORT), 15)
        self.s = CTX.wrap_socket(raw, server_hostname=HOST)
        k = base64.b64encode(os.urandom(16)).decode()
        self.s.send((f"GET /api/ws HTTP/1.1\r\nHost: {HOST}:{PORT}\r\nUpgrade: websocket\r\n"
                     f"Connection: Upgrade\r\nSec-WebSocket-Key: {k}\r\nSec-WebSocket-Version: 13\r\n"
                     f"Origin: {BASE}\r\nCookie: {cookie}\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(4096)
        self.status = buf.split(b" ", 2)[1].decode()
        self.rest = buf.split(b"\r\n\r\n", 1)[1]
        self.i = 0

    def send(self, cmd, args):
        self.i += 1
        p = json.dumps({"id": self.i, "cmd": cmd, "args": args}).encode()
        m = os.urandom(4)
        mk = bytes(x ^ m[j % 4] for j, x in enumerate(p))
        h = bytes([0x81, 0x80 | len(p)]) if len(p) < 126 else bytes([0x81, 0x80 | 126]) + len(p).to_bytes(2, "big")
        self.s.send(h + m + mk)
        return self.i

    def read_reply(self, want_id, seconds=2.0):
        end = time.time() + seconds
        self.s.settimeout(seconds)
        while time.time() < end:
            try:
                while len(self.rest) < 2:
                    self.rest += self.s.recv(4096)
                ln = self.rest[1] & 0x7F
                off = 2
                if ln == 126:
                    while len(self.rest) < 4:
                        self.rest += self.s.recv(4096)
                    ln = int.from_bytes(self.rest[2:4], "big")
                    off = 4
                elif ln == 127:
                    while len(self.rest) < 10:
                        self.rest += self.s.recv(4096)
                    ln = int.from_bytes(self.rest[2:10], "big")
                    off = 10
                while len(self.rest) < off + ln:
                    self.rest += self.s.recv(4096)
                data = self.rest[off:off + ln]
                self.rest = self.rest[off + ln:]
                try:
                    m = json.loads(data.decode("utf-8", "replace"))
                except Exception:
                    continue
                if m.get("id") == want_id:
                    return m
            except socket.timeout:
                break
        return None

    def drain(self, seconds):
        out = []
        end = time.time() + seconds
        self.s.settimeout(seconds)
        while time.time() < end:
            try:
                while len(self.rest) < 2:
                    self.rest += self.s.recv(4096)
                ln = self.rest[1] & 0x7F
                off = 2
                if ln == 126:
                    while len(self.rest) < 4:
                        self.rest += self.s.recv(4096)
                    ln = int.from_bytes(self.rest[2:4], "big")
                    off = 4
                while len(self.rest) < off + ln:
                    self.rest += self.s.recv(4096)
                out.append(self.rest[off:off + ln].decode("utf-8", "replace"))
                self.rest = self.rest[off + ln:]
            except socket.timeout:
                break
        return out


def jget(b, *ks):
    try:
        o = json.loads(b)
    except Exception:
        return None
    for k in ks:
        o = o.get(k) if isinstance(o, dict) else None
    return o



ADMIN_PW = "uma senha bem longa de teste"
PW = "outra senha bem longa aqui"
TAG = str(int(time.time()))
print(f"== target {BASE}\n== seeding")
admin = Http()
st, b = admin.signin("admin@verso.test", ADMIN_PW)
assert jget(b, "account", "admin") is True, f"admin: {st} {b[:160]}"
admin.call("POST", "/api/me/prove", {"password": ADMIN_PW})


def account(email, name):
    st, b = admin.call("POST", "/api/admin/accounts", {"email": email, "name": name, "lang": "pt"})
    acc_id = jget(b, "account", "id") or jget(b, "id")
    tok = (jget(b, "link") or "").rstrip("/").split("/reset/")[-1]
    h = Http()
    h.call("POST", f"/api/reset/{tok}", {"password": PW})
    h.csrf = None
    h.signin(email, PW)
    return h, acc_id


GIL = f"gil-{TAG}@verso.test"
MAL = f"mal-{TAG}@verso.test"
gil, gil_id = account(GIL, "Gil")
mal, mal_id = account(MAL, "Mal")
if not gil_id:
    st, b = admin.call("GET", "/api/admin/accounts")
    for a in (json.loads(b).get("accounts") or []):
        if a.get("email") == GIL:
            gil_id = a.get("id")
        if a.get("email") == MAL:
            mal_id = a.get("id")
admin.call("POST", "/api/me/prove", {"password": ADMIN_PW})
st, b = admin.call("PATCH", f"/api/admin/accounts/{gil_id}", {"admin": False, "mayCreate": True})
print(f"  Gil may create folders: {st}")
# A session reads the account's powers when it signs in: Gil signs in again.
gil = Http()
gil.signin(GIL, PW)

# Gil's own folder and table (control).
gil.call("POST", "/api/me/prove", {"password": PW})
st, b = gil.call("POST", "/api/folders", {"name": f"Mesa-Gil-{TAG}"})
gil_folder = jget(b, "id")
print(f"  Gil makes a folder: {st} {gil_folder}")
wg = Ws(gil.cookie())
wg.drain(0.4)
i = wg.send("open_server_folder", {"id": gil_folder})
print(f"  Gil opens own folder: {json.dumps(wg.read_reply(i))[:70]}")
i = wg.send("campaign_make", {"root": ""})
wg.read_reply(i)
i = wg.send("campaign_invite", {"root": ""})
r = wg.read_reply(i) or {}
link = ((r.get("ok") or {}).get("link")) or ""
if "/invite/" in link:
    print("  control OK: Gil invites into his own table")
else:
    note("IMPORTANT", "a game master could not invite into his own table (control)", json.dumps(r)[:120])

# Attack 1: an editor's invitation through the share dialog.
st, b = gil.call("POST", f"/api/folders/{gil_folder}/shares/invite", {"path": "", "email": f"ed-{TAG}@x.test", "role": "editor"})
if st == 200 and "/invite/" in b:
    note("BLOCKING", "a game master made an editor's invitation", b[:120])
else:
    print(f"  held: editor's invitation refused ({st})")
st, b = gil.call("POST", f"/api/folders/{gil_folder}/shares/invite", {"path": "", "email": f"rd-{TAG}@x.test", "role": "reader"})
print(f"  control: reader's invitation -> {st}")

# Attack 2: into the admin's folder, where Gil is an editor.
st, b = admin.call("POST", "/api/folders", {"name": f"Mesa-Admin-{TAG}"})
adm_folder = jget(b, "id")
wa = Ws(admin.cookie())
wa.drain(0.4)
i = wa.send("open_server_folder", {"id": adm_folder})
wa.read_reply(i)
i = wa.send("campaign_make", {"root": ""})
wa.read_reply(i)
admin.call("POST", "/api/me/prove", {"password": ADMIN_PW})
admin.call("PUT", f"/api/folders/{adm_folder}/shares", {"path": "", "email": GIL, "role": "editor"})
w2 = Ws(gil.cookie())
w2.drain(0.4)
i = w2.send("open_server_folder", {"id": adm_folder})
w2.read_reply(i)
i = w2.send("campaign_invite", {"root": ""})
r = w2.read_reply(i) or {}
if "/invite/" in json.dumps(r):
    note("BLOCKING", "a game master invited into another account's table", json.dumps(r)[:120])
else:
    print("  held: no invitation into the admin's table")
st, b = gil.call("POST", f"/api/folders/{adm_folder}/shares/invite", {"path": "", "email": f"x-{TAG}@x.test", "role": "reader"})
if st == 200 and "/invite/" in b:
    note("BLOCKING", "a game master invited into another account's folder by the dialog", b[:120])
else:
    print(f"  held: dialog invitation into the admin's folder refused ({st})")

# Attack 3: past twenty waiting.
made = 2  # the control's two
over = False
for n in range(25):
    i = wg.send("campaign_invite", {"root": ""})
    r = wg.read_reply(i) or {}
    if "/invite/" in json.dumps(r):
        made += 1
    else:
        break
if made > 20:
    note("IMPORTANT", "a game master had more than 20 invitations waiting", f"{made}")
else:
    print(f"  held: refused after {made} waiting")

# Attack 4: the power taken away while the window stays open.
admin.call("POST", "/api/me/prove", {"password": ADMIN_PW})
st, b = admin.call("PATCH", f"/api/admin/accounts/{gil_id}", {"admin": False, "mayCreate": False})
print(f"  admin takes the power: {st}")
i = wg.send("campaign_invite", {"root": ""})
r = wg.read_reply(i) or {}
if "/invite/" in json.dumps(r):
    note("BLOCKING", "an open window kept inviting after the power was taken", json.dumps(r)[:120])
else:
    print("  held: the open window can no longer invite")
tok = link.rstrip("/").split("/invite/")[-1]
st, b = Http().call("GET", f"/api/invite/{tok}")
if st == 200:
    note("IMPORTANT", "an invitation waiting when the power was taken still opens", b[:100])
else:
    print(f"  held: the waiting invitation is ended ({st})")

# Attack 5: the console's link routes.
for who, h in (("member", mal), ("stranger", Http())):
    for m, p, body in (("GET", "/api/admin/link", None), ("POST", "/api/admin/link", {"mode": "quick"}),
                       ("POST", "/api/admin/link/extend", {}), ("DELETE", "/api/admin/link", None)):
        st, b = h.call(m, p, body)
        if st in (200, 204):
            note("BLOCKING", f"a {who} reached {m} {p}", b[:100])
print("  console link routes: only the admin (checked member and stranger)")
st, b = admin.call("GET", "/api/admin/link")
print(f"  control: the admin reads the link's state -> {st}")

print("\n== summary")
if not findings:
    print("  no finding from the live game-master and console-link attack")
for l, t, d in findings:
    print(f"  {l}: {t} {('— ' + d) if d else ''}")
print(json.dumps({"findings": [{"level": l, "title": t, "detail": d} for l, t, d in findings]}))
