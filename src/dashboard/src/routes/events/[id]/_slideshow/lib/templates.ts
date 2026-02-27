import type { SlideshowConfig, SlideshowBlock } from '../types';
import { createBlock } from '../blocks/registry';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function createBlockWithProps(
  type: string,
  propsOverride: Record<string, any>,
): SlideshowBlock {
  const block = createBlock(type);
  block.props = { ...block.props, ...propsOverride };
  return block;
}

export function createBlockWithChildren(
  type: string,
  children: SlideshowBlock[],
  propsOverride?: Record<string, any>,
): SlideshowBlock {
  const block = createBlock(type);
  block.children = children;
  if (propsOverride) block.props = { ...block.props, ...propsOverride };
  return block;
}

// ─── Templates ────────────────────────────────────────────────────────────────

// Template 1: Classic - Traditional, clean, professional (landscape)
function buildClassicCentered(): SlideshowConfig {
  return {
    theme: { primary: '#0f172a', background: '#ffffff' },
    layout: {
      gap: 'lg',
      padding: 'lg',
      align: 'center',
      maxWidth: 'none',
    },
    blocks: [
      // Event Name + Subtitle centered
      createBlockWithChildren('flex', [createBlock('event-name'), createBlock('subtitle')], {
        direction: 'column',
        align: 'center',
        justify: 'center',
        gap: 'xs',
        padding: 'none',
        wrap: false,
      }),
      // Social links (placeholders - will add URL fields to event later)
      createBlockWithChildren(
        'flex',
        [
          createBlockWithProps('social-icon', { platform: 'instagram', url: '' }),
          createBlockWithProps('social-icon', { platform: 'facebook', url: '' }),
        ],
        {
          direction: 'row',
          align: 'center',
          justify: 'center',
          gap: 'sm',
          padding: 'none',
          wrap: false,
        },
      ),
      // QR Code
      createBlockWithProps('qr', { size: 'md', label: 'Scan to find your photos' }),
      // Gallery
      createBlock('gallery'),
    ],
  };
}

// Template 2: Classic Portrait - Classic layout for portrait orientation
function buildClassicPortrait(): SlideshowConfig {
  return {
    theme: { primary: '#0f172a', background: '#ffffff' },
    layout: {
      gap: 'lg',
      padding: 'lg',
      align: 'center',
      maxWidth: 'none',
    },
    blocks: [
      // Event Name + Subtitle centered
      createBlockWithChildren('flex', [createBlock('event-name'), createBlock('subtitle')], {
        direction: 'column',
        align: 'center',
        justify: 'center',
        gap: 'xs',
        padding: 'none',
        wrap: false,
      }),
      // Social links
      createBlockWithChildren(
        'flex',
        [
          createBlockWithProps('social-icon', { platform: 'instagram', url: '' }),
          createBlockWithProps('social-icon', { platform: 'facebook', url: '' }),
        ],
        {
          direction: 'row',
          align: 'center',
          justify: 'center',
          gap: 'sm',
          padding: 'none',
          wrap: false,
        },
      ),
      // QR Code
      createBlockWithProps('qr', { size: 'md', label: 'Scan to find your photos' }),
      // Gallery - more rows for portrait
      createBlockWithProps('gallery', { rows: 5 }),
    ],
  };
}

// Template 3: Minimal - Clean and minimal (landscape)
function buildMinimal(): SlideshowConfig {
  return {
    theme: { primary: '#0f172a', background: '#ffffff' },
    layout: {
      gap: 'xl',
      padding: 'xl',
      align: 'center',
      maxWidth: 'lg',
    },
    blocks: [
      // Event Name centered
      createBlockWithChildren('flex', [createBlock('event-name')], {
        direction: 'column',
        align: 'center',
        justify: 'center',
        gap: 'none',
        padding: 'none',
        wrap: false,
      }),
      // Social links
      createBlockWithChildren(
        'flex',
        [
          createBlockWithProps('social-icon', { platform: 'instagram', url: '' }),
          createBlockWithProps('social-icon', { platform: 'facebook', url: '' }),
        ],
        {
          direction: 'row',
          align: 'center',
          justify: 'center',
          gap: 'sm',
          padding: 'none',
          wrap: false,
        },
      ),
      // QR Code
      createBlockWithProps('qr', { size: 'md', label: 'Scan to search' }),
      // Gallery - sparse density for larger images, 2 rows
      createBlockWithProps('gallery', { density: 'sparse', rows: 2 }),
    ],
  };
}

// Template 4: Minimal Portrait - Minimal layout for portrait orientation
function buildMinimalPortrait(): SlideshowConfig {
  return {
    theme: { primary: '#0f172a', background: '#ffffff' },
    layout: {
      gap: 'xl',
      padding: 'xl',
      align: 'center',
      maxWidth: 'lg',
    },
    blocks: [
      // Event Name centered
      createBlockWithChildren('flex', [createBlock('event-name')], {
        direction: 'column',
        align: 'center',
        justify: 'center',
        gap: 'none',
        padding: 'none',
        wrap: false,
      }),
      // Social links
      createBlockWithChildren(
        'flex',
        [
          createBlockWithProps('social-icon', { platform: 'instagram', url: '' }),
          createBlockWithProps('social-icon', { platform: 'facebook', url: '' }),
        ],
        {
          direction: 'row',
          align: 'center',
          justify: 'center',
          gap: 'sm',
          padding: 'none',
          wrap: false,
        },
      ),
      // QR Code
      createBlockWithProps('qr', { size: 'md', label: 'Scan to search' }),
      // Gallery - sparse density, more rows for portrait
      createBlockWithProps('gallery', { density: 'sparse', rows: 4 }),
    ],
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const TEMPLATES = {
  classic: buildClassicCentered,
  'classic-portrait': buildClassicPortrait,
  minimal: buildMinimal,
  'minimal-portrait': buildMinimalPortrait,
} as const;

export type TemplateId = keyof typeof TEMPLATES;

export const DEFAULT_CONFIG: SlideshowConfig = buildClassicCentered();
