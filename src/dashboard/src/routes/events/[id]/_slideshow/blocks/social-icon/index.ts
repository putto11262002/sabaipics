import { Share2 } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { SocialIconProps } from '../../types';
import { SocialIconRenderer } from './renderer';
import { SocialIconSettings } from './settings';

export const socialIconBlockDef: BlockDefinition<SocialIconProps> = {
  type: 'social-icon',
  label: 'Social Icon',
  icon: Share2,
  defaultProps: {
    platform: 'instagram',
    url: '',
  },
  Renderer: SocialIconRenderer,
  SettingsPanel: SocialIconSettings,
  childOnly: true,
  hidden: true, // Internal use only
};
