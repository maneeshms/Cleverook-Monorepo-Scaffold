#!/usr/bin/env python3
"""
ClevScaffold API - Runtime Security Scan
OWASP Top 10 (2021) + OWASP API Security Top 10 (2023) black-box probes.

Self-provisioning: registers its own throwaway users (no pre-seeded admin token
needed). Run against a LIVE API:

    npx nx serve api                 # http://localhost:3000/api/v1
    python3 scripts/security_scan.py

Config via env:
    CLEVSCAFFOLD_BASE          base URL (default http://localhost:3000/api/v1)
    CLEVSCAFFOLD_ADMIN_TOKEN   optional admin bearer to additionally exercise
                               admin-only routes AS an admin (otherwise the
                               admin checks assert a normal user is forbidden)

Exit code is non-zero if any HIGH or MEDIUM check fails — wire it into CI.

Blocks:
  A  Authentication Bypass & JWT Attacks          [OWASP A07, API2]
  B  Privilege Escalation / BFLA                  [OWASP API5]
  C  Token Lifecycle & Rotation / Reuse Detection [RFC 6749]
  D  Injection (SQL, SSTI, path traversal)        [OWASP A03, API8]
  E  Sensitive Data Leakage                       [OWASP A02, API3]
  G  IDOR / BOLA                                  [OWASP API1]
  H  Mass Assignment                              [OWASP API6]
  I  Security Headers & CORS                      [OWASP A05, API7]
  J  Rate Limiting / DoS                          [OWASP A07, API4]
  K  Business Logic / Pagination                  [OWASP API9]
  L  Ownership / Tenant Scoping                   [OWASP API1 BOLA]
  M  Transport, HTTP Methods, Edge Cases          [OWASP A05, API7]
"""
import subprocess, json, sys, base64, time, hashlib, hmac
import os as _os

BASE        = _os.environ.get("CLEVSCAFFOLD_BASE", "http://localhost:3000/api/v1")
ADMIN_TOKEN = _os.environ.get("CLEVSCAFFOLD_ADMIN_TOKEN", "")
GREEN, RED, YEL, CYAN, RST = "\033[32m", "\033[31m", "\033[33m", "\033[36m", "\033[0m"
results = []


def curl(method, path, headers=None, body=None, base=BASE, raw=False, timeout=15):
    cmd = ['curl', '-s', '-X', method, f'{base}{path}', '-w', '\n@@STATUS@@%{http_code}', '--max-redirs', '0']
    if headers:
        for k, v in headers.items():
            cmd += ['-H', f'{k}: {v}']
    if body is not None:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(body)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return ('', 0)
    out = r.stdout
    code = 0
    if '@@STATUS@@' in out:
        parts = out.rsplit('@@STATUS@@', 1)
        body_str = parts[0].strip()
        try:
            code = int(parts[1].strip())
        except Exception:
            pass
    else:
        body_str = out.strip()
    if raw:
        return body_str, code
    try:
        return json.loads(body_str), code
    except Exception:
        return body_str, code


def headers_of(path, hdrs=None):
    cmd = ['curl', '-s', '-D', '-', '-o', '/dev/null', f'{BASE}{path}', '--max-redirs', '0']
    if hdrs:
        for k, v in hdrs.items():
            cmd += ['-H', f'{k}: {v}']
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    except subprocess.TimeoutExpired:
        return {}
    out = {}
    for line in r.stdout.splitlines():
        if ':' in line:
            k, _, v = line.partition(':')
            out[k.strip().lower()] = v.strip()
    return out


def check(tid, desc, ok, detail="", sev="HIGH"):
    icon = f"{GREEN}PASS{RST}" if ok else f"{RED}FAIL{RST}"
    tag = f"[{sev}]" if not ok else ""
    results.append((tid, desc, ok, sev))
    print(f"  {icon} {tid}: {desc} {tag}")
    if detail and not ok:
        print(f"       -> {detail}")


def section(title):
    print()
    print("=" * 72)
    print(f"  {title}")
    print("=" * 72)


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


PW = "Str0ng!Pass9"


def register_login(email, pw):
    reg, sc = curl('POST', '/auth/register', body={"email": email, "password": pw, "displayName": "Pen Test"})
    tok = reg.get('accessToken', '') if isinstance(reg, dict) else ''
    rtok = reg.get('refreshToken', '') if isinstance(reg, dict) else ''
    if not tok:
        ln, _ = curl('POST', '/auth/login', body={"email": email, "password": pw})
        if isinstance(ln, dict):
            tok, rtok = ln.get('accessToken', ''), ln.get('refreshToken', '')
    return tok, rtok, sc


