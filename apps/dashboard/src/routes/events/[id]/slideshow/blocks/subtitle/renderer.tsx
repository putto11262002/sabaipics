import { cn } from '@sabaipics/uiv3/lib/utils';
import type { SlideshowBlock, SlideshowContext, SubtitleProps } from '../../types';

const FONT_SIZE_CLASS: Record<string, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function SubtitleRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as SubtitleProps;

  if (!context.event.subtitle) {
    return (
      <p className={cn('text-muted-foreground/50', FONT_SIZE_CLASS[props.fontSize] ?? 'text-sm')}>
        No subtitle
      </p>
    );
  }

  return (
    <p className={cn('text-muted-foreground', FONT_SIZE_CLASS[props.fontSize] ?? 'text-sm')}>
      {context.event.subtitle}
    </p>
  );
}
