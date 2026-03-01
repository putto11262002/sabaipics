# Slideshow Editor -- Design Document

## Overview

The slideshow editor is a **public event page builder** for photographers to:

- Display on screens at events (TV/monitor in fullscreen)
- Share with participants as an event landing page (mobile/tablet/desktop)

It's essentially a **website builder** with drag-and-drop blocks, optimized for event use cases.

## Core Architecture

### Layout Model

**Vertical flex stacking** at the root level with optional horizontal layouts via Flex blocks:

```
Page (vertical stack)
├─ Flex (direction: row)      ← Hero: logo + name + subtitle side-by-side
│   ├─ Logo
│   └─ Flex (direction: column)
│       ├─ Event Name
│       └─ Subtitle
├─ Gallery                    ← Photo grid
├─ Flex (direction: row)      ← Stats row
│   ├─ Stat Card (photos)
│   ├─ Stat Card (searches)
│   └─ Stat Card (downloads)
├─ QR Code
└─ Flex (direction: row)      ← Social links
    ├─ Social Icon
    └─ Social Icon
```

**Responsive by default**: Blocks flow naturally using flexbox. Works on mobile, tablet, desktop, and TV.

### Block Registry Pattern

Every block type is a self-contained definition registered in a central `Map<string, BlockDefinition>`:

```ts
BlockDefinition {
  type           // unique string key
  label          // display name
  icon           // toolbar icon
  defaultProps   // initial prop values
  Renderer       // React component (renders the actual block)
  SettingsPanel  // React component (sidebar config UI)
  acceptsChildren? // true for layout blocks
  childOnly?       // true for atom blocks (can only exist inside layouts)
}
```

Adding a new block type = one folder with 3 files (index, renderer, settings) + one `register()` call.

### Block Categories

| Category   | Can be top-level | Has children | Examples                                          |
| ---------- | ---------------- | ------------ | ------------------------------------------------- |
| Layout     | Yes              | Yes          | `flex`                                            |
| Standalone | Yes              | No           | `gallery`, `qr`, `logo`, `event-name`, `subtitle` |
| Atom       | No (child only)  | No           | `stat-card`, `social-icon`                        |

**Nesting is capped at 1 level.** Layout blocks can contain atom blocks or standalone blocks. Layout blocks cannot contain other layout blocks.

### Wire Format

`SlideshowConfig` is stored as JSONB in the database:

```ts
SlideshowConfig {
  theme: { primary: string, background: string }
  blocks: SlideshowBlock[]
}

SlideshowBlock {
  id: string
  type: string        // maps to registry key
  enabled: boolean
  props: Record<string, any>
  children?: SlideshowBlock[]
}
```

Block order in the array determines display order (top-level blocks stack vertically).

## Editor Internals

### Drag-and-Drop

The editor uses **dnd-kit** for block reordering:

- **Top-level blocks**: Vertical sortable list (drag to reorder)
- **Child blocks in flex**: Horizontal or vertical sortable depending on flex direction
- **Visual feedback**: Blue outline on hover, selection highlight on click, 50% opacity during drag

The editor embeds the preview page in an **iframe** with `?mode=editor` query parameter:

```
Parent Editor                    Iframe Preview
     │                                 │
     │─────── slideshow-config ───────>│  (config, context, selectedBlockId)
     │                                 │
     │<────── config-updated ──────────│  (after reorder)
     │                                 │
     │<────── block-selected ──────────│  (on click)
```

### Selection

`selectedBlockId: string | null` can reference either a top-level block or a child. Block lookup is recursive. Sidebar shows "back to parent" button when a child is selected.

### Device Preview

The iframe supports device preview modes for testing responsive behavior:

- **Desktop**: 1920×1080 (16:9 TV)
- **Tablet**: 1024×768 (4:3 landscape)
- **Mobile**: 1080×1920 (9:16 portrait)

Preview scales proportionally to fit the editor container.

### Theme Injection

