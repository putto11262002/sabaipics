# Slideshow Editor -- Design Document

## Core Architecture

### Block Registry Pattern

Every block type is a self-contained definition registered in a central `Map<string, BlockDefinition>`. A definition declares what the block is, how it renders, and how it's configured:

```
BlockDefinition {
  type           -- unique string key
  label          -- display name
  icon           -- toolbar icon
  defaultProps   -- initial prop values
  defaultSize?   -- default dimensions { width: number, height: number } in viewport %
  Renderer       -- React component (renders the real thing)
  SettingsPanel  -- React component (sidebar config UI)
  acceptsChildren? -- true for layout blocks
  childOnly?       -- true for atom blocks (can only exist as children of layout blocks)
}
```

The `defaultSize` field defines default dimensions for blocks (e.g., gallery defaults to 80vw × 60vh). Without explicit size, absolutely positioned blocks size to their content (logo, event-name, subtitle).

Adding a new block type = one folder with 3 files (index, renderer, settings) + one `register()` call.

### Block Categories

| Category   | Can be top-level | Has children | Examples                                |
|------------|------------------|--------------|-----------------------------------------|
| Layout     | Yes              | Yes          | `flex`                                  |
| Standalone | Yes              | No           | `gallery`, `qr`, `logo`, `event-name`, `subtitle` |
| Atom       | No (child only) | No           | `stat-card`, `social-icon` |

**Nesting is capped at 1 level.** Layout blocks can contain atom blocks or standalone blocks. Layout blocks cannot contain other layout blocks. This is a deliberate constraint to avoid page-builder complexity.

### Wire Format

`SlideshowConfig` is stored as JSONB in the database. The client types match API exactly:

```ts
SlideshowConfig {
  theme: { primary: string, background: string }
  blocks: SlideshowBlock[]
}

SlideshowBlock {
  id: string
  type: string        -- maps to registry key
  enabled: boolean
  props: Record<string, any>  -- loose at wire level, typed within block defs
  children?: SlideshowBlock[]
  position?: { x: number, y: number }  -- percentage-based (0-100) for canvas positioning
  size?: { width: number, height: number }  -- viewport percentage (0-100) for block dimensions
}
```

**Canvas Positioning**: Blocks use absolute positioning with percentage-based coordinates. `x` and `y` represent the block's center point as a percentage of the canvas (0-100). Blocks are centered on this point using `transform: translate(-50%, -50%)`.

**Responsive Sizing**: The `size` field uses viewport percentages (vw/vh units) to ensure blocks scale proportionally across different screen sizes. Gallery blocks default to 80vw × 60vh.

### Rendering Model

Each block has ONE `Renderer` component. It is the source of truth for how the block looks. Used by:
- **Preview page (Live mode)**: Blocks positioned absolutely on canvas using `position.x` and `position.y` percentages. Gallery self-fetches via public API when `liveMode: true`.
- **Editor canvas (Editor mode)**: Iframe embeds the preview page with `?mode=editor` query. Blocks are draggable via native pointer events. Hover shows blue outline, selection shows purple ring, dragging reduces opacity to 50%.

**Canvas Layout**: All blocks use `position: absolute` with percentage-based coordinates. The canvas is `fixed inset-0` (full viewport). Blocks are centered on their position point using `transform: translate(-50%, -50%)`.

**Layering**: Gallery blocks have `z-index: 0` (background layer), all other blocks have `z-index: 1` (foreground layer). This ensures photos always appear behind text, QR codes, and other UI elements.

**Iframe Communication**: The editor and iframe communicate via `postMessage`:
- Editor sends: `slideshow-config` (config + context + selectedBlockId)
- Iframe sends: `config-updated` (after drag ends), `block-selected` (on click)

### Editor Performance Optimization

**Placeholder Rendering** (`liveMode: false`):
- **Gallery block**: Shows skeleton placeholders only (no photo fetching or image rendering)
- **Logo block**: Shows "LOGO" text placeholder instead of loading actual logo image
- **Context data**: Editor sets `liveMode: false` and `photos: []` to prevent expensive API calls

**Why placeholders**:
- Image loading/decoding is expensive and slows down editor responsiveness
- Skeleton UI provides sufficient visual feedback for layout positioning
- Real images only load on preview page (`liveMode: true`) where they're needed

**Performance impact**:
- Editor loads instantly (no network requests for images)
- Drag operations maintain 60 FPS with no image-related overhead
- Memory usage stays low (no image buffers in editor)

### Theme Injection

