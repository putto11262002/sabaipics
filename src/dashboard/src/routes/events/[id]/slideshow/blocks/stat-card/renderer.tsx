import type { SlideshowBlock, SlideshowContext, StatCardProps } from '../../types';

const METRIC_CONFIG: Record<
  string,
  { label: string; contextKey: keyof SlideshowContext['stats'] }
> = {
  photos: { label: 'Photos', contextKey: 'photoCount' },
  downloads: { label: 'Downloads', contextKey: 'downloadCount' },
  searches: { label: 'Searches', contextKey: 'searchCount' },
};

export function StatCardRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as StatCardProps;
  const config = METRIC_CONFIG[props.metric];

  if (!config) {
    return <div className="text-xs text-muted-foreground">Unknown metric</div>;
  }

  const value = context.stats[config.contextKey];

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-3 text-center">
      <div className="text-xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{config.label}</div>
    </div>
  );
}
