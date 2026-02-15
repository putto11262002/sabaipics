import { LayoutList, BarChart3, Share2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SlideshowBlock } from '../types';
import { createBlock } from '../blocks/registry';

export interface BlockPreset {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  create: () => SlideshowBlock;
}

export const blockPresets: BlockPreset[] = [
  {
    key: 'event-info',
    label: 'Event Info',
    icon: LayoutList,
    description: 'Logo, name and subtitle',
    create: () => {
      const block = createBlock('flex');
      block.props = {
        direction: 'column',
        align: 'center',
        justify: 'center',
        gap: 'sm',
        padding: 'md',
        wrap: false,
      };
      block.children = [createBlock('logo'), createBlock('event-name'), createBlock('subtitle')];
      return block;
    },
  },
  {
    key: 'stats-row',
    label: 'Stats Row',
    icon: BarChart3,
    description: 'Photo, search and download counts',
    create: () => {
      const block = createBlock('flex');
      block.props = {
        direction: 'row',
        align: 'center',
        justify: 'center',
        gap: 'lg',
        padding: 'md',
        wrap: true,
      };
      const photos = createBlock('stat-card');
      const searches = createBlock('stat-card');
      searches.props = { ...searches.props, metric: 'searches' };
      const downloads = createBlock('stat-card');
      downloads.props = { ...downloads.props, metric: 'downloads' };
      block.children = [photos, searches, downloads];
      return block;
    },
  },
  {
    key: 'social-links',
    label: 'Social Links',
    icon: Share2,
    description: 'Social media icons',
    create: () => {
      const block = createBlock('flex');
      block.props = {
        direction: 'row',
        align: 'center',
        justify: 'center',
        gap: 'md',
        padding: 'sm',
        wrap: true,
      };
      const ig = createBlock('social-icon');
      ig.props = { platform: 'instagram', url: '' };
      const fb = createBlock('social-icon');
      fb.props = { platform: 'facebook', url: '' };
      const tt = createBlock('social-icon');
      tt.props = { platform: 'tiktok', url: '' };
      block.children = [ig, fb, tt];
      return block;
    },
  },
];