Blocks do NOT receive theme as a prop. Theme is injected as CSS custom properties on a shell wrapper div via `buildThemeCssVars()`. This generates OKLCH-based overrides for all shadcn/ui design tokens (background, foreground, primary, muted, border, ring, etc.). Blocks use semantic Tailwind classes (`text-primary`, `bg-muted`) and pick up theme automatically.

### SlideshowContext

Renderers receive real data through `SlideshowContext`:

```ts
SlideshowContext {
  event: { id, name, subtitle, logoUrl }
  stats: { photoCount, searchCount, downloadCount }
  photos: Array<{ id, previewUrl, width, height }>
  liveMode?: boolean
}
```

In editor, context is built from event record with zeroed stats and empty photos. On preview page, `liveMode: true` signals renderers to fetch live data from public APIs.

## Editor Internals

### Selection

`selectedBlockId: string | null` can reference either a top-level block or a child. Block lookup is recursive (`findBlock` walks the tree). Sidebar shows "back to parent" button when a child is selected.

### Canvas Drag-and-Drop

Blocks are dragged using **native pointer events** (not dnd-kit for canvas positioning):

**Drag Flow**:
1. `pointerDown` → Capture pointer, store start position and canvas bounds
2. `pointerMove` → Calculate pixel delta, convert to percentage, update position immediately via `setConfig`
3. `pointerUp` → Release pointer, send final config to parent via postMessage

**Key Features**:
- **Pointer capture**: `setPointerCapture(e.pointerId)` ensures drag continues even if cursor leaves block
- **Real-time updates**: Position updates on every pointer move (no transform delays)
- **Percentage conversion**: `deltaX / canvasWidth * 100` converts pixel movement to responsive percentages
- **Boundary clamping**: Position clamped to 0-100% range
- **Functional setState**: Uses `setConfig(prev => ...)` to avoid stale closures

**Visual Feedback**:
- Hover: Blue outline (`outline-2 outline-blue-400`)
- Selected: Purple ring (`ring-2 ring-primary`)
- Dragging: 50% opacity, `cursor: move`

**Note**: dnd-kit is still used for sortable lists (flex block children reordering) but not for canvas positioning.

### Grid Snapping System

The editor provides visual grid lines and automatic edge-based snapping for precise block positioning:

**Grid Configuration**:
- **Grid size**: 5vmin intervals (21×21 grid lines covering 0-100vmin)
- **Snap threshold**: 2vmin (blocks snap when edge is within 2vmin of any grid line)
- **Visual feedback**: Grid overlay visible during drag (`GridOverlay` component with `bg-primary/20` lines)

**Square Grid with vmin**:
Grid uses `vmin` (minimum viewport dimension) for both axes to ensure perfectly square cells on any aspect ratio:
- `5vmin` horizontally = `5vmin` vertically (always square)
- Position stored as viewport percentages (0-100%) for responsive scaling
- Coordinate conversion functions translate between viewport % and vmin % during snap

**Edge-Based Snapping Algorithm** (in `preview.tsx:79-141`):
1. Convert block center position from viewport % to vmin %
2. Calculate all 4 edges in vmin coordinates (left, right, top, bottom)
3. For each edge, find nearest grid line (multiple of 5vmin)
4. If edge within 2vmin threshold, snap that edge to grid line
5. Adjust center position based on snapped edge(s)
6. Convert adjusted center back to viewport % for storage

**Dimension Priority**:
To snap edges correctly, algorithm needs block dimensions:
1. **Text blocks** (event-name, subtitle): Measure DOM with `getBoundingClientRect()` during drag
2. **Logo block**: Extract from `props.width` (square aspect ratio)
3. **Gallery block**: Use `block.size` field (explicit dimensions)

This approach eliminates center-snapping for text blocks that dynamically size to content.

### Iframe-Based Editor Canvas

The editor embeds the preview page in an iframe with `?mode=editor` query parameter for true WYSIWYG editing:

**Benefits**:
- **Style isolation**: Editor chrome doesn't bleed into preview
- **True preview**: What you see in the editor is exactly what displays on the TV
- **Independent state**: Iframe can update positions optimistically without waiting for parent

**Communication Flow**:
```
Parent Editor                    Iframe Preview
     │                                 │
     │─────── slideshow-config ───────>│  (config, context, selectedBlockId)
     │                                 │
     │<────── config-updated ──────────│  (after drag ends)
     │                                 │
     │<────── block-selected ──────────│  (on click/canvas click)
```

