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
  Renderer       -- React component (renders the real thing)
  SettingsPanel  -- React component (sidebar config UI)
  acceptsChildren? -- true for layout blocks
  childOnly?       -- true for atom blocks (can't be top-level)
}
```

Adding a new block type = one folder with 3 files (index, renderer, settings) + one `register()` call.

### Block Categories

| Category   | Can be top-level | Has children | Examples                                |
|------------|------------------|--------------|-----------------------------------------|
| Layout     | Yes              | Yes          | `flex`                                  |
| Standalone | Yes              | No           | `gallery`, `qr`                         |
| Atom       | No (child only) | No           | `logo`, `event-name`, `subtitle`, `stat-card`, `social-icon` |

**Nesting is capped at 1 level.** Layout blocks contain atom blocks. Layout blocks cannot contain other layout blocks. This is a deliberate constraint to avoid page-builder complexity.

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
}
```

### Rendering Model

Each block has ONE `Renderer` component. It is the source of truth for how the block looks. Used by:
- **Preview page**: Renders `Renderer` directly. No wrappers, no editor chrome. Gallery self-fetches via public API when `liveMode: true`.
- **Editor canvas**: Wraps `Renderer` in `BlockWrapper` (top-level) or `ChildBlockWrapper` (for children inside flex blocks). Adds drag handles, selection outlines, disabled opacity.

The wrappers are **layout-invisible**. They use `outline` for selection (not border - no layout impact), `opacity` for state, and `position: absolute` for drag handles. Renderers receive `context` containing real data.

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

### Nested Drag-and-Drop

Two DnD layers using `@dnd-kit`:

1. **Top-level**: `DndContext` in `Canvas` -- reorders top-level blocks (vertical list)
2. **Child-level**: Separate `DndContext` per layout block in `BlockWrapper.LayoutBlockContent` -- reorders children within a flex container. Uses `useId()` for unique context IDs to avoid parent-child conflicts.

Click targeting:
- Child click: `ChildBlockWrapper` calls `e.stopPropagation()` so it doesn't bubble to parent
- Parent selection: `LayoutBlockContent.onClick` + `stopPropagation()` selects parent flex block
- Canvas background: deselects all

Flex blocks switch sorting strategy between `horizontalListSortingStrategy` and `verticalListSortingStrategy` based on `direction`.

### Layout Block Canvas Rendering

For layout blocks, `BlockWrapper` does NOT render the block's `Renderer`. Instead, it renders a flex container itself and wraps each child in a `ChildBlockWrapper` with nested `DndContext` + `SortableContext`.

The flex CSS classes are mirror-identical between `BlockWrapper` (which wraps top-level flex blocks) and `FlexRenderer` (used by public page). Both use shared `gapClass` and `paddingClass` maps from `lib/spacing.ts`.

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
- **Blocks**: Flex, Gallery, QR (top-level types only)
- **Presets**: Event Info, Stats Row, Social Links

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
    canvas.tsx              # Canvas with nested DnD
    sidebar.tsx              # Sidebar with parent selection
    toolbar.tsx              # Toolbar with presets
    theme-settings.tsx        # Theme colors (uses ColorPicker)
    block-wrapper.tsx         # Top-level sortable wrapper (outline, opacity, drag)
    child-block-wrapper.tsx  # Sortable+clickable wrapper for children
  blocks/
    registry.ts             # BlockDefinition map + helpers
    flex/
      index.ts             # Flex block definition
      renderer.tsx           # Flex container + child rendering
      settings.tsx           # Direction/align/justify/gap/padding, child list, DnD
    logo/
      index.ts             # Logo atom definition
      renderer.tsx           # Logo or placeholder circle
      settings.tsx           # Size + shape controls
    event-name/
      index.ts             # Event name atom definition
      renderer.tsx           # Text with font size
      settings.tsx           # Font size select
    subtitle/
      index.ts             # Subtitle atom definition
      renderer.tsx           # Text with font size
      settings.tsx           # Font size select
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

## Known Issues / Pending Work

- Gallery block `gap` is still a raw pixel number (inconsistent with new spacing tokens)

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
