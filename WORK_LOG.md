# Work log — Agent maintains this automatically

## Environment / baseline
- Checked 2026-10-21 06:13 UTC (Windows, PowerShell).
- Workspace is documentation + fixtures only: no `package.json`, no app code, no tests, no `.env`, **not a Git repo**.
- Tools found: Node v24.21.0, npm 11.19.0, Git 2.56.0, Docker CLI (daemon **not running**).
- Tools missing: Supabase CLI, Vercel CLI, GitHub CLI.
- `npm view @ramsarjal-404/react` / `@ramsarjal-404/css` → **SELF_SIGNED_CERT_IN_CHAIN** (corporate TLS proxy). Not bypassed by agent. Human reported it resolved before milestone 1; `npm install` then succeeded (before 06:36 UTC; exact time not recorded).
- Design: `design.md` (Lepidus, generated 2026-10-15) + `assets/logo.svg` present. `DESIGN_REFERENCE.md` live URL still `TODO` (design.md cites https://lepide-design-system.vercel.app).
- No Supabase project URL/keys, GitHub remote or Vercel project supplied. All integrations UNVERIFIED.
- `FOR_SUNJEEV.md`, `DEVELOPER_QUICK_GUIDE.md` referenced in README but absent.

## Progress (append a short entry per task)
| Time (UTC) | Task | Changed files | Tests: command + actual result | Problems / fix | Git status |
|---|---|---|---|---|---|
| 2026-10-21 06:13 | Baseline environment check | WORK_LOG.md | NOT RUN (no code/test runner exists) | npm registry TLS error; Docker daemon off | Not a Git repo |
| 2026-10-21 06:36 | M1: detection/classification core | package.json, package-lock.json, tsconfig.json, .gitignore, src/lib/scanner/{types,detectors,scan}.ts, tests/unit/{scanner,fixtures}.test.ts | `npm test` → 2 files, 108 passed, 0 failed, 0 skipped, exit 0. `npm run typecheck` (`tsc --noEmit`) → 0 errors, exit 0 (confirmed via `tsc --listFilesOnly` that src + tests are included) | None; all tests passed on first run (no mutation testing done) | Not a Git repo; no commit |
| 2026-10-21 06:47 | M2: Next.js scaffold + server upload validation route | package.json, package-lock.json, tsconfig.json (also auto-edited by `next build`: `allowJs`, `.next/dev/types` include), .gitignore, src/app/{layout,page}.tsx, src/app/api/scan/route.ts, src/lib/upload/validate.ts, tests/unit/upload-validate.test.ts, tests/integration/scan-route.test.ts | `npm test` → 4 files, 150 passed, 0 failed, 0 skipped, exit 0. `npm run typecheck` → **1st run FAILED** exit 1 (TS2322 `Uint8Array<ArrayBufferLike>` not `BlobPart` in route test) → fixed → 0 errors, exit 0. `npm run build` (`next build`, Next 16.4.2 Turbopack) → compiled, TypeScript passed, routes `/` static, `/api/scan` dynamic, exit 0. Re-ran test (150 passed) + typecheck (exit 0) after build rewrote tsconfig. Local smoke: `next start -p 3100 -H 127.0.0.1` + `curl.exe -F file=@…` → 22_all_four.csv 200 Critical (masked only); 28 → 400 empty_file; 29 → 415 unsupported_type; 30 → 413 file_too_large; sample-safe 200 None; GET → 405. Server printed no request logs. | Typecheck failure fixed (test typing only). Build warns about a stray `C:\Users\DEVL183\package-lock.json` (outside project, not touched). First smoke start bound to LAN IP; killed and restarted on 127.0.0.1 before any request. | Not a Git repo; no commit |
| 2026-10-21 07:08 | M3: Supabase auth on POST /api/scan + atomic persistence + RLS migration | package.json, package-lock.json, .gitignore, .gitattributes, .env.example, .env.local (template, git-ignored, empty), supabase/migrations/20261021070153_scans_findings_rls.sql, src/lib/supabase/server.ts, src/lib/persistence/scans.ts, src/lib/scan-handler.ts, src/app/api/scan/route.ts, tests/integration/{scan-handler,scan-route-auth,rls.hosted}.test.ts (replaces scan-route.test.ts), tests/unit/migration.test.ts | `npm test` **1st run FAILED**: 1 failed / 164 passed / 14 skipped, exit 1 ("body never read" test: ReadableStream pre-pulls 1 chunk at default highWaterMark — test bug, not handler) → fixed with `highWaterMark: 0` + added authenticated control test → **6 files passed, 1 skipped; 166 passed, 0 failed, 14 skipped, exit 0**. Skipped = 13 hosted RLS tests + 1 "NOT CONFIGURED" marker. `npm run typecheck` → exit 0. `npm run build` → compiled, TypeScript passed, `/api/scan` dynamic, exit 0. | Hosted RLS **NOT RUN** (empty .env.local). Migration **NOT APPLIED** anywhere; SQL never executed → syntax UNVERIFIED. | `git init -b main` done; files staged; commit pending (no git user.name/email configured) |

## Decisions and known gaps
- **Human decision:** npm TLS issue resolved by human; normal installs approved. Minimal tooling only (no UI scaffold).
- Tooling installed: typescript 7.0.2, vitest 5.0.5, @types/node (dev deps only). Core lives in `src/lib/scanner/` (Next.js-compatible `src/` layout). Later `create-next-app` may refuse a non-empty dir → add Next manually.
- `scanText(text)` → `{ risk, totalFindings, findings[{type, risk, count, maskedExample}] }`. Raw matches stay inside the function.
- Overlap: detectors run Critical→Low; a character span claimed by a higher-risk match can't be reused.
- Boundaries: candidates rejected if glued to adjacent letters/digits or if the digit run continues (`07700 900123 4` → no phone).
- Phone: `0`/`+44` with optional single space/hyphen; national number must be `7[1-9]`+8 (mobile, excludes 070), `2`+9 or `1`+8–9 (geographic). Not supported: `(020)` parentheses, `0044`, `+44 (0)`, 03/08 ranges.
- NINO: HMRC letter rules + banned prefixes BG/GB/KN/NK/NT/TN/ZZ; optional single spaces; optional A–D suffix; case-insensitive. Format only.
- Card: 13–19 digits, single space/hyphen separators, Luhn required; all-identical digits (e.g. `0000…`) rejected as placeholders.
- Masks: email `a***@e***.test`; phone keeps last 2 digits; NINO `AB ** ** ** *`; card keeps last 4.
- Known gaps: phones separated only by a space from another digit run are not detected; email is ASCII-only (no IDN).
- **M2 human decisions:** add Next.js manually (no create-next-app over existing files); route must not be deployed before auth + RLS.
- M2 deps: next 16.4.2, react/react-dom 19.3.1 (runtime); @types/react, @types/react-dom 19.3.0 (dev). Scanner unchanged (no defect found).
- `POST /api/scan` (multipart, field `file`): exactly one File; ext `.csv`/`.txt` (case-insensitive, last extension); 1..1,048,576 bytes; rejects C0 control bytes (except TAB/LF/FF/CR) and DEL as binary; strict `TextDecoder('utf-8', {fatal:true})`; BOM stripped. Request body read via a capped stream (1 MiB + 64 KiB) and declared Content-Length checked first. MIME type ignored (browser-supplied, untrusted); extension + content are the gate.
- Status codes: 400 empty/count/malformed, 413 too large, 415 unsupported type/non-multipart, 422 binary/invalid UTF-8. Errors never echo filename/content. Responses `Cache-Control: no-store`, `nosniff`.
- **⚠ M2 LIMITATION (superseded in M3):** `/api/scan` had no authentication. M3 now requires Supabase Auth; still no rate limiting.
- Not yet built: UI, CSV export, deployment. Next.js anonymous telemetry is enabled by default (build output says so) — consider `next telemetry disable`; what it sends is UNVERIFIED by us.
- **M3 human decisions:** hosted Supabase; human will fill `.env.local` and apply the migration; `git init` + first commit approved. PGlite local-Postgres option was offered; human did not approve it, so it was not installed.
- M3 deps: @supabase/supabase-js 2.118.0, @supabase/ssr 0.12.7. No service-role key used anywhere.
- Auth: route authenticates **before reading the body**. Accepts `Authorization: Bearer <access token>` or Supabase SSR cookies; verified server-side via `auth.getUser()`. Missing env → 503; invalid/missing session or Auth unreachable → 401 (fail closed). Cookie refresh is not written back from the API route (M4 should add session refresh for the UI).
- Persistence: user-scoped client (anon key + caller JWT) calls `create_scan_with_findings` RPC — `SECURITY INVOKER`, one transaction, RLS applies. Function checks auth, JSON array, scan risk = max finding risk; total_findings computed server-side. DB errors are swallowed (`save_failed`, 500) so no detail is logged/returned.
- Schema: `scans` (owner, sanitized file_name ≤255 no control chars, size 1..1 MiB, risk, total) and `findings` (type, risk, count, masked_example). Composite FK `(scan_id, user_id) → scans(id, user_id)` forces child owner = parent owner. CHECK constraints: type↔risk mapping and per-type masked_example patterns (≤4 digits card, ≤2 digits phone, NINO/email mask shapes) — DB rejects raw-looking values.
- RLS: authenticated only; scans select/insert/delete own; findings select own, insert own **and** parent scan owned; no update policies; anon has no grants.
- Known gaps (M3): direct table inserts by a user can create their own scan without findings (own data only; RPC is the app path). No rate limiting. Hosted two-user RLS, rollback and DB-constraint tests written but **UNVERIFIED** until run.
- Prerequisites to verify RLS: (1) run the migration SQL in the hosted project's SQL editor; (2) create two email-confirmed synthetic users; (3) fill `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `MINIDSP_TEST_USER_{A,B}_{EMAIL,PASSWORD}`); (4) run `npx vitest run tests/integration/rls.hosted.test.ts`.
- Git: `.gitattributes` marks `tests/fixtures/** -text` so CRLF conversion (core.autocrlf) can't change fixture bytes.

## Security checks
- M1: unit test asserts serialized scan result contains no raw values, no 5+ digit runs and only the 4 aggregate fields. No logging in scanner code. No file contents sent to any AI model (fixtures are synthetic). Persistence/RLS: NOT BUILT.
- M2: route tests spy on `console.log/info/warn/error/debug` and assert zero calls; response for a mixed file checked for absence of raw values, filename and CSV header; 29_unsupported.json error body checked not to contain its email. Nothing written to disk/DB. No `.env*` files exist. Smoke server bound to loopback only.
- M3: unauthenticated → 401 with body provably unread (lazy stream + authenticated control); 401 also verified through the real route with no/garbage bearer/cookie against an unreachable loopback URL; rejected uploads and save failures never call the store; store input checked for absence of raw values; save errors not leaked. Pre-commit: `git check-ignore` confirms `.env.local` ignored; staged list contains no `.env.local`; `git grep --cached` for JWT/`sb_secret_`/service-role patterns → no matches. **RLS / atomic rollback / DB constraints: UNVERIFIED (hosted tests skipped).**

**Rule:** Keep failures and retests. Do not claim PASS without executing a test.

**Rule:** Use actual UTC timestamps or Git commit timestamps. Never estimate times.
