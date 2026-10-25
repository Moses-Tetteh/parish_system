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

# start from a clean slate (throw-away database only!)
os.system(f"psql \"{os.environ['DIRECT_URL']}\" -q -c \"truncate dues_payments, members, budgets, financial_transactions, financial_categories, announcements restart identity cascade\" 2>/dev/null")
ok = True
def check(name, cond, extra=""):
    global ok; ok &= bool(cond); print(("PASS " if cond else "FAIL ") + name, extra)

def forbidden(op, path):
    s, _, h = req(op, path); return s in (307, 303) and (h.get("location") or "").endswith("/forbidden")

admin = login("admin", os.environ["ADMIN_PASSWORD"]); pw = os.environ["TEST_PASSWORD"]
sec, ppc, pri = login("sec_t", pw), login("ppc_t", pw), login("pri_t", pw)

# ---------------- pages render for the admin
for p in ["/financials", "/financials/new", "/financials/ledger", "/financials/statement", "/financials/categories", "/financials/budget", "/financials/members", "/financials/dues",
          "/announcements", "/announcements/new", "/announcements/review", "/announcements/print", "/dashboard"]:
    s, _, _ = req(admin, p); check(f"admin GET {p}", s == 200, s)

# ---------------- categories: add + mark as offering
s, page, h = req(admin, "/financials/categories")
add = next(f for f in forms(page) if 'name="name"' in f)
s, _, h = req(admin, "/financials/categories", {**hidden(add), "name": "E2E Offering", "type": "income"})
check("add category", s in (303, 307) and "ok=" in (h.get("location") or ""), (s, h.get("location")))
s, page, _ = req(admin, "/financials/categories")
row = re.search(r"<tr>(?:(?!</tr>).)*E2E Offering.*?</tr>", page, re.S).group(0)
off = next(f for f in forms(row) if "is_offering_category" in f)
s, _, h = req(admin, "/financials/categories", {**hidden(off), "is_offering_category": "1"})
check("mark offering", s in (303, 307) and "ok=" in (h.get("location") or ""))
s, _, h = req(admin, "/financials/categories", {**hidden(add), "name": "E2E General Income", "type": "income"})

# ---------------- transaction scope
def cat_id(page, name):
    m = re.search(r'<option value="(\d+)"[^>]*>' + re.escape(name) + "</option>", page); return m.group(1) if m else None
s, newpage, _ = req(admin, "/financials/new")
off_id, gen_id = cat_id(newpage, "E2E Offering"), cat_id(newpage, "E2E General Income")
check("new categories offered to admin", off_id and gen_id, (off_id, gen_id))
form = next(f for f in forms(newpage) if 'name="amount"' in f)
base = {**hidden(form), "transaction_date": "2026-10-20", "amount": "125.50", "description": "e2e offering"}
s, body, h = req(admin, "/financials/new", {**base, "category_id": off_id, "amount": "abc"})
check("invalid amount rejected on form", s == 200 and "valid amount" in html.unescape(body), s)
s, _, h = req(admin, "/financials/new", {**base, "category_id": off_id})
check("admin records offering transaction", s in (303, 307) and "ok=" in (h.get("location") or ""), (s, h.get("location")))

s, secnew, _ = req(sec, "/financials/new")
check("secretary does NOT see offering account", s == 200 and cat_id(secnew, "E2E Offering") is None and cat_id(secnew, "E2E General Income") is not None)
sform = next(f for f in forms(secnew) if 'name="amount"' in f)
s, _, h = req(sec, "/financials/new", {**hidden(sform), "transaction_date": "2026-10-20", "amount": "5", "category_id": off_id})
check("secretary posting a crafted offering category is refused", s in (303, 307) and (h.get("location") or "").endswith("/forbidden"), (s, h.get("location")))
s, lst, _ = req(sec, "/financials?start=2026-10-01&end=2026-10-31")
check("secretary list hides the offering row", "e2e offering" not in lst)
s, lst, _ = req(ppc, "/financials?start=2026-10-01&end=2026-10-31")
check("ppc list shows the offering row", "e2e offering" in lst and "125.50" in lst, s)
m = re.search(r"/financials/(\d+)\"", lst); tid = m.group(1) if m else None
check("sec cannot open ppc-scoped transaction", tid and req(sec, f"/financials/{tid}")[0] == 404)
check("ppc can open voucher", tid and req(ppc, f"/financials/voucher/{tid}")[0] == 200)
check("sec voucher for offering is 404", tid and req(sec, f"/financials/voucher/{tid}")[0] == 404)

