---
paths:
  - "studio/**/*.swift"
---

# iOS UI Guidelines

Living design guideline for FrameFast iOS Studio. Use **native iOS patterns** only.

## Typography

All text uses **Apple system fonts**. Prefer Dynamic Type presets over explicit sizes.

| Level | Font | Usage |
|-------|------|-------|
| Page title | `.largeTitle.weight(.bold)` | Manual large titles outside NavigationStack |
| Section title | `.title3.weight(.semibold)` | Empty-state hero, sheet section headings |
| Card icon | `.title2` | Leading icons in card rows |
| Primary text | `.body` | List row labels, event/camera names |
| Emphasized | `.subheadline.weight(.semibold)` | Status bar, toolbar badges, card titles |
| Body text | `.subheadline` | Card descriptions, info row labels |
| Caption | `.caption` | File metadata, timestamps, subtitles |
| Small label | `.caption2.weight(.semibold)` | Badges |

## Icon Sizing

Use `.system(size:weight:)` only for icons needing pixel-precise sizing:

| Size | Weight | Usage |
|------|--------|-------|
| `14` | `.semibold` | Toolbar dismiss `xmark`, back `chevron.left` |
| `12` | `.semibold` | List row chevrons, status bar close |
| `18` | `.semibold` | Add button `plus` icon |
| `48-60` | — | Large empty-state icons |

## Colors (Native)

Use **native iOS semantic colors** — no custom theme tokens.

### Foreground/Text

| Color | Usage |
|-------|-------|
| `Color.primary` | Primary text |
| `Color.secondary` | Muted text, captions, subtitles |
| `Color.accentColor` | Interactive icons, buttons, links |
| `Color.red` | Destructive actions (Sign Out, Delete) |
| `Color.green` | Success states |
| `Color.white` | Text on accent/dark backgrounds |

### Background

| Pattern | Usage |
|---------|-------|
| `Color.accentColor` | Primary button backgrounds |
| `Color.accentColor.opacity(0.1)` | Subtle icon backgrounds, tints |
| `Color.secondary.opacity(0.1)` | Card/section backgrounds |
| `Color(uiColor: .systemGroupedBackground)` | Form/list backgrounds (iOS native) |

## Rules

- Prefer Dynamic Type presets (`.headline`, `.subheadline`, `.caption`) over `.system(size:)` for **text**
- Use `.system(size:weight:)` only for **SF Symbol icons**
- Weight modifiers go on preset: `.subheadline.weight(.semibold)`
- Line limits: `.lineLimit(1)` + `.truncationMode(.tail)` for overflow text
- Always use native semantic colors (`Color.primary`, `Color.secondary`, `Color.accentColor`)
