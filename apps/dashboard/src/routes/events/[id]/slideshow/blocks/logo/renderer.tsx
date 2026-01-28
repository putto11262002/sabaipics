import type { SlideshowBlock, SlideshowContext, LogoProps } from '../../types';

export function LogoRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as LogoProps;

  if (context.event.logoUrl) {
    return (
      <img
        src={context.event.logoUrl}
        alt={context.event.name}
        className="object-contain"
        style={{ width: `${props.width}vw`, height: 'auto' }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-lg bg-muted text-xs font-medium text-muted-foreground"
      style={{ width: `${props.width}vw`, aspectRatio: '1' }}
    >
      Logo
    </div>
  );
}
