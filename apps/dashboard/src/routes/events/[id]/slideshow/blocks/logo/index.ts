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
    width: 20,
  },
  // No defaultSize - logo should size to content
  Renderer: LogoRenderer,
  SettingsPanel: LogoSettings,
};
