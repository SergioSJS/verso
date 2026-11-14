#!/usr/bin/env python3
# Live audience / veil validation (ADR 0083 item 19, ADR 0110/0113): a note
# hidden from the players at a table must not reach a player over the
# WebSocket — not its text, not through read_note nor the sync projection —
# while a note open to the table does (the control). A player here is a
# non-owner member of a folder that is a table (they are veiled). Lab only.
#
# Usage: python3 -I ws_audience.py https://localhost:18443
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

st, b = admin.call("POST", "/api/folders", {"name": f"Mesa-{TAG}"})
fa = jget(b, "id")
wa = Ws(admin.cookie())
wa.drain(0.4)
i = wa.send("open_server_folder", {"id": fa})
key = (wa.read_reply(i) or {}).get("ok", {}).get("key")
print(f"  admin opened FA={fa} key={key}")
i = wa.send("create_note", {"name": "segredo", "text": f"# segredo\n{SECRET_MARK}\n"})
seg = (wa.read_reply(i) or {}).get("ok", {}).get("path", "segredo.md")
i = wa.send("create_note", {"name": "aberto", "text": f"# aberto\n{OPEN_MARK}\n"})
opn = (wa.read_reply(i) or {}).get("ok", {}).get("path", "aberto.md")
print(f"  notes: {seg}, {opn}")
i = wa.send("campaign_make", {"root": ""})
print(f"  campaign_make -> {json.dumps(wa.read_reply(i))[:80]}")
i = wa.send("campaign_audience", {"paths": [seg], "audience": {"kind": "hidden"}})
print(f"  hide {seg} -> {json.dumps(wa.read_reply(i))[:100]}")
# aberto open to the whole table
i = wa.send("campaign_audience", {"paths": [opn], "audience": {"kind": "table"}})
print(f"  open {opn} to the table -> {json.dumps(wa.read_reply(i))[:80]}")

# share FA with B as a reader -> B is a (veiled) player at the table
BEA = f"bea-aud-{TAG}@verso.test"
st, b = admin.call("POST", "/api/admin/accounts", {"email": BEA, "name": "Bea", "lang": "pt"})
tok = (jget(b, "link") or "").rstrip("/").split("/reset/")[-1]
bea = Http()
bea.call("POST", f"/api/reset/{tok}", {"password": PW})
bea.csrf = None
st, b = bea.signin(BEA, PW)
admin.call("POST", "/api/me/prove", {"password": ADMIN_PW})
st, b = admin.call("PUT", f"/api/folders/{fa}/shares", {"path": "", "email": BEA, "role": "reader"})
print(f"  share FA -> Bea (reader/player): {st}")

print("\n== Bea (player) opens the table and tries the hidden note")
wb = Ws(bea.cookie())
print(f"  Bea ws: {wb.status}")
wb.drain(0.4)
i = wb.send("open_server_folder", {"id": fa})
opened = wb.read_reply(i)
print(f"  Bea open FA: {json.dumps(opened)[:90]}")

# control: the open note must be readable with its text
i = wb.send("read_note", {"path": opn})
r = wb.read_reply(i)
body = json.dumps(r)
if OPEN_MARK in body:
    print(f"  control OK: Bea reads the open note (text present)")
else:
    note("IMPORTANT", "a table-open note did not reach the player", f"control failed: {body[:120]}")

# attack: the hidden note's text must never reach Bea
i = wb.send("read_note", {"path": seg})
r = wb.read_reply(i)
body = json.dumps(r)
if SECRET_MARK in body:
    note("BLOCKING", "a hidden note's text reached a player via read_note", body[:160])
elif r and "err" in r:
    print(f"  held: read_note on the hidden note refused -> {str(r['err'])[:80]}")
else:
    print(f"  held: read_note on the hidden note carried no secret text -> {body[:100]}")

# and the sync projection must not carry the secret text anywhere
i = wb.send("sync_state", {"key": key})
wb.read_reply(i, 2.0)
seen = " ".join(wb.drain(1.5))
if SECRET_MARK in seen:
    note("BLOCKING", "the hidden note's text appeared in the player's sync stream", "")
else:
    print("  held: the secret text did not appear in Bea's sync stream")

print("\n== summary")
if not findings:
    print("  no finding from the live audience attack")
for l, t, d in findings:
    print(f"  {l}: {t} {('— ' + d) if d else ''}")
print(json.dumps({"findings": [{"level": l, "title": t, "detail": d} for l, t, d in findings]}))
