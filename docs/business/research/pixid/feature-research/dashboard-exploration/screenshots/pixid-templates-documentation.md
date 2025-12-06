# Pixid Templates Feature Research

## Overview
Pixid offers two types of template functionality that serve different purposes:
1. **Gallery Presets** - Pre-designed gallery layouts and themes
2. **Templates** - Custom frame and watermark templates for branding

## 1. Gallery Presets

### Available Presets
Pixid provides four pre-designed gallery presets:

1. **Midnight** - Dark theme gallery preset
2. **Cube** - Modern geometric layout preset
3. **Gatsby** - Elegant/classic gallery preset
4. **Sunrise** - Light theme gallery preset

### Functionality
- **Preview**: Each preset offers a "ดูตัวอย่าง" (View Preview) option to see the gallery in action
- **Clone**: Users can "โคลน" (Clone) any preset to use as a starting point for their own galleries
- **Pre-built Design**: Each preset comes with complete styling, layout, and visual design

### Access Restrictions
- Preview galleries appear to require authentication or higher-tier plans
- Free accounts may be limited to cloning presets without accessing live previews

## 2. Templates Management

### Purpose
The Templates section focuses on **frame and watermark templates** rather than gallery layouts. This is for branding individual photos with custom frames, borders, and watermarks.

### Template Configuration Options

The template management system includes:

- **Template Name** (ชื่อ) - Custom naming for templates
- **Horizontal Frame** (กรอบแนวนอน) - Frame settings for landscape orientation
- **Image Size** (ขนาดภาพ) - Size specifications for horizontal images
- **Vertical Frame** (กรอบแนวตั้ง) - Frame settings for portrait orientation
- **Vertical Image Size** (ขนาดภาพแนวตั้ง) - Size specifications for portrait images

### Template Management Features
- **Create New Template** (เทมเพลตใหม่) - Button to create custom frame templates
- **Edit** (แก้ไข) - Modify existing template settings
- **Delete** (ลบ) - Remove templates
- **Search** (ค้นหา...) - Filter and find specific templates
- **Pagination** - Handle multiple templates efficiently

### Template ID System
- Each template gets a unique numerical ID (e.g., #999)
- Creation and update timestamps are tracked
- Templates can be managed individually

## Access and Availability

### Free Account Limitations
- Templates management section appears to redirect to Adjustments for free users
- Gallery Presets are accessible but preview functionality may be limited
- Template creation may require paid plans

### Paid Plan Features
Based on the pricing structure observed:
- **Standard Plan (฿299/14 days)**: Basic Frame & Watermark functionality
- **Pro Plan (฿499/31 days)**: Custom Gallery + Frame & Watermark
- **Ultra Plans (฿699-฿1,290)**: Premium features including advanced templates

## Key Differentiators from Competitors

### Gallery Presets Approach
- **Pre-built Themes**: Ready-to-use gallery designs vs. competitor's customization-heavy approach
- **Clone Function**: Easy duplication and modification of existing designs
- **Theme-based**: Named presets (Midnight, Cube, Gatsby, Sunrise) suggest design philosophies

### Frame Template Focus
- **Separation of Concerns**: Gallery layout (Presets) vs. Photo branding (Templates)
- **Dual Orientation Support**: Specific settings for horizontal and vertical images
- **Size Management**: Built-in image size specifications for each orientation

## Technical Insights

### URL Structure
- Gallery Presets: `/projects/gallery-presets`
- Templates Management: `/templates`
- Preview Galleries: `/g/preset_[name]` format

### User Experience
- Thai language interface suggests target market focus
- Visual thumbnail previews for gallery presets
- Table-based management for frame templates
- One-click cloning for rapid deployment

## Potential Limitations

### Accessibility
- Template management appears restricted for free tier users
- Preview functionality requires authentication or higher plans
- Template creation workflow not fully accessible

### Customization
- Limited to pre-designed gallery presets (only 4 options observed)
- Frame template configuration details not fully accessible
- No evidence of advanced customization beyond basic frame settings

## Integration with Other Features

### Connection to Core Workflow
- Templates integrate with:
  - Projects for applying to specific events
  - Gallery Presets for consistent branding
  - Adjustments for photo enhancement workflow
  - FTP upload for automated processing

### Branding Ecosystem
- Templates work alongside:
  - Custom Gallery features (Pro plan)
  - Frame & Watermark functionality (all paid plans)
  - Master Project Settings for consistent application

---

**Screenshot References:**
- Gallery Presets Overview: `pixid-templates.png`
- Templates Management Interface: `pixid-templates-management.png`