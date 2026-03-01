import { useMemo } from 'react';
import type { SlideshowBlock, SlideshowContext, StatsPanelProps } from '../../types';
import { getBlockDef, blockRegistry } from '../registry';

function createInternalBlock(
  type: string,
  props: any,
  children?: SlideshowBlock[],
): SlideshowBlock {
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

function buildStatsPanelTree(props: StatsPanelProps): SlideshowBlock[] {
  const statCards = props.metrics.map((metric) => createInternalBlock('stat-card', { metric }));

  const flexProps = {
    direction: (props.variant === 'vertical' ? 'column' : 'row') as 'column' | 'row',
    align: 'center' as 'center',
    justify: 'center' as 'center',
    gap: (props.variant === 'compact' ? 'sm' : 'lg') as 'sm' | 'lg',
    padding: 'md' as 'md',
    wrap: props.variant === 'cards',
  };

  return [createInternalBlock('flex', flexProps, statCards)];
}

export function StatsPanelRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as StatsPanelProps;

  const internalBlocks = useMemo(
    () => buildStatsPanelTree(props),
    [props.variant, JSON.stringify(props.metrics)],
  );

  return (
    <div data-composite-block="stats-panel">
      {internalBlocks.map((child) => {
        const def = getBlockDef(child.type);
        if (!def) return null;
        return <def.Renderer key={child.id} block={child} context={context} />;
      })}
    </div>
  );
}
