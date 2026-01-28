import type { LucideIcon } from 'lucide-react';
import type { SlideshowBlock, SlideshowContext } from '../types';
import { flexBlockDef } from './flex';
import { logoBlockDef } from './logo';
import { eventNameBlockDef } from './event-name';
import { subtitleBlockDef } from './subtitle';
import { galleryBlockDef } from './gallery';
import { qrBlockDef } from './qr';
import { statCardBlockDef } from './stat-card';
import { socialIconBlockDef } from './social-icon';

export interface BlockDefinition<P extends Record<string, any> = Record<string, any>> {
  type: string;
  label: string;
  icon: LucideIcon;
  defaultProps: P;
  Renderer: React.FC<{ block: SlideshowBlock; context: SlideshowContext }>;
  SettingsPanel: React.FC<{
    block: SlideshowBlock;
    onChange: (updated: SlideshowBlock) => void;
    onSelectBlock?: (id: string) => void;
  }>;
  acceptsChildren?: boolean;
  childOnly?: boolean;
  defaultSize?: {
    width: number; // 0-100 (percentage of viewport width)
    height: number; // 0-100 (percentage of viewport height)
  };
}

export const blockRegistry = new Map<string, BlockDefinition>();

// Register all known block types
function register(def: BlockDefinition) {
  blockRegistry.set(def.type, def);
}

register(flexBlockDef);
register(logoBlockDef);
register(eventNameBlockDef);
register(subtitleBlockDef);
register(galleryBlockDef);
register(qrBlockDef);
register(statCardBlockDef);
register(socialIconBlockDef);

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getBlockDef(type: string): BlockDefinition | undefined {
  return blockRegistry.get(type);
}

export function getRegisteredTypes(): string[] {
  return Array.from(blockRegistry.keys());
}

export function getTopLevelTypes(): string[] {
  return Array.from(blockRegistry.entries())
    .filter(([_, def]) => !def.childOnly)
    .map(([type]) => type);
}

export function getChildTypes(): string[] {
  return Array.from(blockRegistry.entries())
    .filter(([_, def]) => def.childOnly)
    .map(([type]) => type);
}

let blockCounter = 0;

export function createBlock(type: string): SlideshowBlock {
  const def = blockRegistry.get(type);
  if (!def) {
    throw new Error(`Unknown block type: ${type}`);
  }
  blockCounter += 1;
  return {
    id: `${type}-${Date.now()}-${blockCounter}`,
    type,
    enabled: true,
    props: structuredClone(def.defaultProps),
    ...(def.defaultSize && { size: def.defaultSize }),
  };
}