**Optimistic Updates**: The iframe updates its local config state immediately during drag (functional setState), then sends the final config to parent on drag end. This eliminates rubber band effects and provides smooth real-time feedback.

### Flex Block Props

```ts
FlexProps {
  direction: 'row' | 'column';
  align: 'start' | 'center' | 'end';
  justify: 'start' | 'center' | 'end' | 'between';
  gap: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  padding: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  wrap: boolean;
}
```

`gap` and `padding` are now `SpacingSize` tokens mapping to Tailwind classes. Settings panels use `Select` dropdowns instead of `Slider` inputs.

### Block Presets

The "Add Block" dropdown in `toolbar.tsx` is split into two sections:
- **Blocks**: Flex, Gallery, QR, Logo, Event Name, Subtitle (all top-level standalone blocks)
- **Presets**: Event Info, Stats Row, Social Links (pre-built flex layouts with children)

Each preset is a factory function returning a pre-built flex block with children using `createBlockWithChildren()` helper:

**Example - Stats Row preset:**
```ts
createBlockWithChildren('flex', [
  createBlockWithProps('stat-card', { metric: 'photos' }),
  createBlockWithProps('stat-card', { metric: 'searches' }),
  createBlockWithProps('stat-card', { metric: 'downloads' }),
])
```

### Social Icon URL Field

`SocialIconProps` now includes `url: string` for profile links. The renderer wraps the icon in an `<a>` tag when URL is set.

### Spacing/Padding Class Maps

Defined in `lib/spacing.ts`:
- `gapClass`: Maps `SpacingSize` tokens to Tailwind gap classes
- `paddingClass`: Maps `SpacingSize` tokens to Tailwind padding classes

## Current State

### What's Built

- Block registry with 8 block types (flex, logo, event-name, subtitle, gallery, qr, stat-card, social-icon)
- 14 renderer components (one per block type + flex layout wrapper + child block wrapper)
- 5 block setting panels (one per block type)
- Canvas component with nested DnD support
- Sidebar component with parent/child selection and "back to parent" button
- Toolbar with split dropdown (blocks vs presets)
- Theme settings using integrated color picker component
- 3 template presets using `createBlockWithChildren()` and `createBlock()`

### File Structure

```
slideshow/
  index.tsx                    # Main editor (manages config state, CRUD ops, templates)
  preview.tsx                  # Full-screen preview (uses public APIs, liveMode)
  types.ts                     # API-aligned types, SlideshowContext, all prop interfaces
  hooks/
    useContainerSize.ts        # ResizeObserver-based container measurement
    usePublicSlideshow.ts      # Fetches event info, config, stats from public API
    useSlideshowPhotos.ts      # Fetches photo feed from public API
  lib/
    color-utils.ts          # OKLCH color pipeline, theme CSS vars generator
    templates.ts           # 3 preset factories (event-info, stats-row, social-links)
    spacing.ts              # Gap/padding class maps to Tailwind tokens
    presets.ts              # Preset factory functions
  components/
    iframe-canvas.tsx         # Iframe wrapper for preview (postMessage communication)
    sidebar.tsx              # Sidebar with block settings
    toolbar.tsx              # Toolbar with add block and presets
    theme-settings.tsx        # Theme colors (uses ColorPicker)
  blocks/
    registry.ts             # BlockDefinition map + helpers
    flex/
      index.ts             # Flex block definition
      renderer.tsx           # Flex container + child rendering
      settings.tsx           # Direction/align/justify/gap/padding, child list, DnD
    logo/
      index.ts             # Logo standalone block definition
      renderer.tsx           # Square logo or "LOGO" text placeholder
      settings.tsx           # Size control (width only, always square)
    event-name/
      index.ts             # Event name standalone block definition
      renderer.tsx           # Text with font size + weight
      settings.tsx           # Font size + weight selects
    subtitle/
      index.ts             # Subtitle standalone block definition
      renderer.tsx           # Text with font size + weight
      settings.tsx           # Font size + weight selects
    gallery/
      index.ts, renderer.tsx, settings.tsx  # Standalone gallery block (unchanged)
    qr/
      index.ts, renderer.tsx, settings.tsx  # Standalone QR block (unchanged)
    stat-card/
      index.ts             # Stat card atom definition
      renderer.tsx           # Shows value from context
      settings.tsx           # Metric select
    social-icon/
      index.ts             # Social icon atom definition
      renderer.tsx           # Icon or link
      settings.tsx           # Platform select + URL input
```

## Performance Optimizations

