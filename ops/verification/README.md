# Synthetic report restart acceptance

`report-restart-acceptance.ts` exercises the actual generated-report worker, PostgreSQL transactions, PDF renderer and saved-artifact downloads across real Bun process deaths. It never reads application `.env` files or calls an AI provider. Scoring is a frozen local response with an idempotent synthetic job table.

Use only an empty disposable PostgreSQL database named `fixture_app` on `127.0.0.1` with an explicit nonstandard port. Apply the Application migrations first. The script rejects non-loopback URLs, another database name, existing patients, and output directories outside `/tmp/niq-*`.

```sh
printf '%s' '{"url":"postgresql://fixture_user@127.0.0.1:55439/fixture_app","outputDirectory":"/tmp/niq-pdf-restart-acceptance"}' |
  bun ops/verification/report-restart-acceptance.ts
```

The drill kills separate worker processes while queued, awaiting a Scoring response, and inside an artifact-save transaction. It verifies rollback of a partial save, retention of an issued PDF, restart recovery, a single job/report/artifact per request, an unchanged completed-request replay and correct artifact hashing. Lease timestamps are advanced **after** the crashed process exits to avoid waiting for production lease durations. This tests Application worker restart recovery with a stub Scoring boundary, not the Scoring worker's own recovery or live provider behavior.

The script retains `results.json`, recovered PDFs and short/long synthetic layout PDFs in the output directory. It leaves its disposable database for inspection. Remove that database and temporary files after reviewing the evidence. It must never run against a live database.
