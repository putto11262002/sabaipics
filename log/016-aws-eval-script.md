# 016 - AWS Evaluation Script (Standalone)

Date: 2026-01-23

## Context

The existing comparison script `apps/sabaiface/tests/manual/test-aws-vs-recognition.ts` requires a running SabaiFace server and primarily compares SabaiFace vs AWS.

For decision-making, we need a standalone AWS evaluation that:

- does not depend on any local recognition service
- uses the same dataset + photo-level retrieval metrics as our main eval
- uses the tuned parameters we identified as the best achievable region for the current SabaiFace model

## Change

Added a standalone AWS evaluation script:

- `apps/sabaiface/tests/manual/test-aws-eval.ts`

It:

- creates a temporary AWS Rekognition collection
- indexes the evaluation index photos
- runs photo-level searches using `findImagesByFace` semantics (selfie -> photos)
- reports Precision/Recall/Avg FP/FP-free rate at K
- cleans up the collection

Added `pnpm` script:

- `pnpm --filter=@sabaipics/face-recognition test:aws-eval`

## Defaults

- `MIN_SIMILARITY` default: `0.94`
- `MAX_RESULTS` default: `20`
- `EVAL_KS` default: `10,20`
