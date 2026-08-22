# V0.8.2 runtime snapshot restore

This directory is an in-repository, self-contained copy of every file needed to execute, cache, identify, and redistribute the V0.8.2 browser runtime. Git stores copied files by their existing blob IDs, so the snapshot does not depend on the archive branch continuing to point at the right commit.

The validation kit is intentionally not inside the historical `727b8d0` checkout. Use the current verified branch's test scripts against the recovered runtime directory.

1. Copy `runtime/` to an empty working directory, including `.vercelignore`.
2. Serve that directory from one HTTP origin.
3. From the current verified repository revision, run `CATS_TEST_URL=<recovered-url> node tests/living-tower-v080.mjs`.
4. Run `CATS_TEST_URL=<recovered-url> node tests/step-1-normal-flow.mjs`.
5. Run `CATS_TEST_URL=<recovered-url> node tests/step-1-service-worker.mjs`.
6. Run `CATS_BASELINE_DIR=<directory-containing-a-clean-baseline-checkout> node tests/verify-step-1-baseline.mjs` when validating a Git checkout instead of this copied snapshot.

`MANIFEST.json` binds every copied file to the baseline path and SHA-256. `BASELINE_V082.md` contains the GitHub/Vercel rollback and roll-forward runbook and the limits of player-save recovery.
