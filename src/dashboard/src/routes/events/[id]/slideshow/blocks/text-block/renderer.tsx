import { cn } from '@/ui/lib/utils';
import type { SlideshowBlock, SlideshowContext, TextBlockProps } from '../../types';

const VARIANT_CLASSES = {
  heading: 'text-3xl font-bold text-center text-primary',
  paragraph: 'text-base text-foreground',
  caption: 'text-sm text-muted-foreground text-center',
};

export function TextBlockRenderer({
  block,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as TextBlockProps;

  return (
    <div className="py-2">
      <div className={cn('whitespace-pre-wrap', VARIANT_CLASSES[props.variant])}>
        {props.content || 'Enter your text...'}
      </div>
    </div>
  );
}
