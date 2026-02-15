# iOS Studio Theme

Design system for iOS Studio, matching the web shadcn/ui theme.

## Overview

The iOS app uses a color system that mirrors the web `packages/ui/src/styles/globals.css` shadcn/ui variables. Colors auto-adapt to light/dark mode.

## Colors

Colors are defined in Asset Catalog (`Assets.xcassets/Colors/`) and accessed via `Color.Theme.*`:

```swift
// Backgrounds
Color.Theme.background      // Main background
Color.Theme.card            // Card background
Color.Theme.muted           // Secondary background
Color.Theme.accent          // Accent background
Color.Theme.input           // Input field background

// Foregrounds (Text)
Color.Theme.foreground      // Primary text
Color.Theme.cardForeground  // Card text
Color.Theme.mutedForeground // Secondary text
Color.Theme.accentForeground

// Brand
Color.Theme.primary         // Primary brand (#343434 neutral gray)
Color.Theme.primaryForeground
Color.Theme.secondary
Color.Theme.secondaryForeground

// Semantic
Color.Theme.destructive     // Error/danger (red)
Color.Theme.destructiveForeground
Color.Theme.border          // Border color
Color.Theme.ring            // Focus ring
```

### Color Values

| Token           | Light     | Dark      |
| --------------- | --------- | --------- |
| background      | `#f8f8f8` | `#0a0a0a` |
| foreground      | `#0a0a0a` | `#fafafa` |
| primary         | `#343434` | `#DEDEDE` |
| muted           | `#eceaec` | `#232123` |
| mutedForeground | `#565457` | `#afadaf` |
| destructive     | `#df2225` | `#ff6467` |
| border          | `#e5e5e5` | `#262626` |

## Button Styles

Reusable button styles matching shadcn/ui:

```swift
// Primary - filled with brand color
Button("Sign in") { }
    .buttonStyle(.primary)

// Secondary - outlined
Button("Cancel") { }
    .buttonStyle(.secondary)

// Ghost - text only
Button("Learn more") { }
    .buttonStyle(.ghost)

// Destructive - red danger
Button("Delete") { }
    .buttonStyle(.destructive)

// Compact - smaller pill button for inline actions
Button("Next") { }
    .buttonStyle(.compact)
```

## Clerk Theme Integration

The Clerk `AuthView` uses our theme colors via `ClerkTheme`:

```swift
ClerkTheme(
    colors: .init(
        primary: Color.Theme.primary,
        background: Color.Theme.background,
        input: Color.Theme.input,
        danger: Color.Theme.destructive,
        foreground: Color.Theme.foreground,
        mutedForeground: Color.Theme.mutedForeground,
        primaryForeground: Color.Theme.primaryForeground,
        muted: Color.Theme.muted,
        border: Color.Theme.border,
        ring: Color.Theme.ring
    ),
    design: .init(borderRadius: 10.0)
)
```

## Syncing with Web

When web theme changes in `packages/ui/src/styles/globals.css`:

1. Convert OKLCH to hex using `culori`:

   ```bash
   cd /tmp && npm install culori
   node -e "const c = require('culori'); console.log(c.formatHex('oklch(0.612 0.113 316.659)'))"
   ```

2. Update Asset Catalog color sets in `Assets.xcassets/Colors/Theme*.colorset/`

3. Each `.colorset/Contents.json` has light/dark variants:
   ```json
   {
     "colors": [
       { "color": { "components": { "red": "0.624", ... } }, "idiom": "universal" },
       { "appearances": [{ "appearance": "luminosity", "value": "dark" }], ... }
     ]
   }
   ```

## Files

```
SabaiPicsStudio/
├── Assets.xcassets/Colors/
│   ├── ThemeBackground.colorset/
│   ├── ThemeForeground.colorset/
│   ├── ThemePrimary.colorset/
│   └── ... (14 color sets)
└── Theme/
    ├── Colors.swift       # Color.Theme.* extension
    └── ButtonStyles.swift # .primary, .secondary, .ghost, .destructive, .compact
```
