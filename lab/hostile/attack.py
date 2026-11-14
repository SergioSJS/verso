#!/usr/bin/env python3
# Hostile-lab validation of UniVerso (ADR 0083 item 19). Attacks the
# server over HTTPS as a stranger and as a hostile member, written as an
# attacker who has read the open source. Read-only against the findings:
# it reports, it does not fix. Run against a throwaway lab container on
# 127.0.0.1 only (see run.sh). Not shipped to users.
#
# Usage: python3 -I attack.py https://localhost:18443
import json, ssl, sys, urllib.request, urllib.error, http.cookiejar, socket

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://localhost:18443"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

findings = []  # (level, title, detail)


def note(level, title, detail=""):
    findings.append((level, title, detail))
    print(f"  [{level}] {title}" + (f" — {detail}" if detail else ""))


class Session:
    """One client: its own cookie jar and CSRF token."""

    def __init__(self, label):
        self.label = label
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=CTX),
            urllib.request.HTTPCookieProcessor(self.jar),
        )
        self.csrf = None

    def call(self, method, path, body=None, origin=BASE, csrf=True,
             raw=None, headers=None):
        url = BASE + path
        data = None
        hdrs = {}
        if headers:
            hdrs.update(headers)
        if raw is not None:
            data = raw
        elif body is not None:
            data = json.dumps(body).encode()
            hdrs["content-type"] = "application/json"
        if origin is not None:
            hdrs["Origin"] = origin
        if csrf and self.csrf and method not in ("GET", "HEAD"):
            hdrs["x-verso-csrf"] = self.csrf
        req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
        try:
            r = self.op.open(req, timeout=15)
            text = r.read().decode("utf-8", "replace")
            return r.status, text
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", "replace")
        except (urllib.error.URLError, ssl.SSLError, socket.timeout) as e:
            return None, str(e)

    def signin(self, email, pw, origin=BASE):
        st, body = self.call("POST", "/api/signin",
                             {"email": email, "password": pw}, origin=origin)
        try:
            self.csrf = json.loads(body).get("csrf")
        except Exception:
            self.csrf = None
        return st, body


def jget(body, *keys):
    try:
        o = json.loads(body)
    except Exception:
        return None
    for k in keys:
        if isinstance(o, dict):
            o = o.get(k)
    return o


ADMIN_PW = "uma senha bem longa de teste"
MEMBER_PW = "outra senha bem longa aqui"
print(f"== target {BASE}\n")

# ---- Seed: admin, two members, a folder owned by admin, one owned by B ----
print("== seeding")
admin = Session("admin")
st, b = admin.signin("admin@verso.test", ADMIN_PW)
assert st == 200 and jget(b, "account", "admin") is True, f"admin sign-in: {st} {b[:200]}"
print(f"  admin in, csrf={bool(admin.csrf)}")


def make_member(email, name):
    st, b = admin.call("POST", "/api/admin/accounts",
                       {"email": email, "name": name, "lang": "pt"})
    assert st == 200, f"create {email}: {st} {b[:200]}"
    link = jget(b, "link") or ""
    token = link.rstrip("/").split("/reset/")[-1]
    s = Session(name)
    st2, b2 = s.call("POST", f"/api/reset/{token}", {"password": MEMBER_PW})
    assert st2 == 200, f"reset {email}: {st2} {b2[:200]}"
    try:
        s.csrf = json.loads(b2).get("csrf")
    except Exception:
        pass
    return s, jget(b, "account", "id")


b_sess, b_id = make_member("b@verso.test", "Bea")
c_sess, c_id = make_member("c@verso.test", "Cadu")
print(f"  members b={b_id} c={c_id}")

st, body = admin.call("POST", "/api/folders", {"name": "Segredos"})
fa = jget(body, "id") or jget(body, "folder", "id")
print(f"  admin folder FA={fa} ({st})")
st, body = b_sess.call("POST", "/api/folders", {"name": "DeBea"})
fb = jget(body, "id") or jget(body, "folder", "id")
print(f"  B folder FB={fb} ({st})")

