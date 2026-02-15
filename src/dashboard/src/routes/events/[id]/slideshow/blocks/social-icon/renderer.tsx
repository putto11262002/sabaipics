import { cn } from '@/ui/lib/utils';
import { Instagram, Facebook, Music2, Twitter, Youtube } from 'lucide-react';
import type { SlideshowBlock, SlideshowContext, SocialIconProps } from '../../types';

const PLATFORM_CONFIG: Record<string, { label: string; icon: React.FC<{ className?: string }> }> = {
  instagram: { label: 'Instagram', icon: Instagram },
  facebook: { label: 'Facebook', icon: Facebook },
  tiktok: { label: 'TikTok', icon: Music2 },
  x: { label: 'X', icon: Twitter },
  youtube: { label: 'YouTube', icon: Youtube },
};

export function SocialIconRenderer({
  block,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as SocialIconProps;
  const config = PLATFORM_CONFIG[props.platform];

  if (!config) {
    return <div className="text-xs text-muted-foreground">Unknown platform</div>;
  }

  const Icon = config.icon;

  const content = (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          'flex size-10 items-center justify-center rounded-full bg-muted text-foreground',
        )}
      >
        <Icon className="size-5" />
      </div>
      <span className="text-[10px] text-muted-foreground">{config.label}</span>
    </div>
  );

  if (props.url) {
    return (
      <a href={props.url} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}
