import { useMemo } from 'react';
import type { SlideshowBlock, SlideshowContext, EventHeaderProps } from '../../types';
import { getBlockDef, blockRegistry } from '../registry';

// Utility for creating internal blocks
function createInternalBlock(type: string, props: any, children?: SlideshowBlock[]): SlideshowBlock {
  const def = blockRegistry.get(type);
  if (!def) throw new Error(`Unknown block type: ${type}`);

  return {
    id: `internal-${type}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    enabled: true,
    props: { ...def.defaultProps, ...props },
    children,
  };
}

// Build internal block tree based on toggles and layout
function buildEventHeaderTree(props: EventHeaderProps): SlideshowBlock[] {
  const children: SlideshowBlock[] = [];

  // Add components based on toggles
  if (props.showLogo) {
    children.push(createInternalBlock('logo', { size: props.logoSize }));
  }
  if (props.showName) {
    children.push(createInternalBlock('event-name', {}));
  }
  if (props.showSubtitle) {
    children.push(createInternalBlock('subtitle', {}));
  }
  if (props.showQr) {
    children.push(createInternalBlock('qr', { size: props.qrSize, label: '' }));
  }

  // No components? Return empty
  if (children.length === 0) return [];

  // Wrap in flex container with user-controlled layout
  return [
    createInternalBlock(
      'flex',
      {
        direction: props.direction,
        align: props.align,
        justify: props.justify,
        gap: props.gap,
        padding: 'md',
        wrap: false,
      },
      children,
    ),
  ];
}

export function EventHeaderRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as EventHeaderProps;

  // Dynamically build internal block tree
  const internalBlocks = useMemo(
    () => buildEventHeaderTree(props),
    [
      props.showLogo,
      props.showName,
      props.showSubtitle,
      props.showQr,
      props.logoSize,
      props.qrSize,
      props.direction,
      props.align,
      props.justify,
      props.gap,
    ],
  );

  // Render using existing block renderers
  return (
    <div data-composite-block="event-header">
      {internalBlocks.map((child) => {
        const def = getBlockDef(child.type);
        if (!def) return null;
        return <def.Renderer key={child.id} block={child} context={context} />;
      })}
    </div>
  );
}