print("\n== A. stranger (no account)")
anon = Session("anon")
for method, path in [("GET", "/api/me"), ("GET", f"/api/folders/{fa}/members"),
                     ("GET", f"/api/folders/{fa}/audit"),
                     ("GET", "/api/admin/overview"),
                     ("GET", "/api/admin/accounts")]:
    st, _ = anon.call(method, path)
    if st in (401, 403, 404):
        print(f"  held {path} -> {st}")
    else:
        note("BLOCKING", f"stranger reached {path}", f"status {st}")

# file read as a stranger
st, body = anon.call("GET", f"/f/{fa}/Segredos.md")
if st in (401, 403, 404):
    print(f"  held /f/{fa}/Segredos.md -> {st}")
else:
    note("BLOCKING", "stranger read a folder file", f"status {st}")

print("\n== A2. path traversal (/f/{folder}/{*path})")
for p in ["../../../../etc/passwd", "..%2f..%2f..%2fetc%2fpasswd",
          "....//....//etc/passwd", "/etc/passwd", "%2e%2e/%2e%2e/etc/passwd"]:
    st, body = anon.call("GET", f"/f/{fa}/{p}")
    leaked = "root:" in body and ":0:0:" in body
    if leaked:
        note("BLOCKING", "path traversal read /etc/passwd", f"{p}")
    else:
        print(f"  held {p} -> {st}")

print("\n== A3. origin / CSRF on sign-in and writes")
st, body = anon.call("POST", "/api/signin",
                     {"email": "admin@verso.test", "password": ADMIN_PW},
                     origin="https://evil.example")
if jget(body, "admin") is True and st == 200:
    note("IMPORTANT", "sign-in accepted a foreign Origin", "CSRF surface")
else:
    print(f"  held foreign-origin sign-in -> {st}")

# member write with cookie but no csrf header
st, body = b_sess.call("POST", "/api/folders", {"name": "NoCsrf"}, csrf=False)
if st == 200:
    note("IMPORTANT", "write accepted with no CSRF header", "/api/folders")
else:
    print(f"  held no-csrf write -> {st}")
# member write with a foreign Origin
st, body = b_sess.call("POST", "/api/folders", {"name": "BadOrigin"},
                       origin="https://evil.example")
if st == 200:
    note("IMPORTANT", "write accepted a foreign Origin", "/api/folders")
else:
    print(f"  held foreign-origin write -> {st}")

print("\n== B. hostile member B against admin's folder FA (not shared)")
if fa:
    for method, path, bod in [
        ("GET", f"/api/folders/{fa}/members", None),
        ("GET", f"/api/folders/{fa}/audit", None),
        ("GET", f"/f/{fa}/Segredos.md", None),
        ("POST", f"/api/folders/{fa}/shares/invite", {"email": "x@y.z"}),
        ("PUT", f"/api/folders/{fa}/members/{b_id}", {"role": "owner"}),
    ]:
        st, body = b_sess.call(method, path, bod)
        if st in (401, 403, 404):
            print(f"  held {method} {path} -> {st}")
        else:
            note("BLOCKING", f"member reached {method} {path}",
                 f"status {st} {body[:120]}")

print("\n== B2. admin endpoints as member B")
for path in ["/api/admin/overview", "/api/admin/accounts", "/api/admin/config",
             "/api/admin/audit", f"/api/admin/accounts/{b_id}/reset"]:
    m = "POST" if path.endswith("/reset") else "GET"
    st, body = b_sess.call(m, path, {} if m == "POST" else None)
    if st in (401, 403, 404):
        print(f"  held {m} {path} -> {st}")
    else:
        note("BLOCKING", f"member used admin {m} {path}", f"status {st}")

print("\n== B3. oversized body (expect a limit, not a crash)")
st, body = anon.call("POST", "/api/signin", raw=b"{" + b"a" * (25 * 1024 * 1024),
                     headers={"content-type": "application/json"})
if st in (413, 400, 431):
    print(f"  held 25 MB body -> {st}")
elif st is None:
    note("IMPORTANT", "25 MB body dropped the connection", body[:100])
else:
    note("IMPORTANT", "25 MB body not rejected by a limit", f"status {st}")

print("\n== summary")
if not findings:
    print("  no finding from the HTTP attacks above")
for lvl, t, d in findings:
    print(f"  {lvl}: {t} {('— ' + d) if d else ''}")
print(json.dumps({"findings": [
    {"level": l, "title": t, "detail": d} for l, t, d in findings]}))
