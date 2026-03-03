# FTP Failure Drilldown

## Scope
Use this runbook when FTP upload success or throughput regresses.

## 1. Validate ingress health
- Dashboard: `FrameFast FTP - Observability`
- Check:
  - `FTP Upload Rate by Status`
  - `FTP Upload p95 Duration`
  - `FTP Error Logs`

## 2. Validate downstream API dependency
- Confirm `POST /api/ftp/auth` and `POST /api/ftp/presign` are healthy on API dashboard.
- If auth errors increase, validate FTP credentials expiry and API DB connectivity.

## 3. Validate R2 path
- Look for `upload_r2_ok` vs `upload_completed` events in FTP logs.
- If `upload_r2_ok` missing, presign/R2 path is failing before final completion.

## 4. Trace correlation
- Use `traceparent` from FTP logs and search in Tempo to follow cross-service flow.

## 5. Immediate mitigation
- If API unreachable from FTP host, failover to healthy API endpoint.
- If R2 upload path fails due headers/signature mismatch, roll back recent presign header changes.
