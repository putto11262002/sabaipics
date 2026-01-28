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
    columns: 3,
    gap: 8,
    autoplaySpeed: 0,
  },
  Renderer: GalleryRenderer,
  SettingsPanel: GallerySettings,
};
