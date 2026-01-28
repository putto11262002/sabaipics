import { TextCursorInput } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { SubtitleProps } from '../../types';
import { SubtitleRenderer } from './renderer';
import { SubtitleSettings } from './settings';

export const subtitleBlockDef: BlockDefinition<SubtitleProps> = {
  type: 'subtitle',
  label: 'Subtitle',
  icon: TextCursorInput,
  defaultProps: {
    fontSize: 'md',
    fontWeight: 'normal',
  },
  // No defaultSize - subtitle should size to content
  Renderer: SubtitleRenderer,
  SettingsPanel: SubtitleSettings,
};
