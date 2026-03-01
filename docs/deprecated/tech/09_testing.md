# Testing Strategy

**Status:** Complete - Fast Iteration Focus
**Last Updated:** 2025-12-06

---

## Overview

This document defines the testing strategy for FaceLink, optimized for rapid development and fast iteration while maintaining reliability. The strategy covers Cloudflare Workers backend, React web applications, and Wails desktop applications.

**Testing Philosophy:** Test early, test locally, deploy fast, fail fast

---

## Primary Requirements from Primary Docs

From `00_flows.md` and `00_business_rules.md`, critical testing requirements include:

| Flow                | Testing Priority | Key Validation                                          |
| ------------------- | ---------------- | ------------------------------------------------------- |
| Photo Upload        | P0 - Critical    | File validation, storage, processing queue              |
| Photo Processing    | P0 - Critical    | Rekognition integration, face detection, error handling |
| Face Search         | P1 - High        | Search accuracy, performance, result relevance          |
| Photo Download      | P1 - High        | Access control, URL generation, delivery tracking       |
| User Authentication | P0 - Critical    | Clerk integration, LINE OAuth, session management       |

**Supporting Integration:** See `02_auth.md` for authentication testing patterns and `07_observability.md` for monitoring test coverage.

---

## Critical Decision 1: Cloudflare Workers Testing

### Technology Stack

- **Vitest** + **@cloudflare/vitest-pool-workers** - 10x faster than Jest
- **Remote Bindings** - Local code with production resources
- **Preview Deployments** - Automated staging per PR
- **Environment-based Testing** - Development, staging, production

### Testing Strategy

#### **Local Development Testing**

- **Primary**: `wrangler dev` for hot-reloading development
- **Secondary**: Remote bindings to test against real D1/R2 without deployment
- **Configuration**: Automatic resource provisioning in wrangler.jsonc

#### **Unit Testing**

- **Framework**: Vitest with Workers runtime
- **Focus**: Individual request handlers, data validation, business logic
- **Execution**: Parallel testing with smart re-runs on file changes

#### **Integration Testing**

- **Real Services**: Remote bindings for D1 database, R2 storage, KV
- **Mock Services**: External APIs (Rekognition, third-party services)
- **Patterns**: Request-response cycles, error handling, data flow

#### **End-to-End Testing**

- **Preview Environments**: Deployed Workers with real data
- **Test Data**: Isolated test databases and buckets
- **Automation**: GitHub Actions with parallel test execution

### Performance Testing

- **Load Testing**: API endpoint performance under load
- **Latency Targets**: Upload <2s, Search <3s, Download <200ms
- **Concurrency**: Multiple simultaneous uploads and searches

---

## Critical Decision 2: React Application Testing

### Technology Stack

- **Vitest 4.0** - Fast test runner with native TypeScript support
- **React Testing Library** - User behavior-focused component testing
- **MSW (Mock Service Worker)** - API mocking for isolated testing
- **Playwright** - Browser automation for E2E testing

### Testing Strategy

#### **Component Testing**

- **Focus**: User interactions, form validation, error states
- **Pattern**: Test what users see and do, not implementation details
- **Privacy**: No actual face photo data in tests, mock all sensitive content

#### **File Upload Testing**

- **Drag & Drop**: File selection, validation, progress tracking
- **File Types**: Image validation, size limits, format support
- **Batch Operations**: Multiple file handling, parallel uploads

#### **API Integration Testing**

- **Mock Services**: MSW for Cloudflare Workers API mocking
- **Error Scenarios**: Network failures, validation errors, rate limiting
- **Real Services**: Integration testing with preview Worker environments

#### **Visual Regression Testing**

- **Vitest Visual**: Built-in screenshot comparison
- **Responsive Design**: Multiple viewport testing
- **Privacy**: Ensure no face photo capture in any test artifacts

---

## Critical Decision 3: Wails Desktop Application Testing

### Technology Stack

- **Go**: Standard testing package + Testify for backend logic
- **React**: Same stack as web applications (Vitest + RTL)
- **Playwright/Cypress**: E2E testing for desktop application
- **Mock Runtime**: Wails Go-to-JS bridge mocking

### Testing Strategy

#### **Backend (Go) Testing**

- **Unit Tests**: Business logic, file operations, upload processing
- **File System**: Mocked file operations for isolated testing
- **External APIs**: Mocked HTTP clients for cloud services
- **Cross-Platform**: Platform-specific test builds

#### **Frontend (React) Testing**

- **Component Tests**: Same patterns as web applications
- **Wails Integration**: Mock Go-to-JS bridge calls
- **Desktop Features**: File dialogs, system notifications, menu interactions
- **User Actions**: Upload workflows, progress tracking, error handling

#### **Integration Testing**

- **Full Stack**: Go backend + React frontend communication
- **File Operations**: Real file system testing with test data
- **External Services**: Cloudflare Workers API integration
- **Cross-Platform**: Windows, macOS, Linux compatibility

---

## Critical Decision 4: Testing Environment Strategy

### Development Environment

- **Local-First**: Maximum local testing before deployment
- **Hot Reloading**: Instant feedback on code changes
- **Mock Services**: External service isolation
- **Test Data**: Automated test data generation

### Staging Environment

