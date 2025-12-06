# Business Documentation System

Living documents that guide fast, validated decision-making. Each doc is a checkpoint that must be completed before moving to the next.

**See [WRITING_STYLE.md] for formatting rules and quality standards.**

**See [CHECKLIST.md](CHECKLIST.md) for the complete document checklist.**

---

## Strategic Rationale

**Why competitor research before customer interviews?**
- Demand already validated by existing players
- Study proven solutions, then build better
- Entering existing market, not discovering new one

**Why feature positioning before cost analysis?**
- Cannot estimate costs without knowing what features to build
- Competitor research informs what features matter
- Avoids wasting time costing features we will not build

**Why cost analysis and architecture together?**
- Tech choices directly affect cost (serverless vs servers, AWS vs GCP)
- Cost constraints affect tech decisions (cannot use expensive ML if margins too thin)
- POC validates both technical feasibility and unit economics
- Must keep costs in mind when selecting tech stack

**Why final positioning after cost analysis?**
- Cannot set pricing without knowing unit economics
- Features alone insufficient - must know if margins work
- Pricing strategy depends on cost structure

**Why lightweight validation before MVP build?**
- Tests switching demand without full product
- Validates pricing assumptions with real customers
- Kill switch: avoid building if validation fails
- Fast and cheap (weeks, not months)

**Why customer contact in two phases?**
- Phase 3: Validate willingness to switch and pay (small sample, cheap)
- Phase 5: Validate product execution with working product

---

## Key Principles

**Fast Follower Strategy**
- Market demand pre-validated by competitors
- Copy proven features, compete on execution (speed, simplicity, cost)
- Validate switching incentives, not product-market fit

**Validation Gates**
- Each document has clear exit criteria
- Cannot proceed to next phase without passing gate

**Lightweight and Lean**
- Minimal validation before building
- Phase 3: High-level architecture and POC only for critical path, not full prototype
- Phase 6: Detailed architecture only after validation passes
- Timeline [TBD in respective docs]

**Kill Criteria**
- If Phase 5 validation fails, pivot or stop
- Criteria [TBD in 5_*.md docs]

---

## Document Lifecycle

1. Create when you reach that checkpoint
2. Complete validation gate before moving to next doc
3. Update as you learn (living documents)
4. Archive to `/archive/` if invalidated

---

## Next Action

Complete `1_competitive_landscape.md` - study existing solutions and identify switching signals.