# ══════════════════════════════════════════════════════════════════════════════
# SETUP
# ══════════════════════════════════════════════════════════════════════════════
section("SETUP - Provision test users")
_ts = int(time.time())
U1_EMAIL = f"pentest_{_ts}@scan.local"
U2_EMAIL = f"pentest2_{_ts}@scan.local"

U1_TOKEN, U1_REFRESH, _ = register_login(U1_EMAIL, PW)
U2_TOKEN, U2_REFRESH, _ = register_login(U2_EMAIL, PW)

if not U1_TOKEN or not U2_TOKEN:
    print(f"  {RED}FATAL{RST} could not provision test users. Is the API running at {BASE}?")
    sys.exit(2)

AUTH = {'Authorization': f'Bearer {U1_TOKEN}'}
AUTH2 = {'Authorization': f'Bearer {U2_TOKEN}'}
ADMIN_AUTH = {'Authorization': f'Bearer {ADMIN_TOKEN}'} if ADMIN_TOKEN else AUTH
JWT = U1_TOKEN.split('.')
print(f"  {CYAN}INFO{RST} user1={U1_EMAIL[:32]} token={'yes' if U1_TOKEN else 'NO'}")
print(f"  {CYAN}INFO{RST} user2={U2_EMAIL[:32]} token={'yes' if U2_TOKEN else 'NO'}")

# user1 owns a task; used for IDOR/BOLA + ownership tests
_t1, _ = curl('POST', '/tasks', AUTH, {"title": "U1 secret task"})
U1_TASK = _t1.get('id', '') if isinstance(_t1, dict) else ''
print(f"  {CYAN}INFO{RST} u1 task={U1_TASK[:8]}")


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK A - Authentication Bypass & JWT Attacks  [OWASP A07, API2]")
r, c = curl('GET', '/tasks')
check("A-01", "No token -> 401", c == 401, f"got {c}")
r, c = curl('GET', '/tasks', headers={'Authorization': 'Basic dXNlcjpwYXNz'})
check("A-02", "Basic auth rejected -> 401", c == 401, f"got {c}")
r, c = curl('GET', '/tasks', headers={'Authorization': 'Bearer '})
check("A-03", "Empty Bearer -> 401", c == 401, f"got {c}")
r, c = curl('GET', '/tasks', headers={'Authorization': 'Bearer garbage.notajwt.atall'})
check("A-04", "Garbage JWT -> 401", c == 401, f"got {c}")

_tam = JWT[0] + '.' + JWT[1] + '.' + (JWT[2][:-1] + ('A' if JWT[2][-1] != 'A' else 'B'))
r, c = curl('GET', '/tasks', headers={'Authorization': f'Bearer {_tam}'})
check("A-05", "Tampered signature -> 401", c == 401, f"got {c}")

_hdr_none = b64u(b'{"alg":"none","typ":"JWT"}')
r, c = curl('GET', '/tasks', headers={'Authorization': f'Bearer {_hdr_none}.{JWT[1]}.'})
check("A-06", "alg=none JWT -> 401", c == 401, f"got {c}")

_h_hs = b64u(b'{"alg":"HS256","typ":"JWT"}')
_sig1 = hmac.new(b'', f"{_h_hs}.{JWT[1]}".encode(), hashlib.sha256).digest()
r, c = curl('GET', '/tasks', headers={'Authorization': f'Bearer {_h_hs}.{JWT[1]}.{b64u(_sig1)}'})
check("A-07", "HS256/empty-secret JWT -> 401", c == 401, f"got {c}")
_sig2 = hmac.new(b'secret', f"{_h_hs}.{JWT[1]}".encode(), hashlib.sha256).digest()
r, c = curl('GET', '/tasks', headers={'Authorization': f'Bearer {_h_hs}.{JWT[1]}.{b64u(_sig2)}'})
check("A-08", "HS256/common-secret JWT -> 401", c == 401, f"got {c}")

try:
    _h_obj = json.loads(base64.urlsafe_b64decode(JWT[0] + '=='))
    _h_obj['kid'] = '../../../../dev/null'
    r, c = curl('GET', '/tasks', headers={'Authorization': f'Bearer {b64u(json.dumps(_h_obj).encode())}.{JWT[1]}.'})
    check("A-09", "kid path-traversal JWT -> 401", c == 401, f"got {c}")
