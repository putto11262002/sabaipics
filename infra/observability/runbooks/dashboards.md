# Canonical Dashboards

## Primary dashboards
- `FrameFast API - Metrics`
- `FrameFast Pipeline + Recognition Metrics`
- `FrameFast FTP - Observability`
- `FrameFast Tracing Overview`
- `FrameFast Alerting + SLO`

## Triage path
1. Start with Alerting + SLO for symptom confirmation.
2. Move to API/Pipeline/FTP dashboards to isolate subsystem.
3. Use Tracing Overview for request-level timeline.
4. Use Loki logs for payload-level details and root-cause signature.
