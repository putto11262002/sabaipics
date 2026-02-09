import { LayoutList } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { EventHeaderProps } from '../../types';
import { EventHeaderRenderer } from './renderer';
import { EventHeaderSettings } from './settings';

export const eventHeaderBlockDef: BlockDefinition<EventHeaderProps> = {
  type: 'event-header',
  label: 'Event Header',
  icon: LayoutList,
  defaultProps: {
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
  },
  Renderer: EventHeaderRenderer,
  SettingsPanel: EventHeaderSettings,
  composite: true, // Generates internal block tree
};