### Memoization Strategy
- **`GalleryRenderer`**: Wrapped with `React.memo`, grid calculations memoized with `useMemo`
- **`DraggableBlock`**: Memoized to prevent re-renders when other blocks update
- **`BlockRenderer`**: Separate memoized component prevents unnecessary re-renders
- **Grid calculations**: Expensive column/row math only runs when dimensions change
- **Style objects**: Memoized to avoid object recreation on every render

### ResizeObserver Batching
`useContainerSize` hook batches size updates using `requestAnimationFrame` and ignores sub-pixel changes (< 1px tolerance) to reduce re-render frequency.

### Drag Performance
Native pointer events provide 50-60 FPS during drag (vs 8-10 FPS with dnd-kit), with position updates using functional setState to avoid stale closures.

## Known Issues / Pending Work

- Gallery block `gap` is still a raw pixel number (inconsistent with new spacing tokens)
- Z-index is hardcoded (gallery: 0, others: 1) - could be made configurable per block

## Design Decisions & Constraints

### 1-Level Nesting Cap

Deliberate constraint. Layout blocks can only contain atom blocks. Layout blocks cannot contain other layout blocks. This prevents unbounded page-builder complexity. Could be relaxed later but keeps system simple and maintainable for now.

### Why Single Renderer

One component per block type serves as the "source of truth" for rendering. The same `Renderer` is used by:
- **Public page**: Direct render, no editor chrome
- **Editor canvas**: Wrapped in `BlockWrapper` for drag/select, plus nested DnD for children inside flex

This eliminates duplication. Block authors write rendering logic once. Different contexts (editor vs public) determine whether editor chrome (wrappers) is applied.

### Why SlideshowContext Instead of Passing Props

Renderers need access to event data, stats, photos. Passing as individual props to every Renderer would require:
- Header renderer needs `event` object
- Gallery renderer needs `photos` array
- Stats renderer needs `stats` object

`SlideshowContext` aggregates this data and passes it down. Renderers read what they need via `context.event.name`, `context.photos`, etc.

This makes the `Renderer` signature stable and clean. Adding a new data field (e.g., adding `downloadUrl` to stats) requires updating one interface.

### Why Layout-Invisible Wrappers

`BlockWrapper` and `ChildBlockWrapper` use `outline` for selection, not `border` or `ring` that affect layout. They use `opacity` and `position: absolute` for visual state (disabled, dragging) which don't impact the rendered element's position in the flow.

`outline` is used because it doesn't add space to the box. The wrapper's dimensions come from the rendered content (via `ref={setNodeRef}` from useSortable).

### Why Presets in Toolbar

Presets are a UX convenience, not a core data concern. The `createBlockWithChildren()` helper makes adding complex layouts (event-info, stats-row) a one-click operation for photographers. It doesn't affect the data model or API contract.

### Why SpacingSize Tokens

Instead of arbitrary pixel values for gap/padding, we use named tokens (`'sm'`, `'md'`, `'lg'`) that map to Tailwind classes (`gap-2`, `gap-4`, `gap-6`). This is more maintainable, easier to read, and aligned with Tailwind's design system.

### Gap as Named Token

Currently `FlexProps.gap` is `SpacingSize`, which is required. This allows us to add `"gap: 'none'"` as a valid option to remove gap entirely.

### Color Picker Integration

The theme settings panel uses a shared `ColorPicker` component from `@sabaipics/uiv3/components/color-picker`. This provides HSV controls, eye dropper, and hex input. It replaces the native color input approach from the initial implementation.

### Why Native Pointer Events for Canvas Drag

We use native pointer events instead of dnd-kit for canvas dragging because:

1. **Direct positioning**: Absolute positioned blocks need direct `left`/`top` updates, not CSS transforms
2. **Percentage conversion**: Easier to convert pixel deltas to percentage on every move
3. **No transform conflicts**: Avoids compounding transforms (centering + drag)
4. **Better performance**: 6-7x FPS improvement (60 FPS vs 8-10 FPS with dnd-kit)
5. **Simpler code**: No library overhead, ~50 lines of vanilla JS
6. **No rubber band**: Position updates immediately during drag, not just at end

dnd-kit is still used for sortable lists (reordering flex block children) where its features (drop zones, collision detection) are beneficial.

### Logo Always Square

Logo blocks enforce a 1:1 aspect ratio (`aspectRatio: '1'` in CSS). The `width` prop controls the size, and height is automatically equal to width. This constraint:
- Simplifies logo rendering (no separate height control needed)
- Ensures consistent visual appearance across different logo uploads
- Makes grid snapping simpler (only need to track one dimension in props)
