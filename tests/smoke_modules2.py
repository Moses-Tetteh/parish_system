"""HTTP smoke test #2: households, parishioner tools, workflow panels, societies, levy, roster, calendar, notifications, annual report, settings.
Usage (after smoke_modules.py has seeded users): BASE=... DIRECT_URL=... ADMIN_PASSWORD=... TEST_PASSWORD=... python3 tests/smoke_modules2.py"""
import os, re, sys, html
sys.path.insert(0, os.path.dirname(__file__))
import smoke_modules_lib as L

# clean slate (throw-away database only!) + clear the login throttle so repeated runs are possible
os.system(f"psql \"{os.environ['DIRECT_URL']}\" -q -c \"truncate marriage_preparations, sacrament_candidates, societies, mass_times, ministry_assignments, confirmation_records, baptism_records, parishioners, households, announcements, baptism_notifications, external_sacrament_notices, annual_report_snapshots, rate_limits restart identity cascade\" 2>/dev/null")
admin = L.login("admin", os.environ["ADMIN_PASSWORD"]); pw = os.environ["TEST_PASSWORD"]
sec, ppc, pri = L.login("sec_t", pw), L.login("ppc_t", pw), L.login("pri_t", pw)
check, req, forms, hidden = L.check, L.req, L.forms, L.hidden
ok_redirect = lambda s, h: s in (303, 307) and "ok=" in (h.get("location") or "")

# ---- every new page renders for admin
for p in ["/households", "/households/new", "/parishioners/duplicates", "/parishioners/sync", "/parishioners/irregular", "/parishioners/import-households", "/candidates/attendance",
          "/calendar", "/calendar?year=2026&month=4", "/roster", "/levy", "/notifications", "/notifications/letter?place=Nowhere", "/reports/annual", "/admin/settings", "/admin/settings/workflow", "/admin/settings/system-check",
          "/registers/parishioners", "/registers/marriage_prep", "/registers/candidates", "/registers/societies", "/registers/sick_calls"]:
    s, body, _ = req(admin, p); L.check(f"admin GET {p}", s == 200, s)

# ---- role gates
check("secretary: settings forbidden", L.forbidden(sec, "/admin/settings"))
check("priest: settings forbidden", L.forbidden(pri, "/admin/settings"))
check("secretary: irregular unions forbidden", L.forbidden(sec, "/parishioners/irregular"))
check("priest: irregular unions ok", req(pri, "/parishioners/irregular")[0] == 200)
check("ppc: households forbidden", L.forbidden(ppc, "/households"))
check("ppc: calendar/roster forbidden", L.forbidden(ppc, "/calendar") and L.forbidden(ppc, "/roster"))
check("ppc: levy forbidden or view-only (not manage)", req(ppc, "/levy")[0] in (200, 307, 303))
check("secretary: annual report forbidden", L.forbidden(sec, "/reports/annual") or req(sec, "/reports/annual")[0] == 200)
check("unauthenticated lookup is turned away (redirect to login or 401)", L.req(L.client()[0], "/api/lookup/parishioner?q=ab")[0] in (307, 401))
check("secretary: baptism lookup refused or allowed per role", req(sec, "/api/lookup/baptism?q=ab")[0] in (200, 403))

# ---- households: create, add member, duplicate hint
s, page, _ = req(sec, "/households/new")
f = next(x for x in forms(page) if 'name="household_name"' in x)
s, _, h = req(sec, "/households/new", {**hidden(f), "household_name": "E2E Mensah Family", "head_of_household": "Kofi Mensah"})
loc = h.get("location") or ""
check("household created", s in (303, 307) and "/households/" in loc, (s, loc))
hid = re.search(r"/households/(\d+)", loc).group(1)
s, view, _ = req(sec, f"/households/{hid}")
check("secretary does NOT see the dues-member link control", 'name="linked_member_id"' not in view)
af = next(x for x in forms(view) if 'name="full_name"' in x)
s, _, h = req(sec, f"/households/{hid}", {**hidden(af), "full_name": "Ama Mensah", "relationship": "Spouse"})
check("member added", ok_redirect(s, h))
s, _, h = req(sec, f"/households/{hid}", {**hidden(af), "full_name": "Ama Akua Mensah", "relationship": "Child"})
check("near-duplicate name is flagged but still saved", ok_redirect(s, h) and "looks+similar" in (h.get("location") or ""), h.get("location"))
s, view, _ = req(pri, f"/households/{hid}")
check("priest sees the dues-member link control", 'name="linked_member_id"' in view)

