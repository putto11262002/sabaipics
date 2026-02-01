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
      padding: 'sm',
      wrap: true,
    },
  );
  socialFlex.enabled = false;

  return {
    theme: { primary: '#0f172a', background: '#ffffff' },
    layout: {
      gap: 'md',
      padding: 'md',
      align: 'start',
      maxWidth: 'none',
    },
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
          padding: 'lg',
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
          padding: 'md',
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

export const DEFAULT_CONFIG: SlideshowConfig = buildClassic();
