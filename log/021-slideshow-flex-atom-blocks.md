# 021 – Slideshow Editor: Flex Layout + Atom Blocks Refactor

## Summary

Refactored the slideshow editor from flat monolithic blocks (header, stats, social) to a composable flex-layout + atom-block architecture. Layout blocks (`flex`) render flex containers with atom children. Atom blocks (`logo`, `event-name`, `subtitle`, `stat-card`, `social-icon`) are child-only and compose inside flex containers. Standalone blocks (`gallery`, `qr`) remain unchanged.

## Changes

### New block types

| Type          | Kind                             | Description                                                        |
| ------------- | -------------------------------- | ------------------------------------------------------------------ |
| `flex`        | layout (`acceptsChildren: true`) | Configurable flex container (direction, align, justify, gap, wrap) |
| `logo`        | atom (`childOnly: true`)         | Event logo with size/shape options                                 |
| `event-name`  | atom (`childOnly: true`)         | Event name text with font size                                     |
| `subtitle`    | atom (`childOnly: true`)         | Event subtitle text with font size                                 |
| `stat-card`   | atom (`childOnly: true`)         | Single stat metric card (photos/downloads/searches)                |
| `social-icon` | atom (`childOnly: true`)         | Single social platform icon                                        |

### Removed block types

- `header` → replaced by `flex` + `logo` + `event-name` + `subtitle`
- `stats` → replaced by `flex` + `stat-card` children
- `social` → replaced by `flex` + `social-icon` children

### Files created (18)

- `blocks/flex/{index,renderer,settings}.{ts,tsx}`
- `blocks/logo/{index,renderer,settings}.{ts,tsx}`
- `blocks/event-name/{index,renderer,settings}.{ts,tsx}`
- `blocks/subtitle/{index,renderer,settings}.{ts,tsx}`
- `blocks/stat-card/{index,renderer,settings}.{ts,tsx}`
- `blocks/social-icon/{index,renderer,settings}.{ts,tsx}`

### Files deleted (9)

- `blocks/header/{index,renderer,settings}.{ts,tsx}`
- `blocks/stats/{index,renderer,settings}.{ts,tsx}`
- `blocks/social/{index,renderer,settings}.{ts,tsx}`

### Files modified (8)

- `types.ts` – new `BlockType` union, new prop interfaces (`FlexProps`, `LogoProps`, `EventNameProps`, `SubtitleProps`, `StatCardProps`, `SocialIconProps`), removed old prop interfaces
- `blocks/registry.ts` – added `childOnly` to `BlockDefinition`, added `getTopLevelTypes()` / `getChildTypes()` helpers, registered new blocks, removed old registrations
- `components/canvas.tsx` – child selection via `data-block-id` attribute detection on click, `isChildSelected` prop for highlighting parent when child selected
- `components/block-wrapper.tsx` – updated `onSelect` signature to include mouse event for child detection, `isChildSelected` prop
- `components/sidebar.tsx` – added `parentBlock` + `onSelectBlock` props, "Back to parent" button when viewing child block settings
- `components/toolbar.tsx` – uses `getTopLevelTypes()` instead of all registered types
- `index.tsx` – recursive `findBlock`/`findParentBlock`/`updateBlockInTree`/`toggleBlockInTree`/`deleteBlockFromTree` helpers for nested block operations
- `lib/templates.ts` – rewrote all three templates (classic/gallery/minimal) using flex + atom composition, added `createBlockWithProps` and `createBlockWithChildren` helpers

### Key design decisions

1. **Flex renderer owns child rendering** – uses `data-block-id` wrapper divs on each child for editor click detection
2. **Canvas detects child clicks** – walks up from click target to find nearest `data-block-id`, selects child if found inside a top-level block
3. **Flex settings panel manages children** – add/remove/reorder children via `@dnd-kit/sortable` in the settings panel
4. **One level nesting only** – layout blocks cannot contain other layout blocks
