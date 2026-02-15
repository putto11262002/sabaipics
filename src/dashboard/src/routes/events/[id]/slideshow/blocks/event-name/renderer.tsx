import { cn } from '@/ui/lib/utils';
import type { SlideshowBlock, SlideshowContext, EventNameProps } from '../../types';

const FONT_SIZE_CLASS: Record<string, string> = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
  '2xl': 'text-5xl',
  '3xl': 'text-6xl',
};

const FONT_WEIGHT_CLASS: Record<string, string> = {
  normal: 'font-normal',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

export function EventNameRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as EventNameProps;
  const fontSizeClass = FONT_SIZE_CLASS[props.fontSize] ?? 'text-2xl';
  const fontWeightClass = FONT_WEIGHT_CLASS[props.fontWeight] ?? 'font-bold';

  return (
    <h2 className={cn('text-primary', fontSizeClass, fontWeightClass)}>
      {context.event.name}
    </h2>
  );
}
