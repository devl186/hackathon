# Three-hour plan — flexible, not bureaucratic

| Minutes | Goal | What Instructor should challenge |
|---|---|---|
| 0–20 | Check environment, agree simple architecture and approach | Is the plan feasible? Any missing design or services? |
| 20–50 | Four detectors, masking, risk classification, unit tests | Invalid inputs? Luhn? Overlaps? Real test output? |
| 50–85 | Secure upload, auth, Supabase, RLS, atomic writes | Raw-data leakage? Second-user isolation? Failure rollback? |
| 85–125 | Lepide UI: upload, dashboard, findings and filters | Real data flow? Empty/error states? Design compliance? |
| 125–155 | CSV export, integration/E2E, negative tests, build | Formula injection? Masking? Actual test/build evidence? |
| 155–180 | GitHub, Vercel, live smoke test, demo, learnings | Live URL? Secrets safe? Honest known limitations? |

**Standard close for every development milestone (each row from minute 20 to 180):**
"At the end of this milestone, update WORK_LOG.md with completed features, actual test/build results, Git commit details if applicable, human decisions and outstanding issues. Label anything unverified. Do not invent evidence."

**End of challenge (after minute 180, not part of the build time):** the Developer generates `DEVELOPER_SCORECARD.md` when the human asks (see `START_HERE_DEVELOPER.md`). No scores are produced or shown before then.

Priorities: working secure end-to-end path > testing > polish. At 155 minutes, stop new features and prepare deployment/demo. Do not bypass security or misrepresent incomplete work.
