# Slideshow Layout Pivot Plan

## Context

We're considering pivoting from the **current absolute positioning approach** back to a **flex-based layout approach** similar to commit `c3b170a`.

---

## Approach Comparison

### Current: Absolute Positioning (Canvas-based)

**Implementation:** (since commit `bb8371c`)
```tsx
// All blocks positioned absolutely with x/y coordinates
<div className="fixed inset-0"> {/* Full viewport canvas */}
  {blocks.map(block => (
    <div
      style={{
        position: 'absolute',
        left: `${block.position.x}%`,
        top: `${block.position.y}%`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <BlockRenderer block={block} />
    </div>
  ))}
</div>
```

**Data Model:**
```ts
SlideshowBlock {
  id: string
  type: string
  enabled: boolean
  props: Record<string, any>
  children?: SlideshowBlock[]
  position?: { x: number, y: number }  // 0-100 (percentage)
  size?: { width: number, height: number }  // viewport % for explicit sizing
}
```

**Pros:**
- ✅ **Complete freedom**: Blocks can be placed anywhere on canvas
- ✅ **WYSIWYG for TV**: Position blocks exactly where they'll appear on fullscreen TV
- ✅ **No layout constraints**: No need to think about flexbox direction/wrapping
- ✅ **Grid snapping**: Can implement precise alignment with visual grid
- ✅ **Layering control**: z-index allows explicit stacking (gallery behind text)

**Cons:**
- ❌ **Not responsive**: Percentage positioning doesn't adapt well to different aspect ratios
- ❌ **Manual positioning**: Everything requires x/y coordinates (can't auto-flow)
- ❌ **Complex nesting**: Absolute children inside absolute parents is complex
- ❌ **No natural spacing**: Every block needs explicit position, no gaps/padding
- ❌ **Harder to maintain**: More complex drag/drop logic with edge snapping

---

### Previous: Flex Layout (Vertical List)

**Implementation:** (commit `c3b170a`)
```tsx
// Blocks in vertical sortable list
<div className="w-full max-w-3xl bg-background p-6">
  <DndContext onDragEnd={handleReorder}>
    <SortableContext items={blocks} strategy={verticalListSortingStrategy}>
      <div className="space-y-1">
        {blocks.map(block => (
          <BlockWrapper block={block} />
        ))}
      </div>
    </SortableContext>
  </DndContext>
</div>
```

**Data Model:**
```ts
SlideshowBlock {
  id: string
  type: string
  enabled: boolean
  props: Record<string, any>
  children?: SlideshowBlock[]
  // NO position/size fields - layout determined by order + flex props
}
```

**Pros:**
- ✅ **Responsive by default**: Flexbox adapts to container size naturally
- ✅ **Simple reordering**: Drag-and-drop just changes array order
- ✅ **Auto-spacing**: Natural gaps between blocks (`space-y-1`)
- ✅ **Nested layout works**: Flex inside flex is native flexbox behavior
- ✅ **Less code**: Simpler drag/drop logic (dnd-kit does heavy lifting)
- ✅ **Familiar model**: Most photographers understand "top to bottom" stacking

**Cons:**
- ❌ **Limited freedom**: Can only stack vertically (or horizontally with flex-row)
- ❌ **Not WYSIWYG**: Editor shows constrained layout, TV shows fullscreen
- ❌ **No free positioning**: Can't put logo in top-right corner while text is centered
- ❌ **Layering is implicit**: Can't put gallery in background behind all blocks
- ❌ **Constrained by container**: `max-w-3xl` wrapper doesn't match TV aspect

---

## Hybrid Approach: Flex-based with Responsive Zones?

**Idea:** Use flex layout in editor, but allow blocks to declare "zones" or "alignment hints" that map to absolute positions on TV?

```ts
SlideshowBlock {
  id: string
  type: string
  enabled: boolean
  props: Record<string, any>
  layout?: {
    zone: 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom' | 'fullscreen'
    order: number  // for stacking within same zone
  }
}
```

**Editor:** Flex vertical list (easy editing)
**TV Preview:** Absolute positioning based on zone (fullscreen WYSIWYG)

**Challenges:**
- Zone-to-position mapping is arbitrary
- Still limited to predefined zones
- More complex mental model for photographers

---

## Key Questions to Decide

1. **Primary use case:** Do photographers need pixel-perfect TV positioning, or is "roughly top/middle/bottom" enough?

2. **Responsive priority:** Do slideshows need to work on mobile/tablet, or only desktop TVs (16:9)?
   - If only TVs → Absolute positioning is fine
   - If multi-device → Flex layout is safer

3. **Complexity tolerance:** Are photographers comfortable with free-form canvas drag, or prefer simpler "reorder blocks" UX?

4. **Gallery background:** Must gallery always be behind other blocks (requires z-index control)?
   - If yes → Absolute positioning enables this cleanly
   - If no → Flex can work with gallery as first block

5. **Nested layouts:** Do we need flex containers INSIDE the canvas?
   - Current flex block (event-name + subtitle side-by-side) works in both models
   - Absolute model allows positioning flex blocks anywhere on canvas
   - Flex-only model limits to vertical stacking

---

## Recommendation

**If slideshows are TV-only (16:9 fullscreen):**
- ✅ **Keep absolute positioning**
- Add preset positions (top-left, center, etc.) for quick placement
- Improve grid snapping UX (show coordinates, snap to common positions)

**If slideshows need to be responsive (mobile/tablet/desktop):**
- ✅ **Pivot back to flex layout**
- Use flex-direction and justify-content for rough positioning
- Accept that exact positioning isn't possible across devices

**If unsure:**
- ✅ **Prototype both** and user-test with 2-3 photographers
- See which UX model they prefer for building slideshows

---

## Migration Path (if pivoting back to flex)

### Phase 1: Restore Flex Canvas
1. Revert `preview.tsx` and `index.tsx` to use `components/canvas.tsx` (vertical list)
2. Remove `position` and `size` fields from `SlideshowBlock` type
3. Remove grid snapping logic (not needed for list reordering)
4. Restore dnd-kit sortable context for top-level blocks

### Phase 2: Remove Absolute Positioning Code
1. Delete iframe-canvas.tsx (no longer needed)
2. Remove device preview modes (or keep for aspect ratio testing only)
3. Simplify block wrappers (no drag-by-edges logic)

### Phase 3: Update Public Preview
1. Public page uses flex layout (same as editor)
2. Gallery block can be "fullscreen" via `position: fixed` independently
3. Other blocks stack naturally in foreground

### Phase 4: Data Migration
1. Existing configs have `position`/`size` fields
2. Migration: preserve block order, drop position data
3. Or: map position.y to block order (blocks with lower y come first)

---

## Next Steps

1. **Clarify requirements** with user/stakeholders
2. **Decide:** Absolute canvas vs Flex list vs Hybrid zones
3. **If pivoting:** Create feature branch and implement Phase 1
4. **Test:** Build sample slideshow with both approaches, compare UX

---

## Files to Review (if pivoting)

- `apps/dashboard/src/routes/events/[id]/slideshow/components/canvas.tsx` (commit c3b170a)
- `apps/dashboard/src/routes/events/[id]/slideshow/blocks/flex/renderer.tsx` (still exists)
- `apps/dashboard/src/routes/events/[id]/slideshow/DESIGN.md` (commit c3b170a for old architecture)
- `packages/db/src/schema/events.ts` (SlideshowBlock type - remove position/size?)
- `apps/api/src/routes/events/slideshow-schema.ts` (validation - remove position/size?)