- **Preview Deployments**: Automatic deployment per PR
- **Real Resources**: Staging databases, storage buckets
- **Integration Testing**: Full application stack testing
- **Performance Testing**: Load and latency validation

### Production Environment

- **Monitoring-First**: Real-time observability and alerting
- **Gradual Rollout**: Feature flags and canary deployments
- **Rollback Strategy**: Fast rollback procedures
- **Health Checks**: Automated system health validation

---

## Critical Decision 5: Mocking and Test Data Strategy

### External Service Mocking

- **Cloudflare Workers API**: MSW for web, HTTP mocking for Go
- **AWS Rekognition**: Mocked face detection responses
- **File Operations**: Mocked file system for isolated testing
- **Third-party APIs**: Request/response stubbing

### Test Data Management

- **Synthetic Data**: Generated face photos without real people
- **Test Isolation**: Separate test databases per test run
- **Data Cleanup**: Automated test data removal
- **Privacy**: No real user or photo data in any tests

### Mock Patterns

- **Deterministic Tests**: Predictable results for CI/CD
- **Error Scenarios**: Network failures, validation errors, timeouts
- **Edge Cases**: Large files, concurrent operations, resource limits
- **Performance**: Mock latency and response time variations

---

## Critical Decision 6: CI/CD Testing Pipeline

### GitHub Actions Strategy

```yaml
# Parallel testing matrix
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node-version: [18, 20]
    go-version: [1.21, 1.22]

# Fast feedback stages
stages:
  - lint-and-format
  - unit-tests
  - integration-tests
  - build-and-e2e
  - deploy-and-verify
```

### Test Execution Order

1. **Linting & Formatting**: Code quality validation (< 30 seconds)
2. **Unit Tests**: Business logic and component tests (< 2 minutes)
3. **Integration Tests**: API and database integration (< 5 minutes)
4. **E2E Tests**: Full application workflows (< 10 minutes)
5. **Deploy & Verify**: Preview deployment testing (< 5 minutes)

### Performance Targets

- **Full Pipeline**: < 20 minutes for PR validation
- **Unit Tests**: < 2 minutes for complete suite
- **Integration Tests**: < 5 minutes for all services
- **E2E Tests**: < 10 minutes for critical user journeys

---

## Critical Decision 7: Fast Iteration Patterns

### Local Development Workflow

- **Watch Mode**: `npm run test:watch` and `wrangler dev`
- **Smart Re-runs**: Only affected tests on file changes
- **Hot Module Replacement**: Instant React component updates
- **Remote Bindings**: Local changes with real Cloudflare resources

### Branching Strategy

- **Feature Branches**: Isolated development with preview deployments
- **Main Branch**: Production-ready code with full test coverage
- **Hotfixes**: Rapid deployment with minimal testing for critical fixes
- **Experimental**: Feature flags for safe experimentation

### Deployment Patterns

- **Preview Environments**: Automatic deployment per PR
- **Staging Environment**: Pre-production testing with real data
- **Production Deployment**: Gradual rollout with monitoring
- **Rollback Strategy**: One-command rollback procedures

---

## Critical Decision 8: Testing Coverage and Quality

### Coverage Targets

- **Unit Tests**: 90% code coverage for business logic
- **Integration Tests**: 80% coverage for API endpoints
- **E2E Tests**: 100% coverage for critical user journeys
- **Security Tests**: 100% coverage for authentication and authorization

### Quality Gates

- **Code Coverage**: Minimum thresholds for test coverage
- **Performance**: Latency targets must be met
- **Security**: Vulnerability scanning and penetration testing
- **Compliance**: Privacy and data protection validation

### Monitoring Integration

- **Test Execution**: Track test performance and failures
- **Coverage Trends**: Monitor coverage changes over time
- **Defect Detection**: Early detection of regressions
- **Quality Metrics**: Test effectiveness and reliability

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

- Setup Vitest configuration for Workers and React
- Implement basic unit tests for critical functions
- Configure remote bindings for local development

### Phase 2: Integration (Week 3-4)

- Add integration tests with real Cloudflare services
- Implement React component testing with file upload functionality
- Setup MSW for API mocking

### Phase 3: E2E and CI/CD (Week 5-6)

- Implement Playwright E2E tests for critical user journeys
- Setup GitHub Actions testing pipeline
- Configure preview deployments and automated testing

---

## References

| Component                  | Documentation       | Link                                                    |
| -------------------------- | ------------------- | ------------------------------------------------------- |
| Vitest                     | Fast test runner    | https://vitest.dev/                                     |
| Cloudflare Workers Testing | Official docs       | https://developers.cloudflare.com/workers/testing/      |
| React Testing Library      | Component testing   | https://testing-library.com/docs/react-testing-library/ |
| Wails Testing              | Desktop app testing | https://wails.io/docs/guides/testing/                   |
| MSW                        | API mocking         | https://mswjs.io/                                       |
| Playwright                 | E2E testing         | https://playwright.dev/                                 |

**Connected Primary Docs:**

- `00_flows.md` - Critical user journeys requiring E2E testing
- `00_business_rules.md` - Validation rules requiring unit test coverage
- `01_data_schema.md` - Database operations requiring integration testing
- `02_auth.md` - Authentication flows requiring comprehensive security testing
- `07_observability.md` - Monitoring and alerting for production issues
