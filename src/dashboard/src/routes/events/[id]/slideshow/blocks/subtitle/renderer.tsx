import { cn } from '@/shared/utils/ui';
import type { SlideshowBlock, SlideshowContext, SubtitleProps } from '../../types';

const FONT_SIZE_CLASS: Record<string, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
  '2xl': 'text-xl',
};

const FONT_WEIGHT_CLASS: Record<string, string> = {
  normal: 'font-normal',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

export function SubtitleRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as SubtitleProps;
  const fontSizeClass = FONT_SIZE_CLASS[props.fontSize] ?? 'text-sm';
  const fontWeightClass = FONT_WEIGHT_CLASS[props.fontWeight] ?? 'font-normal';

  if (!context.event.subtitle) {
    return (
      <p className={cn('text-muted-foreground/50', fontSizeClass, fontWeightClass)}>
        No subtitle
      </p>
    );
  }

  return (
    <p className={cn('text-muted-foreground', fontSizeClass, fontWeightClass)}>
      {context.event.subtitle}
    </p>
  );
}
