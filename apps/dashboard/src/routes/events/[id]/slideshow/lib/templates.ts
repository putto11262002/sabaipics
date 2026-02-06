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

// Template 1: Classic Centered - Traditional, clean, professional
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
      createBlockWithChildren(
        'flex',
        [
          createBlock('event-name'),
          createBlock('subtitle'),
        ],
        {
          direction: 'column',
          align: 'center',
          justify: 'center',
          gap: 'xs',
          padding: 'none',
          wrap: false,
        },
      ),
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

// Template 2: Modern Horizontal - Clean, spacious, left-aligned
function buildModernHorizontal(): SlideshowConfig {
  return {
    theme: { primary: '#0f172a', background: '#ffffff' },
    layout: {
      gap: 'xl',
      padding: 'lg',
      align: 'start',
      maxWidth: 'none',
    },
    blocks: [
      // Horizontal header - Logo left, Name/Subtitle right
      createBlockWithChildren(
        'flex',
        [
          createBlockWithProps('logo', { size: 'lg' }),
          createBlockWithChildren(
            'flex',
            [createBlock('event-name'), createBlock('subtitle')],
            {
              direction: 'column',
              align: 'start',
              justify: 'center',
              gap: 'xs',
              padding: 'none',
              wrap: false,
            },
          ),
        ],
        {
          direction: 'row',
          align: 'center',
          justify: 'start',
          gap: 'lg',
          padding: 'md',
          wrap: false,
        },
      ),
      // Gallery
      createBlock('gallery'),
      // QR and Social in horizontal row
      createBlockWithChildren(
        'flex',
        [
          createBlockWithProps('qr', { size: 'sm', label: '' }),
          createBlockWithChildren(
            'flex',
            [
              createBlockWithProps('social-icon', { platform: 'instagram', url: '' }),
              createBlockWithProps('social-icon', { platform: 'facebook', url: '' }),
              createBlockWithProps('social-icon', { platform: 'tiktok', url: '' }),
            ],
            {
              direction: 'row',
              align: 'center',
              justify: 'start',
              gap: 'xs',
              padding: 'none',
              wrap: false,
            },
          ),
        ],
        {
          direction: 'row',
          align: 'center',
          justify: 'between',
          gap: 'md',
          padding: 'md',
          wrap: false,
        },
      ),
    ],
  };
}

// Template 3: Bold Magazine - Eye-catching, dynamic, bold colors
function buildBoldMagazine(): SlideshowConfig {
  return {
    theme: { primary: '#0f172a', background: '#ffffff' },
    layout: {
      gap: 'md',
      padding: 'lg',
      align: 'center',
      maxWidth: 'none',
    },
    blocks: [
      // Large logo centered
      createBlockWithChildren(
        'flex',
        [createBlockWithProps('logo', { size: 'lg' })],
        {
          direction: 'column',
          align: 'center',
          justify: 'center',
          gap: 'none',
          padding: 'sm',
          wrap: false,
        },
      ),
      // Name and subtitle bold
      createBlockWithChildren(
        'flex',
        [createBlock('event-name'), createBlock('subtitle')],
        {
          direction: 'column',
          align: 'center',
          justify: 'center',
          gap: 'xs',
          padding: 'sm',
          wrap: false,
        },
      ),
      // Gallery
      createBlock('gallery'),
      // QR Code
      createBlockWithProps('qr', { size: 'lg', label: 'Find Your Photos' }),
      // Social vertical list (disabled)
      (() => {
        const social = createBlockWithChildren(
          'flex',
          [
            createBlockWithProps('social-icon', { platform: 'instagram', url: '' }),
            createBlockWithProps('social-icon', { platform: 'facebook', url: '' }),
            createBlockWithProps('social-icon', { platform: 'x', url: '' }),
          ],
          {
            direction: 'column',
            align: 'center',
            justify: 'center',
            gap: 'sm',
            padding: 'sm',
            wrap: false,
          },
        );
        social.enabled = false;
        return social;
      })(),
    ],
  };
}

// Template 4: Elegant Minimal - Sophisticated, refined, balanced
function buildElegantMinimal(): SlideshowConfig {
  return {
    theme: { primary: '#0f172a', background: '#ffffff' },
    layout: {
      gap: 'lg',
      padding: 'xl',
      align: 'center',
      maxWidth: 'lg',
    },
    blocks: [
      // Horizontal logo + name header
      createBlockWithChildren(
        'flex',
        [
          createBlockWithProps('logo', { size: 'md' }),
          createBlock('event-name'),
        ],
        {
          direction: 'row',
          align: 'center',
          justify: 'center',
          gap: 'md',
          padding: 'md',
          wrap: false,
        },
      ),
      // Subtitle
      createBlockWithChildren(
        'flex',
        [createBlock('subtitle')],
        {
          direction: 'column',
          align: 'center',
          justify: 'center',
          gap: 'none',
          padding: 'xs',
          wrap: false,
        },
      ),
      // Gallery
      createBlock('gallery'),
      // QR centered with label
      createBlockWithChildren(
        'flex',
        [createBlockWithProps('qr', { size: 'md', label: 'Scan to search' })],
        {
          direction: 'column',
          align: 'center',
          justify: 'center',
          gap: 'none',
          padding: 'md',
          wrap: false,
        },
      ),
      // Social horizontal
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
          gap: 'md',
          padding: 'sm',
          wrap: false,
        },
      ),
    ],
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const TEMPLATES = {
  classic: buildClassicCentered,
  modern: buildModernHorizontal,
  bold: buildBoldMagazine,
  elegant: buildElegantMinimal,
} as const;

export type TemplateId = keyof typeof TEMPLATES;

export const DEFAULT_CONFIG: SlideshowConfig = buildClassicCentered();
