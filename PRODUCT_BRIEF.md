# MiniDSP — Product brief

**Goal:** Training-only Data Discovery & Classification SaaS. One user can sign in, upload a synthetic CSV/TXT file, scan it for sensitive-data patterns, see masked results, review previous scans, filter findings and export a safe CSV.

## Stack
Next.js + React + TypeScript; Supabase PostgreSQL/Auth/RLS; GitHub; Vercel; Vitest/React Testing Library/Playwright as appropriate. Follow the **actual** supplied Lepide design-system Markdown and live reference; never invent its design tokens.

## Must-have functionality
- **F-01 Auth:** unauthenticated users cannot access records; each user sees only their own scans.
- **F-02 Upload:** CSV/TXT, 1–1,048,576 bytes; reject empty, oversized, unsupported, binary and invalid UTF-8 **on the server**. Do not retain originals.
- **F-03 Email:** plausible common emails → Low.
- **F-04 UK phones:** common mobile/geographic `0`/`+44` forms → Medium; avoid partial matches.
- **F-05 UK NINO:** permitted two-letter prefixes, six digits, optional A–D suffix → High (format only).
- **F-06 Card candidates:** 13–19 digits with spaces/hyphens; valid Luhn required → Critical; avoid partial matches.
- **F-07 Classification:** highest detected risk wins; no findings → None. Aggregate non-overlapping occurrences by detector type, track counts and a masked example.
- **F-08 Persistence:** save scan metadata and masked, aggregated findings only. Enforce owner-scoped RLS on scan and finding records, including parent-child integrity. Atomic save/no partial writes.
- **F-09 Dashboard:** scanned files, findings, High/Critical counts, risk distribution, recent scans.
- **F-10 Findings:** filter by type and risk; show filename, date, count, masked example, empty/error states.
- **F-11 CSV:** export only own masked data; quote fields correctly; neutralise spreadsheet formulas in untrusted text such as filenames.
- **F-12 Delivery:** responsive Lepide-aligned UI, private GitHub repository, Vercel deployment, real test/build evidence, concise documentation, demo.

## Non-negotiable safety
Synthetic data only. No production/customer data. Never persist, log, export or forward raw uploaded contents or raw detected values to AI/telemetry. Keep secrets out of Git. Server-side validation and processing; no client-only security. Verify RLS with two users. No false test-pass claims.

## Simple acceptance checks
1. Email `alex@example.test` → Low, masked; malformed `alex@@example.test` ignored.
2. Phone `07700 900123` or `+44 7700 900123` → Medium; `12345` ignored.
3. Synthetic NINO `AB 12 34 56 C` → High; malformed equivalent ignored.
4. Public test card `4111 1111 1111 1111` → Critical; last digit `2` fails Luhn.
5. Mixed file → Critical; clean file → None; repeated matches count correctly.
6. Invalid/empty/>1 MiB upload rejected without database writes.
7. User B cannot read/write User A's scans or attach findings to A's scan.
8. Failed finding write leaves no partial scan; DB/logs contain no raw matches.
9. Dashboard/filter totals match stored data; export is masked and spreadsheet-safe.
10. Tests and production build actually execute; deployed login→upload→findings→export works.

Out of scope: OCR, PDF/image uploads, filesystem crawling, real data, billing, AI analysis of file contents, enterprise-scale precision.
