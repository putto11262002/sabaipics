import { Type } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { EventNameProps } from '../../types';
import { EventNameRenderer } from './renderer';
import { EventNameSettings } from './settings';

export const eventNameBlockDef: BlockDefinition<EventNameProps> = {
  type: 'event-name',
  label: 'Event Name',
  icon: Type,
  defaultProps: {
    fontSize: 'xl',
    fontWeight: 'bold',
  },
  // No defaultSize - event name should size to content
  Renderer: EventNameRenderer,
  SettingsPanel: EventNameSettings,
  hidden: true, // Internal use only
};