Blocks don't receive theme as a prop. Theme is injected as CSS custom properties via `buildThemeCssVars()`. This generates OKLCH-based overrides for all shadcn/ui design tokens. Blocks use semantic Tailwind classes (`text-primary`, `bg-muted`) and pick up theme automatically.

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

In editor, context has zeroed stats and empty photos. On public page, `liveMode: true` signals renderers to fetch live data from public APIs.

### Editor Performance

**Placeholder Rendering** (`liveMode: false`):

- Gallery shows skeleton placeholders (no photo fetching)
- Logo shows "LOGO" text placeholder
- Context has `photos: []` to prevent expensive API calls

This keeps the editor fast and responsive.

## Block Types

### Flex Block

Container block with configurable layout:

```ts
FlexProps {
  direction: 'row' | 'column'
  align: 'start' | 'center' | 'end'
  justify: 'start' | 'center' | 'end' | 'between'
  gap: SpacingSize     // 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  padding: SpacingSize
  wrap: boolean
}
```

### Gallery Block

Responsive photo grid that fills its container:

```ts
GalleryProps {
  density: 'sparse' | 'normal' | 'dense'  // controls column count
  gap: number
  autoplaySpeed: number
}
```

Uses `useContainerSize` to measure container and calculate optimal grid dimensions.

### Other Blocks

- **Logo**: Square image with configurable width
- **Event Name**: Text with font size/weight options
- **Subtitle**: Text with font size/weight options
- **QR Code**: Links to event search page
- **Stat Card**: Shows photo/search/download counts
- **Social Icon**: Platform icon with optional link

## File Structure

```
slideshow/
  index.tsx                    # Main editor (manages config state, CRUD ops)
  preview.tsx                  # Preview page (editor mode + live mode)
  types.ts                     # Types: SlideshowConfig, SlideshowContext, props
  hooks/
    useContainerSize.ts        # ResizeObserver-based container measurement
    usePublicSlideshow.ts      # Fetches event info, config, stats
    useSlideshowPhotos.ts      # Fetches photo feed
  lib/
    color-utils.ts             # OKLCH color pipeline, theme CSS vars
    templates.ts               # Default config template
    spacing.ts                 # Gap/padding class maps
    presets.ts                 # Preset factory functions
  components/
    iframe-canvas.tsx          # Iframe wrapper with device preview scaling
    sidebar.tsx                # Block settings sidebar
    toolbar.tsx                # Add block dropdown, save button
    theme-settings.tsx         # Theme color pickers
    canvas.tsx                 # Legacy canvas component (unused)
    block-wrapper.tsx          # Legacy wrapper (unused)
    child-block-wrapper.tsx    # Legacy wrapper (unused)
  blocks/
    registry.ts                # BlockDefinition map + helpers
    flex/                      # Flex layout block
    logo/                      # Logo block
    event-name/                # Event name text block
    subtitle/                  # Subtitle text block
    gallery/                   # Photo gallery block
    qr/                        # QR code block
    stat-card/                 # Stats display block
    social-icon/               # Social media icon block
```

## Design Decisions

### Why Flex Layout (Not Absolute Positioning)

1. **Responsive by default**: Flexbox adapts to any screen size
2. **Simple mental model**: "Blocks stack top-to-bottom, use Flex for side-by-side"
3. **Familiar UX**: Similar to Notion, WordPress Gutenberg, etc.
4. **Less code**: dnd-kit handles all drag/drop complexity

### Why 1-Level Nesting Cap

Prevents unbounded page-builder complexity. Layout blocks can contain atoms, but layouts cannot contain other layouts. Keeps the system simple and maintainable.

### Why Presets

Presets are UX convenience, not core data. `createBlockWithChildren()` makes adding complex layouts (event-info, stats-row) a one-click operation.

### Why SpacingSize Tokens

Named tokens (`'sm'`, `'md'`, `'lg'`) map to Tailwind classes. More maintainable than arbitrary pixel values, aligned with design system.

### Why Iframe for Preview

- **Style isolation**: Editor chrome doesn't affect preview styles
- **True WYSIWYG**: Preview is exactly what displays on public page
- **Independent state**: Preview can update optimistically during drag
