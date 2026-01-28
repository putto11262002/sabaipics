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

Adding a new block type = one folder with 3 files (index, renderer, settings) + one `register()` call. Nothing else changes.

### Block Categories

| Category   | Can be top-level | Has children | Examples                                                     |
| ---------- | ---------------- | ------------ | ------------------------------------------------------------ |
| Layout     | Yes              | Yes          | `flex`                                                       |
| Standalone | Yes              | No           | `gallery`, `qr`                                              |
| Atom       | No (child only)  | No           | `logo`, `event-name`, `subtitle`, `stat-card`, `social-icon` |

**Nesting is capped at 1 level.** Layout blocks contain atom blocks. Layout blocks cannot contain other layout blocks. This is a deliberate constraint to avoid page-builder complexity.

### Wire Format

`SlideshowConfig` is stored as JSONB in the database. The client types match the API exactly:

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

Props are `Record<string, any>` at the wire level. Each block definition casts to its own typed interface internally (e.g. `block.props as FlexProps`). This keeps the config schema extensible without breaking serialization.

## Rendering Model

### Single Renderer, Two Contexts

Each block has ONE `Renderer` component. It is the source of truth for how the block looks.

- **Public page**: renders `Renderer` directly. No wrappers, no editor chrome.
- **Editor canvas**: wraps `Renderer` in `BlockWrapper` (top-level blocks) or `ChildBlockWrapper` (children inside layout blocks). These wrappers add selection, drag-and-drop, and visual indicators.

The wrappers are **layout-invisible**. They use `outline` for selection (not border -- outline doesn't affect layout), `opacity` for disabled/dragging state, and `position: absolute` for drag handles. The Renderer's output is pixel-identical in both contexts.

### Theme Injection

Blocks do NOT receive theme as a prop. Theme is injected as CSS custom properties on a shell wrapper div via `buildThemeCssVars()`. This generates OKLCH-based overrides for all shadcn/ui design tokens (background, foreground, primary, muted, border, etc.). Blocks use semantic Tailwind classes (`text-primary`, `bg-muted`) and pick up the theme automatically.

### SlideshowContext

Renderers receive real data through `SlideshowContext`:

```ts
SlideshowContext {
  event: { id, name, subtitle, logoUrl }
  stats: { photoCount, searchCount, downloadCount }
  photos: Array<{ id, previewUrl, width, height }>
}
```

In the editor, context is built from the event record with zeroed stats and empty photos. On the public page, context is built from the API response. Same components, different data.

## Editor Internals

### Selection

`selectedBlockId: string | null` -- can reference either a top-level block or a child. Block lookup is recursive (`findBlock` walks the tree). `findParentBlock` returns the parent when a child is selected so the sidebar can show "back to parent".

### Nested Drag-and-Drop

Two DnD layers using `@dnd-kit`:

1. **Top-level**: `DndContext` in `Canvas` -- reorders top-level blocks (vertical list).
2. **Child-level**: Separate `DndContext` per layout block in `BlockWrapper` -- reorders children within a flex container. Uses `useId()` for unique context IDs to avoid conflicts. Strategy switches between `horizontalListSortingStrategy` and `verticalListSortingStrategy` based on flex direction.

### Click Targeting

Layout blocks contain clickable children. Click routing:

- Child click: `ChildBlockWrapper.onClick` fires, calls `stopPropagation()`, selects child.
- Flex gap/padding click: bubbles to `LayoutBlockContent.onClick`, selects parent layout block.
- Canvas background click: deselects all.

`stopPropagation` is the mechanism that separates child selection from parent selection.

### Layout Block Canvas Rendering

For layout blocks, `BlockWrapper` does NOT delegate to the block's `Renderer`. Instead, it renders the flex container itself with nested `SortableContext` + `ChildBlockWrapper` per child. This is necessary because the `Renderer` is pure (no DnD, no selection) -- the editor needs to inject interactive wrappers around each child.

The flex CSS classes in `BlockWrapper.LayoutBlockContent` must mirror `FlexRenderer` exactly. Both use the shared `gapClass` and `paddingClass` maps from `lib/spacing.ts`.

## Flags and Constraints

### Duplicated flex rendering logic

`FlexRenderer` (used by public page) and `LayoutBlockContent` in `BlockWrapper` (used by editor) both render the same flex container. The CSS class logic is duplicated. If flex layout props change, both must be updated. Consider extracting a shared `buildFlexClasses(props)` utility.

### Block ID generation

`createBlock()` uses `${type}-${Date.now()}-${counter}`. This is fine for client-side editing but IDs are persisted to the database. If two users create blocks in the same millisecond (unlikely but possible in theory), IDs could collide. Not a real concern for single-user editor but worth noting.

### No API integration yet

The editor initializes from a hardcoded default config and save is a no-op toast. Loading from API (`GET /events/:id/slideshow-config`) and saving (`PUT /events/:id/slideshow-config`) via TanStack Query hooks is pending.

### No public page renderer yet

The `Renderer` components exist and are the correct rendering path for the public page. But no public slideshow page exists yet. When built (in `apps/event`), it needs access to the block registry or a copy of the renderer components.

### Gallery block `gap` is still a number

`FlexProps.gap` uses `SpacingSize` tokens. `GalleryProps.gap` is still a raw pixel number. Consider aligning these for consistency.

### Presets are UI sugar

Presets (Event Info, Stats Row, Social Links) are factory functions that return pre-built flex blocks with children. They are not a separate concept in the data model -- the result is a normal `SlideshowBlock` with `children`. Templates (classic, gallery, minimal) use the same factories.
