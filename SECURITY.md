# Security design

## Layers (an attacker has to beat all of them)
| Layer | Control |
|---|---|
| Network | HTTPS only (Vercel), HSTS 2 years, `upgrade-insecure-requests`, Supabase Data API disabled |
| Browser | Nonce-based CSP with `strict-dynamic`, `frame-ancestors 'none'`, nosniff, same-origin referrer/COOP/CORP, `noindex`, `no-store` on every response |
| Session | Signed JWT in an `httpOnly`, `Secure`, `SameSite=Lax`, `__Host-` cookie; 2 h idle (sliding) + 12 h absolute; **re-validated against the database on every request** (disabled user, role change or password change takes effect immediately) |
| Login | bcrypt (cost 12), constant-time unknown-user path, per-IP and per-username limits stored in Postgres (shared by all serverless instances), 5-try / 15-minute account lockout, generic error text |
| Authorisation | One role matrix (`src/lib/auth/permissions.ts`) checked in the page/action **and again** in the data layer; field-level restrictions; middleware is only an early filter |
| Input | Per-field whitelist validation (no mass assignment), parameterised SQL only, sort/filter columns come from the registry never from the request |
| Output | React escaping, no raw HTML, CSV formula-injection neutralised |
| CSRF | Mutations are Server Actions (Origin-checked); GET handlers are read-only |
| Data integrity | Writes and their audit rows commit in **one transaction**; optimistic concurrency stops silent overwrites |
| Database | Row-level security on every table, no policy for `anon`/`authenticated`; the app role has least privilege and **cannot update/delete `audit_log` / `access_log`**; owner credentials never reach Vercel |
| Recovery | Encrypted nightly backups (private key offline), restore drill documented |
| Supply chain | Lock file, Dependabot, CI audit gate on production dependencies |

## Known limitations (be aware, plan to close)
1. **No multi-factor authentication yet.** Highest-value next feature for the admin and priest roles (TOTP).
2. CSP keeps `style-src 'unsafe-inline'` because Next.js injects inline styles; scripts are fully nonce-protected.
3. Login throttling is IP/username based; there is no CAPTCHA. Lockout bounds guessing against any one account.
4. Ghana-hosted data is not available on Vercel/Supabase free regions; data is stored in the chosen EU region.
5. `npm audit` reports dev-tool advisories (test runner); production dependencies are gated in CI.
6. Large exports are capped (20,000 rows) to fit serverless time limits.

## Reporting
Report suspected problems to the parish administrator; they should review *Admin → Access log* and rotate secrets per `DEPLOYMENT.md → Operations`.
