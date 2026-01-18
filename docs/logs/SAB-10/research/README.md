# SAB-10 Research Summary

## Overview
This directory contains technical research for moving QR code generation from server-side to client-side.

## Documents

### 1. client-side-qr-generation.md (Main Research)
**Comprehensive analysis (3,476 words, 1,035 lines)**

**Covers:**
- Decision framework with constraints
- Current implementation analysis
- 4 client-side library options with detailed comparisons
- Performance benchmarks and bundle sizes
- 4 implementation options (A/B/C/D) with pros/cons
- Recommended approach: react-qr-code (14.5 KB) with server-side download fallback
- Complete implementation plan in 3 phases

**Key Findings:**
- **qrcode** (node-qrcode): 48.3 KB, industry standard, Canvas-based
- **qrcode.react**: 47.8 KB, React wrapper, Canvas/SVG modes
- **react-qr-code**: 14.5 KB, SVG-only, smallest bundle
- **@juit/qrcode**: 15-20 KB est., already used server-side

**Performance:** All libraries perform well (2-15ms generation)

**Recommendation:** Use `react-qr-code` for display (responsive SVG) + server endpoint for PNG downloads

## Quick Reference

### Library Comparison

| Library | Bundle | Output | Best For |
|---------|--------|--------|----------|
| qrcode | 48.3 KB | Canvas/Image/SVG | Maximum flexibility |
| qrcode.react | 47.8 KB | React component | React-first teams |
| react-qr-code | 14.5 KB | SVG only | Minimal bundle |
| @juit/qrcode | 15-20 KB | PNG/SVG/PDF | Server-side |

### Implementation Options

**A. Server Multi-Size:** Generate 3-4 sizes on creation
- Pros: No bundle increase, instant load
- Cons: Storage cost, limited dynamic sizing

**B. qrcode.react Client-Side:** Full client generation
- Pros: True dynamic sizing, no storage
- Cons: 47.8 KB bundle, download complexity

**C. react-qr-code Client-Side:** Lightweight SVG
- Pros: 14.5 KB bundle, native responsive
- Cons: SVG only, canvas conversion needed for download

**D. Hybrid (Recommended):** Client display + server download
- Pros: Best balance, progressive enhancement
- Cons: More complex initially

## Decision Checklist

Before implementation, decide:
1. Is bundle size critical? (If yes → react-qr-code)
2. Is offline support required? (If yes → server-side)
3. Download strategy preference? (Server API vs client canvas)
4. Migration timeline? (Big bang vs gradual)

## Next Steps

1. Review `client-side-qr-generation.md` for full analysis
2. Choose implementation option (A/B/C/D)
3. Create implementation task (T-[#])
4. Execute in phases (display → download → cleanup)

## References

- Current server implementation: `apps/api/src/lib/qr/generate.ts`
- Current display component: `apps/dashboard/src/components/events/EventQRDisplay.tsx`
- Database schema: `packages/db/src/schema/events.ts`