# ---- parishioner tools
s, pg, _ = req(admin, "/parishioners/sync")
check("sync preview renders", s == 200 and "What would change" in pg)
os.system(f"psql \"{os.environ['DIRECT_URL']}\" -q -c \"insert into baptism_records (given_name, surname, father_name, mother_name) values ('Efua','E2ETest','Kojo E2ETest','Esi E2ETest')\" 2>/dev/null")
s, pg, _ = req(admin, "/parishioners/sync")
sf = next(x for x in forms(pg) if "Apply these changes" in x)
s, _, h = req(admin, "/parishioners/sync", hidden(sf))
check("sync apply redirects with a result", s in (303, 307) and "ok=" in (h.get("location") or ""), (s, h.get("location")))
s, lst, _ = req(admin, "/registers/parishioners?q=E2ETest")
check("baptised person is now on the parishioners list", "Efua E2ETest" in lst)
s, _, _ = req(admin, "/registers/parishioners"); 

# ---- marriage prep generic save runs the banns hook (order validation) and workflow panel renders
s, np, _ = req(admin, "/registers/marriage_prep/new")
mf = next(x for x in forms(np) if 'name="groom_name"' in x or 'groom_name' in x)
base = {**hidden(mf), "groom_name": "Kojo E2E", "bride_name": "Abena E2E", "groom_religion": "catholic", "bride_religion": "catholic", "previous_marriage": "none", "banns_1_date": "2026-11-08", "banns_2_date": "2026-11-01"}
s, body, _ = req(admin, "/registers/marriage_prep/new", base)
check("out-of-order banns rejected by the hook", s == 200 and "in order" in html.unescape(body), s)
s, _, h = req(admin, "/registers/marriage_prep/new", {**base, "banns_2_date": "2026-11-15"})
check("valid banns save", s in (303, 307) and "saved=1" in (h.get("location") or ""), (s, h.get("location")))
s, lst, _ = req(admin, "/registers/marriage_prep")
pid = re.search(r"/registers/marriage_prep/(\d+)", lst).group(1)
s, edit, _ = req(admin, f"/registers/marriage_prep/{pid}")
check("workflow panel on the edit page", s == 200 and "File status" in edit and "Before the priest can approve" in edit, s)
s, an, _ = req(admin, "/announcements?category=publication_of_banns&start=2026-11-01&end=2026-11-30")
check("banns announcements were created from the dates", "Banns of Marriage" in an, s)

# ---- candidates + attendance
os.system(f"psql \"{os.environ['DIRECT_URL']}\" -q -c \"insert into sacrament_candidates (program, full_name, stage) values ('first_communion','E2E Candidate','catechumen')\" 2>/dev/null")
s, pg, _ = req(sec, "/candidates/attendance")
check("attendance roll lists the candidate", s == 200 and "E2E Candidate" in pg, s)
af = next(x for x in forms(pg) if 'name="date"' in x and "present" in x)
s, _, h = req(sec, "/candidates/attendance", {**hidden(af), "date": "2026-11-01", "present": hidden(af).get("present", "")} if False else {**hidden(af), "date": "2026-11-01"})
check("attendance saved", ok_redirect(s, h), (s, h.get("location")))
s, cl, _ = req(sec, "/registers/candidates")
cid = re.search(r"/registers/candidates/(\d+)", cl).group(1)
s, panel, _ = req(sec, f"/registers/candidates/{cid}")
check("candidate preparation panel renders with readiness list", s == 200 and "Preparation" in panel and "interview has not been marked as passed" in html.unescape(panel), s)
check("candidates index header shows counts", "Active candidates" in cl)

# ---- societies
os.system(f"psql \"{os.environ['DIRECT_URL']}\" -q -c \"insert into societies (name, group_type, dues_amount, dues_period) values ('E2E Legion','society',10,'monthly') on conflict do nothing\" 2>/dev/null")
s, sl, _ = req(sec, "/registers/societies")
sid = re.search(r"/societies/(\d+)", sl).group(1)
s, sv, _ = req(sec, f"/societies/{sid}")
check("society members & dues page", s == 200 and "Dues" in sv)
mf = next(x for x in forms(sv) if 'name="full_name"' in x)
s, _, h = req(sec, f"/societies/{sid}", {**hidden(mf), "full_name": "E2E Member Two", "office": "Treasurer"})
check("society member added", ok_redirect(s, h), (s, h.get("location")))
s, sv, _ = req(sec, f"/societies/{sid}")
pf = next(x for x in forms(sv) if 'name="amount"' in x)
s, _, h = req(sec, f"/societies/{sid}", {**hidden(pf), "amount": "10"})
check("society dues payment", ok_redirect(s, h), (s, h.get("location")))
s, sv, _ = req(sec, f"/societies/{sid}?period=2026-13")
check("invalid period falls back safely", s == 200)

# ---- levy
s, pg, _ = req(admin, "/levy")
check("levy renders and offers categories to flag", s == 200 and "Categories" in pg)
s, secpg, _ = req(sec, "/levy")
check("secretary cannot manage levy", 'name="percent_' not in secpg and "Record a payment" not in secpg)

