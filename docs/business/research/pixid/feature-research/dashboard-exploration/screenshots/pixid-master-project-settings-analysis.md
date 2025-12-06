# Pixid Master Project Setting Analysis

## Overview
Successfully accessed the Pixid Master Project Setting (ตั้งค่าโปรเจกต์หลัก) at https://www.pixid.app/projects/setting. This section contains global configurations that apply across all projects in a photographer's account.

## Global Settings and Configurations Available

### 1. FTP/Web Uploader Settings (การตั้งค่า FTP/Web Uploader)
- **FTP Project Destination** - Dropdown to select which project receives FTP uploads
  - Currently shows "Test Project for Exploration"
- **File Size (px)** - Image resolution options:
  - ขนาดเต็ม - ไม่ประมวลผล (Full size - no processing)
  - 6048px
  - 4000px
  - 2000px (currently selected)
- **File Quality** - JPEG compression options:
  - ดีที่สุด (100) - Best quality
  - สูงกว่า (80) - Higher than (currently selected)
  - สูง (60) - High
  - มาตรฐาน (40) - Standard
  - พอใช้ (20) - Usable
- **AI Face Recognition** - Toggle for automatic face detection:
  - เปิดใช้งาน (Enable)
  - ปิดใช้งาน (Disable) - Currently selected

### 2. FTP Template Settings (เทมเพลต FTP)
- **Template** - Dropdown to apply pre-configured templates to FTP uploads
  - Options: "ไม่มีเทมเพลต" (No template), "t"

### 3. FTP LUT Settings
- **LUT** - Color grading lookup tables for FTP uploads
  - Options: "No LUT"

### 4. FTP Adjustments Settings (การปรับแต่ง FTP)
- **Adjustments** - Pre-defined adjustments to apply to FTP uploads
  - Options: "ไม่มีการปรับแต่ง" (No adjustments), "g"

### 5. Default Gallery Settings (การตั้งค่าแกลเลอรี่เริ่มต้น)
- **Language** - Default gallery interface language:
  - ไทย (Thai)
  - อังกฤษ (English) - Currently selected
  - จีน (ตัวย่อ) (Chinese Simplified)
  - ลาว (Lao)

### 6. Line OA Settings (การตั้งค่า Line OA)
- **Line User ID** - Text input for LINE Official Account user ID
- **Line Access Token** - Text input for LINE Official Account access token

### 7. Gallery Header Image (รูปส่วนหัวแกลเลอรี่เริ่มต้น)
- **Upload area** for default gallery header image
- **Recommended size**: ≤ 750kb
- Drag and drop or "Browse Files" functionality

### 8. Photographer Logo (โลโก้ช่างภาพ)
- **Upload area** for photographer's logo/watermark
- Drag and drop or "Browse Files" functionality

## Key Insights

### Workflow Integration
- **FTP-First Approach**: Heavy emphasis on FTP uploads as primary workflow
- **Template System**: Supports applying templates, LUTs, and adjustments globally
- **Multi-language Support**: Built-in support for Thai, English, Chinese, and Lao

### Configuration Strategy
- **Global Defaults**: These settings apply to all new projects automatically
- **Quality Control**: Granular control over image size and quality for bandwidth/storage management
- **Brand Consistency**: Header and logo settings ensure consistent branding across galleries

### Technical Capabilities
- **AI Integration**: Toggle for face recognition (currently disabled in free tier)
- **LINE Integration**: Native LINE OA integration for Thai market
- **File Processing**: Built-in image resizing, quality adjustment, and color grading

## Competitive Intelligence

### Strengths
- Comprehensive FTP workflow support
- Template and adjustment system for consistent output
- Multi-language support (especially Thai)
- Direct LINE OA integration

### Limitations
- AI face recognition disabled in free tier
- No advanced branding options beyond header/logo
- Template system appears basic (limited options shown)
- No global watermark positioning options visible

## Screenshot Location
Screenshot saved to: `/Users/putsuthisrisinlpa/Development/sabai/facelink/research/pixid/feature-research/pixid-master-project-settings.png`

## Research Date
November 30, 2025