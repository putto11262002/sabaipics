import type { SlideshowBlock, SlideshowContext, LogoProps } from '../../types';

const SIZE_MAP = {
  sm: '5vw',  // ~96px on 1920px screen
  md: '8vw',  // ~154px on 1920px screen
  lg: '12vw', // ~230px on 1920px screen
};

export function LogoRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as LogoProps;
  const logoUrl = context.event.logoUrl;

  const containerStyle = {
    width: SIZE_MAP[props.size],
    aspectRatio: '1', // Square (1:1 ratio)
  };

  // In editor mode (not live), always show placeholder
  if (!context.liveMode) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border-2 border-border bg-muted"
        style={containerStyle}
      >
        <span className="text-sm font-medium text-muted-foreground">LOGO</span>
      </div>
    );
  }

  // Live mode - show real logo if available
  return logoUrl ? (
    <div
      className="overflow-hidden rounded-lg"
      style={containerStyle}
    >
      <img
        src={logoUrl}
        alt="Event logo"
        className="h-full w-full object-cover"
      />
    </div>
  ) : (
    <div
      className="flex items-center justify-center rounded-lg border-2 border-border bg-muted"
      style={containerStyle}
    >
      <span className="text-sm font-medium text-muted-foreground">LOGO</span>
    </div>
  );
}
