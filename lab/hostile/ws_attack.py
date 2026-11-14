#!/usr/bin/env python3
# Live WebSocket validation (ADR 0083 item 19): two members in one note's
# room; a secret roll by one must never reach the other (it is told to the
# table's roller and the folder's owners only, collab_dice.rs), while a
# plain roll does (the control). Also: a member cannot open, over the
# WebSocket, a folder they do not reach. Reports, does not fix. Lab only.
#
# Usage: python3 -I ws_attack.py https://localhost:18443
import base64, json, os, ssl, socket, sys, time, urllib.request, urllib.error, http.cookiejar

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://localhost:18443"
HOST = BASE.split("://", 1)[1].split(":")[0]
PORT = int(BASE.rsplit(":", 1)[1])
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
findings = []


def note(level, title, detail=""):
    findings.append((level, title, detail))
    print(f"  [{level}] {title}" + (f" — {detail}" if detail else ""))


# ---------- HTTP sign-in, to carry the cookie onto the WebSocket ----------
class Http:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=CTX),
            urllib.request.HTTPCookieProcessor(self.jar),
        )
        self.csrf = None

    def call(self, method, path, body=None, origin=BASE):
        h = {"Origin": origin}
        d = None
        if body is not None:
            d = json.dumps(body).encode()
            h["content-type"] = "application/json"
        if self.csrf and method not in ("GET", "HEAD"):
            h["x-verso-csrf"] = self.csrf
        req = urllib.request.Request(BASE + path, data=d, method=method, headers=h)
        try:
            r = self.op.open(req, timeout=15)
            return r.status, r.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()

    def signin(self, email, pw):
        st, b = self.call("POST", "/api/signin", {"email": email, "password": pw})
        try:
            self.csrf = json.loads(b).get("csrf")
        except Exception:
            pass
        return st, b

    def cookie_header(self):
        return "; ".join(f"{c.name}={c.value}" for c in self.jar)


