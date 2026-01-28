import { BarChart3 } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { StatCardProps } from '../../types';
import { StatCardRenderer } from './renderer';
import { StatCardSettings } from './settings';

export const statCardBlockDef: BlockDefinition<StatCardProps> = {
  type: 'stat-card',
  label: 'Stat Card',
  icon: BarChart3,
  defaultProps: {
    metric: 'photos',
  },
  Renderer: StatCardRenderer,
  SettingsPanel: StatCardSettings,
  childOnly: true,
};
