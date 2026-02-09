import { Type } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { TextBlockProps } from '../../types';
import { TextBlockRenderer } from './renderer';
import { TextBlockSettings } from './settings';

export const textBlockBlockDef: BlockDefinition<TextBlockProps> = {
  type: 'text-block',
  label: 'Text Block',
  icon: Type,
  defaultProps: {
    variant: 'paragraph',
    content: '',
  },
  Renderer: TextBlockRenderer,
  SettingsPanel: TextBlockSettings,
};
