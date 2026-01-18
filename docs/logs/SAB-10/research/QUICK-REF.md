# Quick Reference Card: SAB-10 QR Code Research

Print this for quick reference during decision meetings.

---

## Decision at a Glance

**RECOMMENDED:** Option D (Hybrid) - Score: 34/40

- Display: Client-side with `react-qr-code` (14.5 KB)
- Download: Server endpoint for high-res PNG
- Timeline: 5-7 days
- Risk: Low

---

## Library Comparison

| Library | Bundle | Output | Performance | Best For |
|---------|--------|--------|-------------|----------|
| **react-qr-code** ⭐ | 14.5 KB | SVG | 2-5ms | Responsive display |
| qrcode.react | 47.8 KB | Canvas | 5-15ms | All-in-one solution |
| qrcode | 48.3 KB | Multi | 5-15ms | Maximum flexibility |
| @juit/qrcode | 15-20 KB | PNG | 5-10ms | Server-side |

---

## Options Summary

### Option A: Server Multi-Size
- **Bundle:** 0 KB
- **Score:** 33/40
- **Best:** Offline support, instant load
- **Trade-off:** Storage cost, limited dynamic sizing

### Option B: qrcode.react (Canvas)
- **Bundle:** +47.8 KB
- **Score:** 25/40
- **Best:** Fastest implementation
- **Trade-off:** Large bundle, 10x size increase

### Option C: react-qr-code (Pure Client)
- **Bundle:** +14.5 KB
- **Score:** 27/40
- **Best:** Minimal bundle, native responsive
- **Trade-off:** Complex download handling

### Option D: Hybrid ⭐
- **Bundle:** +14.5 KB
- **Score:** 34/40
- **Best:** Progressive enhancement, best UX
- **Trade-off:** Initial complexity

---

## Implementation Commands

### Install react-qr-code
```bash
pnpm --filter=@sabaipics/dashboard add react-qr-code
```

### Database Migration (Phase 3)
```sql
ALTER TABLE events ALTER COLUMN qr_code_r2_key DROP NOT NULL;
```

### Create Download Endpoint
```typescript
// apps/api/src/routes/events/qr-download.ts
export const qrDownloadRouter = new Hono<Env>()
  .get('/events/:id/qr-download', requirePhotographer(), async (c) => {
    // Generate high-res PNG (1200px)
    const qrPng = await generateEventQR(accessCode, baseUrl, { scale: 20 });
    return c.body(qrPng, 200, {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${event.name}-QR.png"`
    });
  });
```

### Display Component
```typescript
import ReactQRCode from 'react-qr-code';

<ReactQRCode
  value={`https://sabaipics.com/search/${accessCode}`}
  size={256}
  level="M"
  style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
/>
```

---

## Current File Locations

```
Server:
├── apps/api/src/lib/qr/generate.ts (QR generation)
├── apps/api/src/routes/events/index.ts (API routes)
└── packages/db/src/schema/events.ts (Database schema)

Client:
└── apps/dashboard/src/components/events/EventQRDisplay.tsx (Display)

Research:
└── docs/logs/SAB-10/research/ (This directory)
    ├── 00-START-HERE.md (Navigation)
    ├── client-side-qr-generation.md (Full report)
    ├── code-examples.md (Code snippets)
    ├── decision-matrix.md (Comparison)
    └── README.md (Summary)
```

---

## Performance Benchmarks

### Generation Time (400x400)
- Server (cached): <1ms
- react-qr-code: 2-5ms
- qrcode.react: 5-15ms

### Bundle Impact
- Current dashboard: ~500 KB
- react-qr-code: +14.5 KB (3%)
- qrcode.react: +47.8 KB (10%)

### Storage Cost (Option A)
- Current: ~4 KB/event
- Multi-size: ~16 KB/event
- 1,000 events: ~16 MB total

---

## Decision Checklist

- [ ] Bundle +14.5 KB acceptable?
- [ ] Server download endpoint OK?
- [ ] 5-7 day timeline works?
- [ ] Progressive enhancement desired?

**If all YES → Proceed with Option D**

---

## Phased Implementation

### Week 1: Foundation
- [ ] Install `react-qr-code`
- [ ] Create client-side display component
- [ ] Create server download endpoint
- [ ] Update tests

### Week 2: Integration
- [ ] Update EventQRDisplay component
- [ ] Add feature flag for A/B testing
- [ ] Deploy to staging
- [ ] Monitor performance

### Week 3: Cleanup
- [ ] Remove eager server generation
- [ ] Make qrCodeR2Key nullable
- [ ] Remove unused code
- [ ] Update documentation

---

## Success Metrics

- Client generation < 10ms (95th percentile)
- Download success rate > 99%
- No increase in support tickets
- Bundle increase < 20 KB
- User satisfaction maintained

---

## Rollback Plan

If issues arise:
1. Disable client-side QR via feature flag
2. Revert to server-side generation
3. Keep download endpoint (useful regardless)
4. Investigate and fix issues
5. Retry client-side rollout

---

## Key Contacts

- **Lead Developer:** [Assign implementation]
- **Tech Lead:** [Approve architecture]
- **Product:** [Confirm requirements]
- **QA:** [Test across devices]

---

## Quick Links

- **Full Research:** `client-side-qr-generation.md`
- **Code Examples:** `code-examples.md`
- **Decision Details:** `decision-matrix.md`
- **Navigation:** `00-START-HERE.md`

---

**Print Date:** 2026-01-18  
**Version:** 1.0  
**Status:** Ready for Decision