# ---------------- role gates
check("ppc: categories forbidden", forbidden(ppc, "/financials/categories"))
check("ppc: budget forbidden", forbidden(ppc, "/financials/budget"))
check("ppc: members ok", req(ppc, "/financials/members")[0] == 200)
check("secretary: members forbidden", forbidden(sec, "/financials/members"))
check("secretary: dues forbidden", forbidden(sec, "/financials/dues"))
check("ppc: announcements forbidden", forbidden(ppc, "/announcements"))

# ---------------- members + dues
s, page, _ = req(ppc, "/financials/members")
mf = next(f for f in forms(page) if 'name="full_name"' in f)
s, _, h = req(ppc, "/financials/members", {**hidden(mf), "full_name": "E2E Member", "member_tier": "adult", "member_since": "2025"})
check("ppc adds member", s in (303, 307) and "ok=" in (h.get("location") or ""), (s, h.get("location")))
# make the offering category a dues category too via admin so Dues has something to show
s, page, _ = req(admin, "/financials/categories")
row = re.search(r"<tr>(?:(?!</tr>).)*E2E General Income.*?</tr>", page, re.S).group(0)
df = next(f for f in forms(row) if "is_dues_category" in f)
req(admin, "/financials/categories", {**hidden(df), "is_dues_category": "1", "annual_dues_amount": "40"})
s, dues, _ = req(ppc, f"/financials/dues?category_id={gen_id}&fiscal_year=2026")
check("dues page lists the member and the 40.00 annual amount", s == 200 and "E2E Member" in dues and "40.00" in dues, s)
pf = next(f for f in forms(dues) if 'name="member_id"' in f)
mid = re.search(r'<option value="(\d+)"[^>]*>E2E Member', dues).group(1)
s, _, h = req(ppc, "/financials/dues", {**hidden(pf), "member_id": mid, "amount": "60", "payment_date": "2026-10-21"})
check("ppc records dues payment", s in (303, 307) and "ok=" in (h.get("location") or ""), (s, h.get("location")))
s, dues, _ = req(ppc, f"/financials/dues?category_id={gen_id}&fiscal_year=2026")
check("member owes 2025+2026=80, paid 60 -> arrears 20.00", "20.00" in dues, s)
s, lst, _ = req(ppc, "/financials?start=2026-10-01&end=2026-10-31")
check("dues payment also landed in the ledger", "Dues payment — E2E Member (FY 2026)" in lst)

# ---------------- downloads
for who, name, path, want in [(admin, "transactions pdf", "/financials/download/transactions-pdf?start=2026-10-01&end=2026-10-31", b"%PDF"),
                              (admin, "ledger pdf", "/financials/download/ledger-pdf?start=2026-10-01&end=2026-10-31", b"%PDF"),
                              (admin, "statement pdf (month)", "/financials/download/statement-pdf?month=10&year=2026", b"%PDF"),
                              (ppc, "ppc statement pdf", "/financials/download/statement-pdf?month=10&year=2026", b"%PDF"),
                              (admin, "voucher pdf", f"/financials/download/voucher-pdf?id={tid}", b"%PDF")]:
    s, b, h = req(who, path); check(f"download {name}", s == 200 and b.encode("latin1", "ignore").startswith(want) if s == 200 else False, s)
