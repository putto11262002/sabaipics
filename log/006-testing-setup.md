# 006 - Testing Setup for API

**Date:** 2025-12-08
**Branch:** `feat/rekognition-queue-setup`
**Status:** Complete

---

## Summary

Established testing patterns for `apps/api` with Cloudflare Workers:
- Functional tests for Node.js (AWS SDK mocks)
- Workers tests for Durable Objects (miniflare runtime)
- Integration tests for real AWS calls (opt-in)

---

## Test Categories

| Category | File Pattern | Runtime | External Deps |
|----------|-------------|---------|---------------|
| **Functional** | `*.test.ts` | Node.js | Mocked (aws-sdk-client-mock) |
| **Workers** | `*.workers.test.ts` | workerd (miniflare) | None |
| **Integration** | `*.integration.ts` | Node.js | Real AWS (opt-in) |

---

## Key Decision: Split Test Configs

AWS SDK v3 has CJS dependencies (`snakecase-keys`) incompatible with workerd runtime.

**Solution:** Two vitest configs:
- `vitest.node.config.ts` - Node.js environment for AWS mock tests
- `vitest.config.ts` - workerd pool for DO/R2/Queue tests

```bash
# Run all tests
pnpm test:run

# Run only workers tests (DO)
pnpm test:workers

# Run integration tests (real AWS)
pnpm test:integration  # Requires INTEGRATION=true
```

---

## Files Created

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Workers pool config for DO tests |
| `vitest.node.config.ts` | Node.js config for AWS mock tests |
| `tests/tsconfig.json` | Test-specific TypeScript config |
| `tests/env.d.ts` | Type declarations for `cloudflare:test` |
| `tests/setup.ts` | Global test setup (credential validation) |
| `tests/rate-limiter.workers.test.ts` | DO behavior tests (4 tests) |
| `tests/rekognition.test.ts` | AWS SDK mock tests (11 tests) |
| `tests/rekognition.integration.ts` | Real AWS integration test |
| `tests/setup.integration.ts` | Integration test setup (Zod env validation) |
| `tests/fixtures/index.ts` | Generic fixture downloader with R2 caching |

---

## Dependencies Added

```json
{
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.10.14",
    "aws-sdk-client-mock": "^4.1.0",
    "vitest": "^3.2.0",
    "vite": "6",
    "zod": "^4.1.13"
  }
}
```

**Note:** `vite@6` required for Node.js 20.11.1 compatibility. Root `package.json` has override:
```json
{
  "pnpm": {
    "overrides": {
      "vitest>vite": "^6.0.0"
    }
  }
}
```

---

## Test Commands

```bash
# Watch mode (Node.js tests)
pnpm test

# Run all tests once
pnpm test:run

# Run only workers tests
pnpm test:workers

# Run integration tests (requires AWS credentials)
pnpm test:integration
```

---

## Testing Patterns Established

### 1. AWS SDK Mocking (aws-sdk-client-mock)

```typescript
import { mockClient } from "aws-sdk-client-mock";
import { RekognitionClient, IndexFacesCommand } from "@aws-sdk/client-rekognition";

const rekognitionMock = mockClient(RekognitionClient);

beforeEach(() => rekognitionMock.reset());
afterAll(() => rekognitionMock.restore());

it("handles response", async () => {
  rekognitionMock.on(IndexFacesCommand).resolves({
    FaceRecords: [{ Face: { FaceId: "face-001" } }],
  });
  // ... test code
});
```

### 2. Durable Object Testing (cloudflare:test)

```typescript
import { env } from "cloudflare:test";

it("tests DO behavior", async () => {
  const id = env.AWS_REKOGNITION_RATE_LIMITER.idFromName("test");
  const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(id);

  const result = await rateLimiter.reserveBatch(10);
  expect(result.delay).toBe(0);
});
```

### 3. Integration Tests (separate config)

```typescript
// tests/setup.integration.ts - validates env with Zod
import { z } from "zod";

const envSchema = z.object({
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION: z.string().min(1),
});

beforeAll(() => {
  envSchema.parse(process.env);
});
```

```typescript
// Integration tests only verify API integration, NOT accuracy
it("indexes faces from image", async () => {
  const result = await indexFaces(client, eventId, testImage, "photo-001");

  // Only test integration point - API returns expected structure
  expect(result).toHaveProperty("faceRecords");
  expect(result).toHaveProperty("unindexedFaces");
});
```

---

## CI Integration

| Trigger | Tests Run |
|---------|-----------|
| PR to master | `test:run` (functional + workers, mocked AWS) |
| Push to master (staging) | `test:run` (mocked AWS only) |
| Manual deploy (production) | `test:run` + `test:integration` (real AWS) |

**Note:** Integration tests only run on production deploys to minimize AWS costs.

---

## Known Limitations

1. **AWS SDK in workerd**: CJS dependencies fail in workerd runtime. Use Node.js environment for AWS mock tests.

2. **AWS Rekognition image size limit**: Images sent via `IndexFaces` with inline bytes must be **≤5MB**. Test images and production uploads must be resized/compressed before sending to Rekognition. Consider using S3 references for larger images.

3. **Compatibility date warning**: `2025-12-06` not yet supported by installed workerd, falls back to `2025-12-02`. No functional impact.

---

## References

- [Cloudflare Workers Vitest Integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Cloudflare Vitest Test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)
- [aws-sdk-client-mock](https://github.com/m-radzikowski/aws-sdk-client-mock)
- [Vitest Configuration](https://vitest.dev/config/)

---

## Changelog

### 2025-12-12

- Removed `Tags` from `createCollection()` - IAM user lacked `rekognition:TagResource` permission, tags unnecessary since collection ID contains event ID
- Added `vitest.integration.config.ts` - dedicated config for integration tests with `.dev.vars` auto-loading
- Fixed `test:integration` script to use new config
- Added tests to CI/CD pipelines:
  - `ci.yml`: Run `test:run` on PRs
  - `deploy-staging.yml`: Run `test:run` (mocked only)
  - `deploy-production.yml`: Run `test:run` + `test:integration` (real AWS)
- Added AWS secrets to Cloudflare Workers via wrangler in deploy workflows
- Added `tests/fixtures/test-images.ts` - utility to download real test images from R2 with local caching
- Test images stored in R2 bucket `pabaipics-tests-fixtures` at `aws-rekognition/1.jpg` through `4.jpg`
- Images must be ≤5MB for Rekognition inline bytes (resized from originals using `sips -Z 1500`)

### GitHub Secrets Required

Add these secrets at **repository level** (Settings → Secrets and variables → Actions → Repository secrets):

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key for Rekognition |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `AWS_REGION` | AWS region (e.g., `us-west-2`) |

**Note:** AWS credentials are shared across all environments. Use values from `.dev.vars`.

### 2025-12-12 (continued)

- Refactored `tests/fixtures/test-images.ts` → `tests/fixtures/index.ts` with generic `getFixture(folder, filename)` function
- Deleted `tests/fixtures/generate-image.ts` (no longer needed)
- Removed `describe.runIf(INTEGRATION)` pattern - integration tests use dedicated `vitest.integration.config.ts`
- Created `tests/setup.integration.ts` with Zod validation for AWS credentials
- Updated integration tests to only verify API integration point, not face detection accuracy (out of scope)
- Added `zod@4.1.13` as dev dependency for env validation
