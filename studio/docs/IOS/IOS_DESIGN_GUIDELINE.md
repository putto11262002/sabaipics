# iOS Design Guideline

Living design guideline for FrameFast iOS Studio. Derived from the latest implemented views (MainTabView, CameraConnectFlow, CaptureStatusBarView, ManufacturerPickerSheet, etc.).

> **Migration note**: The app previously used a custom `Color.Theme.*` token system modeled after the web shadcn/ui theme. We are migrating toward native iOS patterns. This document captures the target state.

## Typography

All text uses **Apple system fonts** — no custom typefaces. Prefer Dynamic Type presets over explicit sizes for accessibility.

### Text hierarchy

| Level | Font | Usage |
|---|---|---|
| Page title | `.largeTitle.weight(.bold)` | Manual large titles outside NavigationStack (e.g., "Cameras" header) |
| Section title | `.title3.weight(.semibold)` | Empty-state hero titles, sheet section headings |
| Card icon | `.title2` | Leading icons in card rows (manufacturer picker, upload mode) |
| Primary text | `.body` | List row labels, event names, camera names |
| Emphasized text | `.subheadline.weight(.semibold)` | Status bar camera name, toolbar badges, card titles |
| Body text | `.subheadline` | Card descriptions, info row labels, general body copy |
| Caption | `.caption` | File metadata, timestamps, card subtitles |
| Small label | `.caption2.weight(.semibold)` | Badges (e.g., manufacturer badge) |

### Icon sizing (explicit)

Use `.system(size:weight:)` only for icons that need pixel-precise sizing:

| Size | Weight | Usage |
|---|---|---|
| `14` | `.semibold` | Toolbar dismiss `xmark`, toolbar back `chevron.left`, status icons |
| `12` | `.semibold` | Status bar close button, list row chevrons |
| `15` | — | Session info row icons |
| `18` | `.semibold` | Add button `plus` icon |
| `48–60` | — | Large empty-state icons |

### Rules

- Prefer Dynamic Type presets (`.headline`, `.subheadline`, `.caption`, `.body`) over `.system(size:)` for text
- Use `.system(size:weight:)` only for SF Symbol icons at specific pixel sizes
- Weight modifiers go on the preset: `.subheadline.weight(.semibold)`, not `.font(.system(size: 15, weight: .semibold))`
- Line limits: `.lineLimit(1)` + `.truncationMode(.tail)` for any text that could overflow (status bar, list rows)
