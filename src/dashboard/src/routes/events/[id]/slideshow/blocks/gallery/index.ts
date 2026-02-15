import { LayoutGrid } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { GalleryProps } from '../../types';
import { GalleryRenderer } from './renderer';
import { GallerySettings } from './settings';

export const galleryBlockDef: BlockDefinition<GalleryProps> = {
  type: 'gallery',
  label: 'Gallery',
  icon: LayoutGrid,
  defaultProps: {
    density: 'normal',
    gap: 8,
    autoplaySpeed: 0,
  },
  Renderer: GalleryRenderer,
  SettingsPanel: GallerySettings,
};
