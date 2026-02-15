import { cn } from '@/shared/utils/ui';
import type { SlideshowBlock, SlideshowContext, FlexProps } from '../../types';
import { getBlockDef } from '../registry';
import { gapClass, paddingClass } from '../../lib/spacing';

export function FlexRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as FlexProps;
  const children = block.children ?? [];

  return (
    <div
      className={cn(
        'flex',
        props.direction === 'column' ? 'flex-col' : 'flex-row',
        props.wrap && 'flex-wrap',
        props.align === 'center' && 'items-center',
        props.align === 'start' && 'items-start',
        props.align === 'end' && 'items-end',
        props.justify === 'center' && 'justify-center',
        props.justify === 'start' && 'justify-start',
        props.justify === 'end' && 'justify-end',
        props.justify === 'between' && 'justify-between',
        gapClass[props.gap],
        paddingClass[props.padding],
      )}
    >
      {children
        .filter((c) => c.enabled)
        .map((child) => {
          const def = getBlockDef(child.type);
          if (!def) return null;
          return (
            <div key={child.id} data-block-id={child.id}>
              <def.Renderer block={child} context={context} />
            </div>
          );
        })}
    </div>
  );
}
