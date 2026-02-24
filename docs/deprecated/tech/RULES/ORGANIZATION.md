# Tech Documentation Organization

## Mental Model

```
Primary Docs (WHAT)              Supporting Docs (HOW)
─────────────────────            ─────────────────────
Define requirements    ◄─────────  Enrich with patterns
Contracts, flows                   Integration details
Stay abstract                      Research-backed depth
                                   References for agents
```

**Primary docs** define WHAT the application does.
**Supporting docs** define HOW we implement it.

Supporting docs ENRICH primary docs. When a primary doc says "authenticate user", the supporting doc explains the actual integration pattern.

---

## Document Categories

### Primary Docs (Requirements)

Define the application's behavior, contracts, and rules.

| Doc                    | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `00_use_cases.md`      | Actor-goal pairs, what users can do           |
| `00_flows.md`          | Sequence diagrams, step-by-step operations    |
| `00_business_rules.md` | Business logic, validation rules, constraints |
| `01_data_schema.md`    | Data model, tables, relationships             |
| `03_api_design.md`     | API contract, endpoints, request/response     |

**Characteristics:**

- Focused on WHAT, not HOW
- Technology-agnostic where possible
- Reference supporting docs for depth
- Define contracts that implementation must satisfy

### Supporting Docs (Deep Dives)

Provide research-backed patterns for critical integrations.

| Doc                    | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `02_auth.md`           | Auth provider integration (Clerk)               |
| `05_image_pipeline.md` | Photo processing architecture                   |
| `06_websocket.md`      | Real-time connection patterns (Durable Objects) |
| `06_line_messaging.md` | LINE API integration                            |
| `07_observability.md`  | Monitoring, tracing, alerting                   |
| `08_security.md`       | Security patterns, PDPA compliance              |

**Characteristics:**

- Research-backed (read official docs first)
- Establish patterns for coding agents to follow
- Include critical integration decisions
- Provide references to official documentation
- NO full implementation code (that belongs in CONTEXT files)

---

## How Docs Connect

### Enrichment Flow

```
Primary Doc                      Supporting Doc
────────────                     ──────────────
00_flows.md
  │
  │ "Step 5: Verify auth token"
  │ → See 02_auth.md
  │
  └─────────────────────────────► 02_auth.md
                                    │
                                    │ Pattern: Worker validates
                                    │ Clerk JWT, extracts user_id
                                    │
                                    │ Reference: Clerk Backend SDK
                                    │ https://clerk.com/docs/...
                                    │
                                    └──► Coding agent pulls details
```

### Reference Pattern

In primary docs, reference supporting docs like this:

```markdown
7. Authenticate request
   - Verify Clerk JWT token
   - Extract photographer_id
   - See `02_auth.md` for integration pattern
```

In supporting docs, reference official documentation:

```markdown
### References

| Topic             | URL                        |
| ----------------- | -------------------------- |
| Clerk Backend SDK | https://clerk.com/docs/... |
| JWT Verification  | https://clerk.com/docs/... |
```

---

## What Goes Where

| Content Type                 | Location                             |
| ---------------------------- | ------------------------------------ |
| User actions, goals          | `00_use_cases.md`                    |
| Step-by-step sequences       | `00_flows.md`                        |
| Business logic, rules        | `00_business_rules.md`               |
| Database tables              | `01_data_schema.md`                  |
| API endpoints, contracts     | `03_api_design.md`                   |
| Integration patterns         | Supporting docs (`02_`, `05_`-`08_`) |
| Raw research, exploration    | `dev/research/`                      |
| Implementation code patterns | `CONTEXT.md` files (future)          |

---

## Numbering Convention

| Prefix      | Category                                    |
| ----------- | ------------------------------------------- |
| `00_`       | Core requirements (use cases, flows, rules) |
| `01_`       | Data layer                                  |
| `02_`       | Auth (supporting)                           |
| `03_`       | API layer                                   |
| `05_`-`08_` | Supporting deep dives                       |
| `09_`-`10_` | Operations (testing, deployment)            |

---

## Anti-Patterns

### In Primary Docs

| Don't                     | Do Instead                 |
| ------------------------- | -------------------------- |
| Explain SDK usage         | Reference supporting doc   |
| Include code snippets     | Describe the contract      |
| Deep-dive into technology | Stay at requirements level |

### In Supporting Docs

| Don't                                                  | Do Instead                                             |
| ------------------------------------------------------ | ------------------------------------------------------ |
| Define API routes                                      | That's in `03_api_design.md`                           |
| Duplicate WHAT/WHERE from primary docs                 | Reference primary docs, focus on HOW to implement      |
| Specify values, limits, or rules per endpoint/resource | That's in primary docs - focus on enforcement patterns |
| Write full implementations                             | Establish patterns only                                |
| Skip research                                          | Read official docs first                               |
| Forget references                                      | Always link to sources                                 |

---

## Relationship to Other Systems

| System               | Purpose                        | Location                    |
| -------------------- | ------------------------------ | --------------------------- |
| Business docs        | Vision → Strategy → Validation | `docs/`                     |
| Tech primary docs    | Requirements, contracts        | `dev/tech/00_`-`03_`        |
| Tech supporting docs | Integration patterns           | `dev/tech/02_`, `05_`-`08_` |
| Research             | Raw exploration                | `dev/research/`             |
| CONTEXT files        | Implementation for agents      | `CONTEXT.md` (future)       |
