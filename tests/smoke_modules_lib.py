"""HTTP smoke test for the ported Financials + Announcements modules (no browser).
Usage: BASE=http://localhost:3100 ADMIN_PASSWORD=... TEST_PASSWORD=... python3 tests/smoke_modules.py
(users sec_t / ppc_t / pri_t come from `npm run seed:test`)"""
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
        r = op.open(urllib.request.Request(BASE + path, data=data, headers=headers), timeout=30)
        return r.status, r.read().decode("utf8", "replace").replace("<!-- -->", ""), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf8", "replace").replace("<!-- -->", ""), e.headers

def hidden(chunk):
    return {m.group(1): html.unescape(m.group(2) or "") for m in re.finditer(r'<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?', chunk)}

def forms(page):
    return [m.group(0) for m in re.finditer(r"<form\b.*?</form>", page, re.S)]

def login(user, pw):
    op, cj = client()
    _, page, _ = req(op, "/login")
    f = hidden(page); f.update(username=user, password=pw, next="")
    req(op, "/login", f)
    return op

ok = True
def check(name, cond, extra=""):
    global ok; ok &= bool(cond); print(("PASS " if cond else "FAIL ") + name, extra)

def forbidden(op, path):
    s, _, h = req(op, path); return s in (307, 303) and (h.get("location") or "").endswith("/forbidden")



def ok_state():
    return ok
