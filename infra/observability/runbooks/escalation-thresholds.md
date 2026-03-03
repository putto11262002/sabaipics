# Escalation Thresholds and Ownership

## Ownership
- API + Queues: Backend owner on-call
- Recognition pipeline: ML/Recognition owner on-call
- Dashboard/Event/iOS clients: Frontend or Mobile owner on-call
- FTP ingestion: Infra/Backend owner on-call

## Escalate to incident
- Upload success rate < 98% for 15m
- Search success rate < 97% for 15m
- API error ratio > 5% for 10m
- Queue failure ratio > 10% for 10m
- Recognition error ratio > 10% for 10m

## Severity guidance
- `warning`: degraded but core flow still functional
- `critical`: customer-visible failure or sustained SLO breach risk