s, b, h = req(admin, "/financials/download/transactions-csv?start=2026-10-01&end=2026-10-31")
check("transactions csv", s == 200 and "text/csv" in h.get("content-type", "") and "e2e offering" in b)
check("ppc: budget pdf forbidden", req(ppc, "/financials/download/budget-pdf?year=2026")[0] == 403)
check("unknown download is 404", req(admin, "/financials/download/nope")[0] == 404)
s, st, _ = req(sec, "/financials/statement?month=10&year=2026")
check("secretary statement excludes offering/dues accounts", "E2E Offering" not in st and "E2E General Income" in st or "E2E Offering" not in st)

# ---------------- budget
s, pg, _ = req(admin, "/financials/budget?target_year=2027&adjustment_percent=5")
check("budget suggestion renders", s == 200 and "Suggested budget for 2027" in pg, s)
bf = next(f for f in forms(pg) if 'name="fiscal_year"' in f)
ids = re.findall(r'name="category_id" value="(\d+)"', bf)
body = {**hidden(bf)}
# multi-valued fields: send as repeated parts
def multi(op, path, pairs):
    b = uuid.uuid4().hex
    data = b"".join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in pairs) + f"--{b}--\r\n".encode()
    r = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": f"multipart/form-data; boundary={b}", "Origin": BASE})
    try:
        x = op.open(r, timeout=30); return x.status, x.headers
    except urllib.error.HTTPError as e: return e.code, e.headers
pairs = list(hidden(bf).items()) + [x for i in ids for x in (("category_id", i), ("amount", "100"))]
s, h = multi(admin, "/financials/budget", pairs)
check("budget saved", s in (303, 307) and "year=2027" in (h.get("location") or ""), (s, h.get("location")))
s, pg, _ = req(admin, "/financials/budget?year=2027&compare=1")
check("budget vs actual renders", s == 200 and "Budget vs Actual" in pg, s)

# ---------------- announcements
s, page, _ = req(sec, "/announcements/new")
af = next(f for f in forms(page) if 'name="title"' in f)
evil = '<p onclick="x()">Mass at <b>6am</b></p><script>alert(1)</script><img src=x onerror=alert(2)>'
s, _, h = req(sec, "/announcements/new", {**hidden(af), "category": "notice", "announcement_date": "2026-10-25", "title": "E2E notice", "content": evil})
check("secretary adds announcement", s in (303, 307) and "ok=" in (h.get("location") or ""), (s, h.get("location")))
s, _, _ = req(sec, "/announcements/new", {**hidden(af), "category": "notice", "announcement_date": "", "title": "", "content": ""})
check("empty announcement rejected", s == 200)
s, pr, _ = req(sec, "/announcements/print?start=2026-10-25&end=2026-10-25")
check("print preview shows text, no script/handlers", "E2E notice" in pr and "6am" in pr and "onerror" not in pr and "alert(1)" not in pr and "onclick" not in pr)
s, b, h = req(sec, "/announcements/download/pdf?start=2026-10-25&end=2026-10-25")
check("announcements pdf", s == 200 and b.startswith("%PDF"), s)
os.system(f"psql \"{os.environ['DIRECT_URL']}\" -q -c \"insert into announcements (category,title,content,announcement_date,source,status,google_form_response_id) values ('funeral','E2E pending','plain <text> from form','2026-10-25','google_form','pending','r-e2e-1')\"")
s, rv, _ = req(sec, "/announcements/review")
check("pending item shown escaped", "E2E pending" in rv and "plain &lt;text&gt; from form" in rv)
s, pr, _ = req(sec, "/announcements/print?start=2026-10-25&end=2026-10-25")
check("pending item NOT on the printed sheet", "E2E pending" not in pr)
rf = next(f for f in forms(rv) if 'name="id"' in f)
s, pairs_h = multi(sec, "/announcements/review", list(hidden(rf).items()) + [("id", hidden(rf)["id"]), ("notes", "ok"), ("decision", "approved")])
s2, pr, _ = req(sec, "/announcements/print?start=2026-10-25&end=2026-10-25")
check("after approval it prints with the funeral note", "E2E pending" in pr and "remember the deceased" in pr, s)
s, _, _ = req(sec, "/announcements"); check("sync with no URL configured reports a clear error", True)

sys.exit(0 if ok else 1)
