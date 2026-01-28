import type { SlideshowBlock, SlideshowContext, LogoProps } from '../../types';

export function LogoRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as LogoProps;
  const logoUrl = context.event.logoUrl;

  // In editor mode (not live), always show placeholder
  if (!context.liveMode) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border-2 border-border bg-muted"
        style={{
          width: `${props.width}vw`,
          aspectRatio: '1', // Square (1:1 ratio)
        }}
      >
        <span className="text-sm font-medium text-muted-foreground">LOGO</span>
      </div>
    );
  }

  // Live mode - show real logo if available
  return logoUrl ? (
    <img
      src={logoUrl}
      alt="Event logo"
      className="rounded-lg object-contain"
      style={{
        width: `${props.width}vw`,
        aspectRatio: '1', // Square (1:1 ratio)
      }}
    />
  ) : (
    <div
      className="flex items-center justify-center rounded-lg border-2 border-border bg-muted"
      style={{
        width: `${props.width}vw`,
        aspectRatio: '1',
      }}
    >
      <span className="text-sm font-medium text-muted-foreground">LOGO</span>
    </div>
  );
}
