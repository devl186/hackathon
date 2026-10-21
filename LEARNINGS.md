# What I learned

After each phase, the Agent asks the developer for one useful learning and records it briefly.

- **Planning:** Check tooling first: a corporate TLS proxy blocked npm until the human fixed it — don't bypass `strict-ssl`.
- **Detection:** Lookbehind/lookahead on whole digit runs prevents partial matches (e.g. phone inside a card). Running detectors highest-risk-first with a claimed-span mask avoids double counting. Use genuinely Luhn-valid numbers for 13/20-digit boundary tests, or the test proves nothing. Masking inside the detector keeps raw values from ever leaving `scanText`.
- **Security/persistence:** Don't trust `Content-Length` or MIME: cap the body stream yourself, then validate extension, size, control bytes and strict UTF-8 on the server. `next start` binds to all interfaces by default — use `-H 127.0.0.1` for an unauthenticated route. Spying on `console.*` in tests is a cheap guard against logging uploads. A composite FK `(scan_id, user_id) → scans(id, user_id)` enforces parent-child ownership even though FK checks bypass RLS. One `SECURITY INVOKER` RPC = one transaction = atomic save with RLS still applied. Authenticate before reading the body.
- **UI:**
- **Testing/deployment:** Run `tsc` separately from Vitest — Vitest passed while `tsc` caught a `Uint8Array<ArrayBufferLike>` vs `BlobPart` typing error. `next build` rewrites `tsconfig.json`; rerun tests/typecheck after it. A `ReadableStream` pre-pulls one chunk at default `highWaterMark` — use `0` plus a positive control when testing "body not read". Mocked tests can't prove RLS; keep hosted tests that skip loudly when not configured. Mark fixtures `-text` in `.gitattributes` so Windows CRLF conversion can't change byte counts.
- **What I'd do differently:**
