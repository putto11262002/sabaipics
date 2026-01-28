import { Image } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { LogoProps } from '../../types';
import { LogoRenderer } from './renderer';
import { LogoSettings } from './settings';

export const logoBlockDef: BlockDefinition<LogoProps> = {
  type: 'logo',
  label: 'Logo',
  icon: Image,
  defaultProps: {
    size: 48,
    shape: 'circle',
  },
  Renderer: LogoRenderer,
  SettingsPanel: LogoSettings,
  childOnly: true,
};
