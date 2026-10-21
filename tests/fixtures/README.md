# 30 additional MiniDSP synthetic fixtures

These are training-only examples. `expected_file_risk` is the **intended** result for the exercise, not a verified result from the implementation. `Reject` means upload validation should reject the file. Some negative inputs may reveal detector false positives; investigate rather than silently adjusting expectations.

Use `additional/` for the 30 samples. See `additional/EXPECTED_RESULTS.json` for intended outcomes. **No real personal data or credentials.**

Note: `29_unsupported.json` should be rejected despite containing a valid-looking email. `30_oversized.txt` is >1 MiB and should be rejected before scanning.
