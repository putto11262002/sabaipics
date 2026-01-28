import { cn } from '@sabaipics/uiv3/lib/utils';
import type { SlideshowBlock, SlideshowContext, EventNameProps } from '../../types';

const FONT_SIZE_CLASS: Record<string, string> = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
};

export function EventNameRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as EventNameProps;

  return (
    <h2 className={cn('font-bold text-primary', FONT_SIZE_CLASS[props.fontSize] ?? 'text-2xl')}>
      {context.event.name}
    </h2>
  );
}