# ---------- a minimal RFC6455 client (text frames, client masking) --------
class Ws:
    def __init__(self, cookie, origin=BASE):
        raw = socket.create_connection((HOST, PORT), timeout=15)
        self.s = CTX.wrap_socket(raw, server_hostname=HOST)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET /api/ws HTTP/1.1\r\nHost: {HOST}:{PORT}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
            f"Origin: {origin}\r\nCookie: {cookie}\r\n\r\n"
        )
        self.s.send(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(4096)
        self.status = buf.split(b" ", 2)[1].decode()
        self.rest = buf.split(b"\r\n\r\n", 1)[1]
        self._id = 0

    def send(self, cmd, args=None):
        self._id += 1
        payload = json.dumps({"id": self._id, "cmd": cmd, "args": args or {}}).encode()
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        n = len(payload)
        head = bytes([0x81])  # FIN + text
        if n < 126:
            head += bytes([0x80 | n])
        elif n < 65536:
            head += bytes([0x80 | 126]) + n.to_bytes(2, "big")
        else:
            head += bytes([0x80 | 127]) + n.to_bytes(8, "big")
        self.s.send(head + mask + masked)
        return self._id

    def _frame(self, timeout):
        self.s.settimeout(timeout)
        try:
            while len(self.rest) < 2:
                self.rest += self.s.recv(4096)
            b0, b1 = self.rest[0], self.rest[1]
            ln = b1 & 0x7F
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
            return (b0 & 0x0F), data
        except socket.timeout:
            return None, b""

    def drain(self, seconds):
        """Every JSON message seen within `seconds`."""
        out = []
        end = time.time() + seconds
        while time.time() < end:
            op, data = self._frame(max(0.05, end - time.time()))
            if op is None:
                break
            if op == 0x8:  # close
                break
            if op in (0x1, 0x2):
                try:
                    out.append(json.loads(data.decode("utf-8", "replace")))
                except Exception:
                    pass
        return out

    def close(self):
        try:
            self.s.close()
        except Exception:
            pass


def jget(body, *ks):
    try:
        o = json.loads(body)
    except Exception:
        return None
    for k in ks:
        o = o.get(k) if isinstance(o, dict) else None
    return o


ADMIN_PW = "uma senha bem longa de teste"
PW = "outra senha bem longa aqui"
print(f"== target {BASE}\n== seeding")
admin = Http()
st, b = admin.signin("admin@verso.test", ADMIN_PW)
assert jget(b, "account", "admin") is True, f"admin: {st} {b[:160]}"


def member(email, name):
    st, b = admin.call("POST", "/api/admin/accounts", {"email": email, "name": name, "lang": "pt"})
    assert st == 200, f"create {email}: {st} {b[:160]}"
    token = (jget(b, "link") or "").rstrip("/").split("/reset/")[-1]
    h = Http()
    st2, b2 = h.call("POST", f"/api/reset/{token}", {"password": PW})
    assert st2 == 200, f"reset {email}: {st2} {b2[:160]}"
    h.csrf = jget(b2, "csrf")
    return h


TAG = str(int(time.time()))
BEA, CADU = f"bea-{TAG}@verso.test", f"cadu-{TAG}@verso.test"
bea = member(BEA, "Bea")
cadu = member(CADU, "Cadu")

# admin needs a fresh proof for a share grant (ADR 0083 item 6)
admin.call("POST", "/api/me/prove", {"password": ADMIN_PW})
st, b = admin.call("POST", "/api/folders", {"name": f"Mesa-{TAG}"})
fa = jget(b, "id")
# share the whole folder with both, as editors (members of the room)
for who in (BEA, CADU):
    st, b = admin.call("PUT", f"/api/folders/{fa}/shares", {"path": "", "email": who, "role": "editor"})
    print(f"  share -> {who}: {st} {b[:80]}")
print(f"  folder FA={fa}")

print("\n== T1. member Bea opens FA over the WS, a stranger's folder she is NOT in")
# first prove the gate works: a random non-existent / non-member id
anon_folder = "ZZnotarealfolderZZ"
wb = Ws(bea.cookie_header())
print(f"  ws upgrade status (Bea): {wb.status}")
wb.drain(0.4)  # hello
i = wb.send("open_server_folder", {"id": anon_folder})
msgs = wb.drain(1.0)
got = [m for m in msgs if m.get("id") == i]
if got and "err" in got[0]:
    print(f"  held: open_server_folder on a folder she is not in -> err {str(got[0]['err'])[:80]}")
elif got and "ok" in got[0]:
    note("BLOCKING", "member opened a folder she is not a member of", str(got[0])[:120])
else:
    print(f"  (no direct reply; msgs={len(msgs)})")

print("\n== T2+T3. Bea and Cadu both in FA's room; secret roll must not leak")
# both open FA
key_b = None
for s, lbl in ((wb, "Bea"),):
    i = s.send("open_server_folder", {"id": fa})
    for m in s.drain(1.0):
        if m.get("id") == i and "ok" in m:
            key_b = jget(json.dumps(m["ok"]), "key") or (m["ok"].get("key") if isinstance(m["ok"], dict) else None)
print(f"  Bea opened FA, key={key_b}")
wc = Ws(cadu.cookie_header())
wc.drain(0.4)
key_c = None
i = wc.send("open_server_folder", {"id": fa})
for m in wc.drain(1.0):
    if m.get("id") == i and "ok" in m and isinstance(m["ok"], dict):
        key_c = m["ok"].get("key")
print(f"  Cadu opened FA, key={key_c}")

# Bea (an editor) creates the note so the room can form.
i = wb.send("create_note", {"name": "nota", "text": "# nota\n"})
PATH = "nota.md"
for m in wb.drain(1.0):
    if m.get("id") == i and isinstance(m.get("ok"), dict) and m["ok"].get("path"):
        PATH = m["ok"]["path"]
print(f"  Bea created {PATH}")
ij = wb.send("collab_join", {"key": key_b, "path": PATH})
jb = [m for m in wb.drain(1.0) if m.get("id") == ij]
print(f"  Bea join: {json.dumps(jb[0])[:80] if jb else 'no reply'}")
ic = wc.send("collab_join", {"key": key_c, "path": PATH})
jc = [m for m in wc.drain(1.0) if m.get("id") == ic]
print(f"  Cadu join: {json.dumps(jc[0])[:80] if jc else 'no reply'}")

# control: Cadu makes a PLAIN roll; Bea should hear it
wc.send("collab_roll", {"key": key_c, "path": PATH, "notation": "1d20", "secret": False})
heard_plain = [m for m in wb.drain(1.5) if m.get("event") == "collab-roll"]
print(f"  plain roll by Cadu -> Bea heard {len(heard_plain)} collab-roll push(es) (expect >=1)")
if not heard_plain:
    note("IMPORTANT", "a plain roll did not reach the other member", "control failed; test inconclusive")

# attack: Cadu makes a SECRET roll; Bea must hear nothing of it
wc.send("collab_roll", {"key": key_c, "path": PATH, "notation": "1d20", "secret": True})
after = wb.drain(1.5)
leaked = [m for m in after if m.get("event") == "collab-roll"]
if leaked:
    note("BLOCKING", "a secret roll reached another member over the WebSocket", str(leaked[0])[:160])
else:
    print(f"  held: Cadu's secret roll did not reach Bea ({len(after)} unrelated msgs)")

wb.close()
wc.close()

print("\n== summary")
if not findings:
    print("  no finding from the live WebSocket attacks")
for l, t, d in findings:
    print(f"  {l}: {t} {('— ' + d) if d else ''}")
print(json.dumps({"findings": [{"level": l, "title": t, "detail": d} for l, t, d in findings]}))
