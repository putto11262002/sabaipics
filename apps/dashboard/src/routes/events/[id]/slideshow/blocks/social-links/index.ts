import { Share2 } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { SocialLinksProps } from '../../types';
import { SocialLinksRenderer } from './renderer';
import { SocialLinksSettings } from './settings';

export const socialLinksBlockDef: BlockDefinition<SocialLinksProps> = {
  type: 'social-links',
  label: 'Social Links',
  icon: Share2,
  defaultProps: {
    variant: 'horizontal-icons',
    links: [
      { platform: 'instagram', url: '' },
      { platform: 'facebook', url: '' },
    ],
  },
  Renderer: SocialLinksRenderer,
  SettingsPanel: SocialLinksSettings,
  composite: true,
};
