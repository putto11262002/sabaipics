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
  const socialLinks = createBlockWithProps('social-links', {
    variant: 'horizontal-icons',
    links: [
      { platform: 'instagram', url: '' },
      { platform: 'facebook', url: '' },
    ],
  });
  socialLinks.enabled = false;

  return {
    theme: { primary: '#0f172a', background: '#ffffff' },
    layout: {
      gap: 'md',
      padding: 'md',
      align: 'start',
      maxWidth: 'none',
    },
    blocks: [
      // Event Header - Logo + name + subtitle
      createBlockWithProps('event-header', {
        showLogo: true,
        showName: true,
        showSubtitle: true,
        showQr: false,
        logoSize: 'md',
        qrSize: 'md',
        direction: 'column',
        align: 'center',
        justify: 'center',
        gap: 'sm',
      }),
      // Gallery
      createBlock('gallery'),
      // Stats Panel
      createBlockWithProps('stats-panel', {
        variant: 'cards',
        metrics: ['photos', 'searches', 'downloads'],
      }),
      // QR Code
      createBlock('qr'),
      // Social Links (disabled by default)
      socialLinks,
    ],
  };
}

export const DEFAULT_CONFIG: SlideshowConfig = buildClassic();
