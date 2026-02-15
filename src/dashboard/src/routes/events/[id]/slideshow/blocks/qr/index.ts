import { QrCode } from 'lucide-react';
import type { BlockDefinition } from '../registry';
import type { QrProps } from '../../types';
import { QrRenderer } from './renderer';
import { QrSettings } from './settings';

export const qrBlockDef: BlockDefinition<QrProps> = {
  type: 'qr',
  label: 'QR Code',
  icon: QrCode,
  defaultProps: {
    size: 'md',
    label: 'Scan to find your photos',
  },
  Renderer: QrRenderer,
  SettingsPanel: QrSettings,
};
