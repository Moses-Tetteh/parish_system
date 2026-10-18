"""HTTP smoke test (no browser): logs in via the progressively-enhanced form, checks RBAC and exports.
Usage: BASE=http://localhost:3100 ADMIN_PASSWORD=... TEST_PASSWORD=... DIRECT_URL=... python3 tests/smoke.py
(users sec_t/ppc_t/pri_t come from scripts/seed-test-users.ts)"""
import os, re, html, http.cookiejar, urllib.request, urllib.error, uuid, sys

BASE = os.environ.get("BASE", "http://localhost:3100")
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None

def client():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(NoRedirect, urllib.request.HTTPCookieProcessor(cj)), cj

def req(op, path, fields=None):
    data, headers = None, {}
    if fields is not None:
        b = uuid.uuid4().hex
        body = b"".join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()) + f"--{b}--\r\n".encode()
        data, headers = body, {"Content-Type": f"multipart/form-data; boundary={b}", "Origin": BASE}
    try:
        r = op.open(urllib.request.Request(BASE + path, data=data, headers=headers), timeout=20)
        return r.status, r.read().decode("utf8", "replace"), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf8", "replace"), e.headers

def hidden(page):
    out = {}
    for m in re.finditer(r'<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?', page):
        out[m.group(1)] = html.unescape(m.group(2) or "")
    return out

def login(user, pw):
    op, cj = client()
    _, page, _ = req(op, "/login")
    f = hidden(page); f.update(username=user, password=pw, next="")
    st, body, h = req(op, "/login", f)
    return op, st, h.get("location"), any(c.name == "parish_session" for c in cj)

ok = True
def check(name, cond, extra=""):
    global ok; ok &= bool(cond); print(("PASS " if cond else "FAIL ") + name, extra)

op, st, loc, has = login("admin", "wrong")
check("bad password rejected, no session", not has)
op, st, loc, has = login("admin", os.environ["ADMIN_PASSWORD"])
check("admin login sets session cookie", has, f"{st} {loc}")
for path, want in [("/dashboard", 200), ("/registers/baptism", 200), ("/registers/baptism/new", 200), ("/admin/users", 200), ("/admin/audit", 200), ("/search?q=ab", 200), ("/registers/nope", 404)]:
    s, b, _ = req(op, path); check(f"admin GET {path}", s == want, s)
s, b, h = req(op, "/registers/baptism/export"); check("export CSV", s == 200 and "text/csv" in h.get("content-type", ""), s)
# create a baptism record through the real form action
s, page, _ = req(op, "/registers/baptism/new")
f = hidden(page)
f.update({"given_name": "Test", "surname": "=cmd|' /C calc'!A0", "date_of_baptism": "2020-02-30"})
s, body, _ = req(op, "/registers/baptism/new", f)
check("invalid date rejected (stays on form)", s == 200 and "not a valid date" in html.unescape(body), s)
f["date_of_baptism"] = "2020-02-29"
s, body, h = req(op, "/registers/baptism/new", f)
check("valid record saved + redirect", s in (303, 307) and "saved=1" in (h.get("location") or ""), f"{s} {h.get('location')}")
s, b, _ = req(op, "/registers/baptism/export"); check("CSV formula neutralised", "'=cmd" in b and ",=cmd" not in b)

# ---- case-insensitive search + optimistic concurrency ----
s, lst, _ = req(op, "/registers/baptism?q=TEST")
check("search is case-insensitive", s == 200 and "Test" in lst)
m = re.search(r"/registers/baptism/(\d+)", lst)
rid = m.group(1) if m else None
check("found a record to edit", bool(rid))
if rid:
    _, pa, _ = req(op, f"/registers/baptism/{rid}"); _, pb, _ = req(op, f"/registers/baptism/{rid}")
    fa, fb = hidden(pa), hidden(pb)
    check("edit form carries a version token", "_version" in fa)
    fa.update(given_name="TestA", surname="Edited"); fb.update(given_name="TestB", surname="Edited")
    s1, _, h1 = req(op, f"/registers/baptism/{rid}", fa)
    check("first editor saves", s1 in (303, 307), s1)
    s2, b2, _ = req(op, f"/registers/baptism/{rid}", fb)
    check("second (stale) editor is told about the conflict", s2 == 200 and "Someone else saved" in html.unescape(b2), s2)

# ---- role matrix + revocation (needs users sec_t / ppc_t / pri_t created by the harness caller) ----
def expect_redirect(op, path, to):
    s, _, h = req(op, path); return s in (307, 303) and (h.get("location") or "").endswith(to)

pw = os.environ["TEST_PASSWORD"]
sec, *_ = login("sec_t", pw); ppc, *_ = login("ppc_t", pw); pri, *_ = login("pri_t", pw)
check("secretary: baptism ok", req(sec, "/registers/baptism")[0] == 200)
check("secretary: admin/users forbidden", expect_redirect(sec, "/admin/users", "/forbidden"))
check("secretary: audit forbidden", expect_redirect(sec, "/admin/audit", "/forbidden"))
check("secretary: sick register forbidden", expect_redirect(sec, "/registers/sick_calls", "/forbidden"))
check("priest: sick register ok", req(pri, "/registers/sick_calls")[0] == 200)
check("ppc: baptism forbidden", expect_redirect(ppc, "/registers/baptism", "/forbidden"))
check("ppc: export forbidden", req(ppc, "/registers/baptism/export")[0] == 403)
check("ppc: dashboard ok", req(ppc, "/dashboard")[0] == 200)
# immediate revocation: admin disables pri_t via DB -> existing cookie dies on next request
os.system(f"psql \"{os.environ['DIRECT_URL']}\" -q -c \"update users set is_active=0 where username='pri_t'\"")
check("disabled user's live session is revoked", expect_redirect(pri, "/dashboard", "/login"))
sys.exit(0 if ok else 1)
