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

function buildClassic(): SlideshowConfig {
  const socialFlex = createBlockWithChildren(
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
      padding: 'none',
      wrap: true,
    },
  );
  socialFlex.enabled = false;

  return {
    theme: { primary: '#0f172a', background: '#ffffff' },
    blocks: [
      // Header section
      createBlockWithChildren(
        'flex',
        [createBlock('logo'), createBlock('event-name'), createBlock('subtitle')],
        {
          direction: 'column',
          align: 'center',
          justify: 'center',
          gap: 'sm',
          padding: 'none',
          wrap: false,
        },
      ),
      // Gallery
      createBlock('gallery'),
      // Stats section
      createBlockWithChildren(
        'flex',
        [
          createBlock('stat-card'),
          createBlockWithProps('stat-card', { metric: 'searches' }),
          createBlockWithProps('stat-card', { metric: 'downloads' }),
        ],
        {
          direction: 'row',
          align: 'center',
          justify: 'center',
          gap: 'lg',
          padding: 'none',
          wrap: true,
        },
      ),
      // QR
      createBlock('qr'),
      // Social section (disabled)
      socialFlex,
    ],
  };
}

function buildGallery(): SlideshowConfig {
  const statsFlex = createBlockWithChildren(
    'flex',
    [createBlock('stat-card'), createBlockWithProps('stat-card', { metric: 'searches' })],
    {
      direction: 'row',
      align: 'center',
      justify: 'center',
      gap: 'lg',
      padding: 'none',
      wrap: true,
    },
  );
  statsFlex.enabled = false;

  const socialFlex = createBlockWithChildren(
    'flex',
    [createBlockWithProps('social-icon', { platform: 'instagram', url: '' })],
    {
      direction: 'row',
      align: 'center',
      justify: 'center',
      gap: 'md',
      padding: 'none',
      wrap: true,
    },
  );
  socialFlex.enabled = false;

  return {
    theme: { primary: '#10b981', background: '#0f172a' },
    blocks: [
      // Header section (left aligned, no logo)
      createBlockWithChildren('flex', [createBlock('event-name'), createBlock('subtitle')], {
        direction: 'column',
        align: 'start',
        justify: 'start',
        gap: 'xs',
        padding: 'none',
        wrap: false,
      }),
      // Gallery with 4 columns
      createBlockWithProps('gallery', { columns: 4, gap: 8, autoplaySpeed: 0 }),
      // Small QR
      createBlockWithProps('qr', { size: 'sm', label: 'Find your photos' }),
      // Stats (disabled)
      statsFlex,
      // Social (disabled)
      socialFlex,
    ],
  };
}

function buildMinimal(): SlideshowConfig {
  const statsFlex = createBlockWithChildren('flex', [createBlock('stat-card')], {
    direction: 'row',
    align: 'center',
    justify: 'center',
    gap: 'lg',
    padding: 'none',
    wrap: true,
  });
  statsFlex.enabled = false;

  const qr = createBlock('qr');
  qr.enabled = false;

  const socialFlex = createBlockWithChildren(
    'flex',
    [createBlockWithProps('social-icon', { platform: 'instagram', url: '' })],
    {
      direction: 'row',
      align: 'center',
      justify: 'center',
      gap: 'md',
      padding: 'none',
      wrap: true,
    },
  );
  socialFlex.enabled = false;

  return {
    theme: { primary: '#f59e0b', background: '#fafafa' },
    blocks: [
      // Header section (no logo)
      createBlockWithChildren('flex', [createBlock('event-name'), createBlock('subtitle')], {
        direction: 'column',
        align: 'center',
        justify: 'center',
        gap: 'sm',
        padding: 'none',
        wrap: false,
      }),
      // Gallery
      createBlock('gallery'),
      // Stats (disabled)
      statsFlex,
      // QR (disabled)
      qr,
      // Social (disabled)
      socialFlex,
    ],
  };
}

export function getTemplate(key: string): SlideshowConfig {
  switch (key) {
    case 'gallery':
      return buildGallery();
    case 'minimal':
      return buildMinimal();
    case 'classic':
    default:
      return buildClassic();
  }
}

export const DEFAULT_CONFIG: SlideshowConfig = getTemplate('classic');