except Exception as e:
    check("A-09", "kid path-traversal JWT -> 401", False, str(e))

try:
    _pay = json.loads(base64.urlsafe_b64decode(JWT[1] + '=='))
    _pay['exp'] = 1
    r, c = curl('GET', '/tasks', headers={'Authorization': f'Bearer {JWT[0]}.{b64u(json.dumps(_pay).encode())}.'})
    check("A-10", "Expired/alg=none JWT -> 401", c == 401, f"got {c}")
except Exception as e:
    check("A-10", "Expired JWT -> 401", False, str(e))

r, c = curl('POST', '/auth/login', body={"email": U1_EMAIL, "password": "WrongPass!1"})
check("A-11", "Wrong password -> 401 or 429", c in (401, 429), f"got {c}")
r, c = curl('POST', '/auth/login', body={"email": "ghost@notexist.com", "password": "any"})
check("A-12", "Non-existent user -> 401/404/429", c in (401, 404, 429), f"got {c}")

r1, _ = curl('POST', '/auth/login', body={"email": U1_EMAIL, "password": "Wrong!9"})
r2, _ = curl('POST', '/auth/login', body={"email": "ghost@notexist.com", "password": "Wrong!9"})
m1 = r1.get('message', '') if isinstance(r1, dict) else str(r1)
m2 = r2.get('message', '') if isinstance(r2, dict) else str(r2)
check("A-13", "Login errors identical (no enumeration)", m1 == m2, f"valid='{m1}' ghost='{m2}'", sev="MEDIUM")

r, c = curl('POST', '/auth/refresh', body={"refreshToken": "notavalidtoken"})
check("A-14", "Invalid refresh token -> 400/401", c in (400, 401), f"got {c}")

r, c = curl('GET', '/tasks', headers={'Authorization': f'Bearer {U1_TOKEN}\r\nX-Evil: yes'})
check("A-15", "Newline injection in auth header -> not 500", c != 500, f"got {c}", sev="MEDIUM")

try:
    _pi = json.loads(base64.urlsafe_b64decode(JWT[1] + '=='))
    _pi['role'] = 'ADMIN'
    r, c = curl('GET', '/users', headers={'Authorization': f'Bearer {_hdr_none}.{b64u(json.dumps(_pi).encode())}.'})
    check("A-16", "Injected admin role via alg=none -> 401", c == 401, f"got {c}")
except Exception as e:
    check("A-16", "Injected admin role via alg=none -> 401", False, str(e))


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK B - Privilege Escalation / BFLA  [OWASP API5]")
# GET /users is @Roles(ADMIN). With an admin token it should succeed; otherwise a
# normal user must be forbidden.
r, c = curl('GET', '/users', ADMIN_AUTH)
if ADMIN_TOKEN:
    check("B-01", "Admin GET /users -> 200", c == 200, f"got {c}")
else:
    check("B-01", "Normal user GET /users (admin route) -> 403", c == 403, f"got {c}")
r, c = curl('GET', '/users', AUTH)
check("B-02", "Normal user GET /users -> 403", c == 403, f"got {c}")


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK C - Token Lifecycle & Rotation / Reuse Detection  [RFC 6749]")
_ce = f"rot_{_ts}@scan.local"
_ct, _cr, _ = register_login(_ce, PW)
if _cr:
    n1, c1 = curl('POST', '/auth/refresh', body={"refreshToken": _cr})
    new_r = n1.get('refreshToken', '') if isinstance(n1, dict) else ''
    check("C-01", "Refresh rotates -> new refresh token", c1 == 200 and new_r and new_r != _cr, f"got {c1}")
    _, c2 = curl('POST', '/auth/refresh', body={"refreshToken": _cr})
    check("C-02", "Reused (old) refresh token -> 401", c2 == 401, f"got {c2}")
    _, c3 = curl('POST', '/auth/refresh', body={"refreshToken": new_r})
    check("C-03", "Reuse detection revokes whole family -> 401", c3 == 401, f"got {c3}", sev="MEDIUM")
