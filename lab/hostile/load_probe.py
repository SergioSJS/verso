#!/usr/bin/env python3
# Load / bounds probe (ADR 0083 item 18 + item 19): flood a UniVerso with
# connections, sign-ins and requests and confirm the caps hold and the
# server keeps answering — the flood item 18 says was NOT run on 2026-10-15.
# Point it at a throwaway test server (Proxmox VM 107), never a shared box.
#
# Usage: python3 -I load_probe.py http://192.168.3.150:7340
import socket, ssl, sys, threading, time, urllib.request, urllib.error

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://192.168.3.150:7340"
HOST = BASE.split("://", 1)[1].split(":")[0]
PORT = int(BASE.rsplit(":", 1)[1])
HTTPS = BASE.startswith("https")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def state_code(timeout=5):
    try:
        req = urllib.request.Request(BASE + "/api/state")
        ctx = CTX if HTTPS else None
        r = urllib.request.urlopen(req, timeout=timeout, context=ctx)
        return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return f"ERR {type(e).__name__}"


print(f"== target {BASE}")
print(f"baseline /api/state -> {state_code()}")

# ---- 1. connection flood: hold many sockets open at once (per-address cap
#         is 128; this machine is not a trusted proxy, so it applies) ----
HOLD = 300
socks = []
established = 0
refused = 0
for _ in range(HOLD):
    try:
        s = socket.create_connection((HOST, PORT), timeout=4)
        if HTTPS:
            s = CTX.wrap_socket(s, server_hostname=HOST)
        # a partial request, kept open (also probes the slow-header deadline)
        s.send(b"GET /api/state HTTP/1.1\r\nHost: " + HOST.encode() + b"\r\n")
        socks.append(s)
        established += 1
    except Exception:
        refused += 1
print(f"\n== connection flood: {established} sockets opened, {refused} refused at connect")
print(f"   /api/state from the SAME address while {established} are held -> {state_code()}")
# Release them before the next phases, or we flood ourselves out of our own
# per-address budget (128) and every later request resets.
for s in socks:
    try:
        s.close()
    except Exception:
        pass
socks = []
time.sleep(2)
print(f"   /api/state after releasing them -> {state_code()}")

# ---- 2. sign-in flood with wrong credentials (rate limiter / lockout) ----
bad = {"ok": 0, "429": 0, "401": 0, "other": 0, "err": 0}
lock = threading.Lock()


def hammer_signin(n):
    import json
    for _ in range(n):
        try:
            data = json.dumps({"email": "nobody@verso.test", "password": "wrong-xxxxx"}).encode()
            req = urllib.request.Request(BASE + "/api/signin", data=data,
                                         headers={"content-type": "application/json", "Origin": BASE},
                                         method="POST")
            r = urllib.request.urlopen(req, timeout=5, context=CTX if HTTPS else None)
            k = "ok" if r.status == 200 else "other"
        except urllib.error.HTTPError as e:
            k = {429: "429", 401: "401"}.get(e.code, "other")
        except Exception:
            k = "err"
        with lock:
            bad[k] += 1


ts = [threading.Thread(target=hammer_signin, args=(40,)) for _ in range(10)]
t0 = time.time()
for t in ts:
    t.start()
for t in ts:
    t.join()
print(f"\n== sign-in flood: 400 wrong sign-ins in {time.time() - t0:.1f}s -> {bad}")

# ---- 3. request burst: many concurrent GET /api/state ----
got = {"200": 0, "other": 0, "err": 0}


def hammer_state(n):
    for _ in range(n):
        c = state_code(timeout=5)
        k = "200" if c == 200 else ("err" if isinstance(c, str) else "other")
        with lock:
            got[k] += 1


ts = [threading.Thread(target=hammer_state, args=(50,)) for _ in range(20)]
t0 = time.time()
for t in ts:
    t.start()
for t in ts:
    t.join()
print(f"== request burst: 1000 GET /api/state in {time.time() - t0:.1f}s -> {got}")

time.sleep(2)
print(f"\n== after the flood, /api/state -> {state_code()}  (expect 200: the server survived)")
