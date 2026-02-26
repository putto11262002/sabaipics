import { BarChart3 } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { StatsPanelProps } from '../../types';
import { StatsPanelRenderer } from './renderer';
import { StatsPanelSettings } from './settings';

export const statsPanelBlockDef: BlockDefinition<StatsPanelProps> = {
  type: 'stats-panel',
  label: 'Stats Panel',
  icon: BarChart3,
  defaultProps: {
    variant: 'cards',
    metrics: ['photos', 'searches', 'downloads'],
  },
  Renderer: StatsPanelRenderer,
  SettingsPanel: StatsPanelSettings,
  composite: true,
};
