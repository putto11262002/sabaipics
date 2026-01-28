import { cn } from '@sabaipics/uiv3/lib/utils';
import type { SlideshowBlock, SlideshowContext, LogoProps } from '../../types';

const SHAPE_CLASS: Record<string, string> = {
  circle: 'rounded-full',
  square: 'rounded-none',
  rounded: 'rounded-lg',
};

export function LogoRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as LogoProps;
  const shapeClass = SHAPE_CLASS[props.shape] ?? 'rounded-full';

  if (context.event.logoUrl) {
    return (
      <img
        src={context.event.logoUrl}
        alt={context.event.name}
        className={cn('shrink-0 object-cover', shapeClass)}
        style={{ width: props.size, height: props.size }}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center bg-muted text-xs font-medium text-muted-foreground',
        shapeClass,
      )}
      style={{ width: props.size, height: props.size }}
    >
      Logo
    </div>
  );
}
