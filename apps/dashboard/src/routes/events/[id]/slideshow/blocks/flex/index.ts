import { Columns3 } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { FlexProps } from '../../types';
import { FlexRenderer } from './renderer';
import { FlexSettings } from './settings';

export const flexBlockDef: BlockDefinition<FlexProps> = {
  type: 'flex',
  label: 'Flex Container',
  icon: Columns3,
  defaultProps: {
    direction: 'column',
    align: 'center',
    justify: 'start',
    gap: 'md',
    padding: 'none',
    wrap: false,
  },
  Renderer: FlexRenderer,
  SettingsPanel: FlexSettings,
  acceptsChildren: true,
};