else:
    check("C-01", "Refresh rotation", False, "could not provision rotation user")


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK D - Injection  [OWASP A03, API8]")
r, c = curl('POST', '/auth/login', body={"email": "admin'--@x.com", "password": "' OR '1'='1"})
check("D-01", "SQLi in login -> 400/401 (not 200/500)", c in (400, 401, 429), f"got {c}")
r, c = curl('GET', "/tasks?search=' OR 1=1--", AUTH)
check("D-02", "SQLi in task search -> not 500", c != 500, f"got {c}")
r, c = curl('POST', '/tasks', AUTH, {"title": "${7*7} #{7*7} <%= 7*7 %>"})
_ssti_id = r.get('id', '') if isinstance(r, dict) else ''
check("D-03", "SSTI payload stored literally (no eval)",
      isinstance(r, dict) and r.get('title') == "${7*7} #{7*7} <%= 7*7 %>", f"got {str(r)[:60]}")
if _ssti_id:
    curl('DELETE', f'/tasks/{_ssti_id}', AUTH)
r, c = curl('GET', '/tasks/not-a-uuid', AUTH)
check("D-04", "Non-UUID path param -> 400 (ParseUUIDPipe)", c == 400, f"got {c}")
r, c = curl('GET', '/tasks/..%2f..%2f..%2fetc%2fpasswd', AUTH)
check("D-05", "Path traversal in id -> 400/404 (not 500)", c in (400, 404), f"got {c}")


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK E - Sensitive Data Leakage  [OWASP A02, API3]")
r, c = curl('GET', '/users/me', AUTH)
_blob = json.dumps(r) if isinstance(r, (dict, list)) else str(r)
check("E-01", "Profile excludes password hash",
      'passwordHash' not in _blob and 'password_hash' not in _blob and '$2' not in _blob, "")
check("E-02", "Refresh token is opaque (not a JWT)",
      bool(U1_REFRESH) and len(U1_REFRESH.split('.')) < 3, "")
r, c = curl('GET', '/tasks/00000000-0000-0000-0000-000000000000', AUTH)
_eblob = json.dumps(r) if isinstance(r, (dict, list)) else str(r)
check("E-03", "Errors carry no stack trace / internals",
      not any(s in _eblob for s in ['/apps/', '.ts:', 'node_modules', 'QueryFailedError']),
      f"{_eblob[:80]}", sev="MEDIUM")
check("E-04", "Normalized error shape (statusCode/timestamp)",
      isinstance(r, dict) and 'statusCode' in r and 'timestamp' in r, "", sev="LOW")


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK G - IDOR / BOLA  [OWASP API1:2023]")
if U1_TASK:
    r, c = curl('GET', f'/tasks/{U1_TASK}', AUTH2)
    check("G-01", "User2 GET user1's task -> 403/404", c in (403, 404), f"got {c}")
    r, c = curl('PATCH', f'/tasks/{U1_TASK}', AUTH2, {"title": "hacked"})
    check("G-02", "User2 PATCH user1's task -> 403/404", c in (403, 404), f"got {c}")
    r, c = curl('DELETE', f'/tasks/{U1_TASK}', AUTH2)
    check("G-03", "User2 DELETE user1's task -> 403/404", c in (403, 404), f"got {c}")
else:
    check("G-01", "IDOR setup", False, "no u1 task provisioned")


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK H - Mass Assignment  [OWASP API6:2023]")
_me_em = f"mass_{_ts}@scan.local"
r, c = curl('POST', '/auth/register', body={"email": _me_em, "password": PW, "role": "ADMIN"})
check("H-01", "Register with role -> 400 (whitelist)", c == 400, f"got {c}")
r, c = curl('PATCH', '/users/me', AUTH, {"role": "ADMIN"})
check("H-02", "PATCH profile role -> 400 (whitelist)", c == 400, f"got {c}")
r, c = curl('POST', '/tasks', AUTH, {"title": "MA", "ownerId": "00000000-0000-0000-0000-000000000000"})
check("H-03", "Create task with ownerId -> 400 (whitelist)", c == 400, f"got {c}")
if isinstance(r, dict) and r.get('id'):
    curl('DELETE', f"/tasks/{r['id']}", AUTH)


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK I - Security Headers & CORS  [OWASP A05, API7]")
h = headers_of('/health')
check("I-01", "X-Content-Type-Options: nosniff", h.get('x-content-type-options') == 'nosniff',
      f"{h.get('x-content-type-options')}")