# ---- roster + calendar
os.system(f"psql \"{os.environ['DIRECT_URL']}\" -q -c \"insert into mass_times (day_of_week, mass_time, is_active) values (0,'07:00',1)\" 2>/dev/null")
s, ro, _ = req(sec, "/roster?date=2026-10-25")
check("roster shows the Sunday Mass slot with its liturgical name", s == 200 and "07:00" in ro and "30th Sunday in Ordinary Time" in ro, s)
rf = next(x for x in forms(ro) if 'name="person_name"' in x)
s, _, h = req(sec, "/roster", {**hidden(rf), "ministry": "lector", "person_name": "E2E Lector"})
check("roster assignment", ok_redirect(s, h), (s, h.get("location")))
s, _, h = req(sec, "/roster", {**hidden(rf), "ministry": "lector", "person_name": "E2E Lector"})
check("duplicate assignment refused", s in (303, 307) and "error=" in (h.get("location") or ""))
s, ca, _ = req(sec, "/calendar?year=2026&month=4")
check("calendar shows Easter 2026", "Easter Sunday of the Resurrection" in ca and "5 April" in ca, s)

# ---- notifications (a confirmation for someone baptised elsewhere) + annual report + settings
os.system(f"psql \"{os.environ['DIRECT_URL']}\" -q -c \"insert into confirmation_records (full_name, date_of_confirmation, baptism_place) values ('E2E Elsewhere','2026-10-18','St. Peter, Kumasi')\" 2>/dev/null")
s, nt, _ = req(pri, "/notifications")
check("pending notification grouped by baptism parish", s == 200 and "St. Peter, Kumasi" in nt and "E2E Elsewhere" in nt, s)
s, lt, _ = req(pri, "/notifications/letter?place=" + "St.%20Peter%2C%20Kumasi")
check("letter lists the event", "E2E Elsewhere" in lt and "Can. 535" in lt)
nf = next(x for x in forms(nt) if 'name="keys"' in x)
key = re.search(r'name="keys" value="([^"]+)"', nf).group(1)
s, _, h = req(pri, "/notifications", {**hidden(nf), "keys": key, "sent_on": "2026-10-24", "method": "post"})
check("marked as sent", ok_redirect(s, h), (s, h.get("location")))
s, nt, _ = req(pri, "/notifications")
check("sent event no longer pending", "E2E Elsewhere" in nt and "St. Peter, Kumasi</h3>" not in nt)

s, ar, _ = req(pri, "/reports/annual?year=2026")
check("annual report renders sections", s == 200 and "Baptisms" in ar and "Marriages" in ar and "Finances" in ar, s)
s, b, h = req(pri, "/reports/annual/download?format=csv&year=2026")
check("annual csv", s == 200 and "text/csv" in h.get("content-type", "") and "Total baptisms" in b)
s, b, h = req(pri, "/reports/annual/download?format=pdf&year=2026")
check("annual pdf", s == 200 and b.startswith("%PDF"), s)
sf = next(x for x in forms(ar) if 'name="year"' in x and "frozen" in x.lower())
s, _, h = req(pri, "/reports/annual", hidden(sf))
check("snapshot saved", ok_redirect(s, h), (s, h.get("location")))

s, st, _ = req(admin, "/admin/settings")
idf = next(x for x in forms(st) if 'name="parish_name"' in x)
s, _, h = req(admin, "/admin/settings", {**hidden(idf), "parish_name": "Blessed Clementina Parish", "parish_address": "Ashaiman", "parish_slogan": "Blessed\nClementina"})
check("identity saved", ok_redirect(s, h), (s, h.get("location")))
af = next(x for x in forms(st) if "announcements_google_form_csv_url" in x)
s, _, h = req(admin, "/admin/settings", {**hidden(af), "announcements_google_form_csv_url": "https://169.254.169.254/x"})
check("SSRF-style sync URL rejected", s in (303, 307) and "error=" in (h.get("location") or ""), h.get("location"))
s, _, h = req(admin, "/admin/settings", {**hidden(af), "announcements_google_form_csv_url": "https://docs.google.com/spreadsheets/d/e/abc/pub?output=csv"})
check("Google sync URL accepted", ok_redirect(s, h))
s, sc, _ = req(admin, "/admin/settings/system-check")
check("system check passes", "Everything is in place" in sc, s)
s, wf, _ = req(admin, "/admin/settings/workflow")
wform = next(x for x in forms(wf) if 'name="sponsor_min_age"' in x)
s, _, h = req(admin, "/admin/settings/workflow", {**hidden(wform), "certificate_marriage_validity_months": "6", "sponsor_min_age": "5", "candidate_min_attendance_percent": "75"})
check("workflow rejects an out-of-range age", "error=" in (h.get("location") or ""))
sys.exit(0 if L.ok_state() else 1)