check("I-02", "X-Frame-Options present", 'x-frame-options' in h, "missing")
check("I-03", "X-Powered-By hidden", 'x-powered-by' not in h, f"{h.get('x-powered-by')}", sev="MEDIUM")
check("I-04", "Correlation id (x-request-id) present", 'x-request-id' in h, "missing", sev="LOW")
hc = headers_of('/health', {'Origin': 'https://evil.example.com'})
_acao = hc.get('access-control-allow-origin', '')
check("I-05", "CORS does not blindly reflect arbitrary origin",
      _acao != 'https://evil.example.com' or 'access-control-allow-credentials' not in hc,
      f"acao={_acao}", sev="MEDIUM")


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK J - Rate Limiting / DoS  [OWASP A07, API4]")
_codes = []
for _i in range(12):
    _, _c = curl('POST', '/auth/login', body={"email": f"rl_{_ts}@scan.local", "password": "Wrong!9"})
    _codes.append(_c)
check("J-01", "Auth endpoint rate-limits burst -> 429 seen", 429 in _codes, f"codes={_codes}", sev="MEDIUM")


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK K - Business Logic / Pagination  [OWASP API9:2023]")
r, c = curl('GET', '/tasks?limit=1000000&page=1', AUTH)
check("K-01", "Huge pagination limit -> 400/200 (bounded, not 500)", c in (200, 400), f"got {c}", sev="LOW")
r, c = curl('GET', '/tasks?page=-1', AUTH)
check("K-02", "Negative page -> 400/200 (not 500)", c in (200, 400), f"got {c}", sev="LOW")


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK L - Ownership / Tenant Scoping  [OWASP API1:2023]")
r, c = curl('GET', '/tasks', AUTH2)
_ids = [t.get('id') for t in r.get('data', [])] if isinstance(r, dict) else []
check("L-01", "List tasks returns only caller's tasks", U1_TASK not in _ids, f"saw {len(_ids)} tasks")
r, c = curl('GET', '/notifications', AUTH2)
check("L-02", "Notifications scoped to caller -> 200", c == 200, f"got {c}", sev="LOW")


# ══════════════════════════════════════════════════════════════════════════════
section("BLOCK M - Transport & Miscellaneous  [OWASP A05, API7]")
_tr = subprocess.run(['curl', '-s', '-X', 'TRACE', f'{BASE}/health', '-w', '\n@@STATUS@@%{http_code}', '--max-redirs', '0'],
                     capture_output=True, text=True)
_trc = int(_tr.stdout.rsplit('@@STATUS@@', 1)[1].strip()) if '@@STATUS@@' in _tr.stdout else 0
check("M-01", "HTTP TRACE disabled (XST)", _trc in (404, 405, 501), f"got {_trc}", sev="MEDIUM")
r, c = curl('GET', '/this-route-does-not-exist', AUTH)
check("M-02", "Unknown route -> 404", c == 404, f"got {c}", sev="LOW")
r, c = curl('GET', '/health')
check("M-03", "Health responds -> 200", c == 200, f"got {c}", sev="INFO")


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
section("SCAN COMPLETE - RESULTS SUMMARY")
passed = [r for r in results if r[2] is True]
failed = [r for r in results if r[2] is False]
by_sev = {}
for r in results:
    by_sev.setdefault(r[3], []).append(r)

print(f"\n  Total : {len(results)}")
print(f"  {GREEN}Passed{RST}: {len(passed)}")
print(f"  {RED}Failed{RST}: {len(failed)}\n")
print("  By severity:")
for _sev in ("HIGH", "MEDIUM", "LOW", "INFO"):
    _g = by_sev.get(_sev, [])
    _p = sum(1 for x in _g if x[2] is True)
    _f = sum(1 for x in _g if x[2] is False)
    print(f"  {_sev:6}: {_p:3} pass / {_f:3} fail  {'#' * _p}{'.' * _f}")

if failed:
    print(f"\n  {RED}Failed checks:{RST}")
    for _tid, _desc, _, _sev in sorted(failed, key=lambda x: ("HIGH", "MEDIUM", "LOW", "INFO").index(x[3])):
        print(f"    {RED}x{RST} [{_sev:6}] {_tid}: {_desc}")
else:
    print(f"\n  {GREEN}All checks passed!{RST}")

# ─── Cleanup: soft-delete the provisioned accounts ───────────────────────────
print()
for _tok in [U1_TOKEN, U2_TOKEN, _ct]:
    if _tok:
        curl('DELETE', '/users/me', {'Authorization': f'Bearer {_tok}'})
print(f"  {CYAN}INFO{RST} Cleanup: provisioned test accounts soft-deleted.")

sys.exit(1 if any(r[2] is False and r[3] in ('HIGH', 'MEDIUM') for r in results) else 0)
