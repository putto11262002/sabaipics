import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@sabaipics/uiv3/lib/utils';
import { LogoMark } from '@/components/icons/logo-mark';
import type {
  SlideshowBlock,
  SlideshowTheme,
  HeaderProps,
  GalleryProps,
  QrProps,
  StatsProps,
  SocialProps,
} from './types';

interface CanvasBlockProps {
  block: SlideshowBlock;
  isSelected: boolean;
  onSelect: (id: string) => void;
  theme: SlideshowTheme;
  eventName: string;
}

export function CanvasBlock({ block, isSelected, onSelect, theme, eventName }: CanvasBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative rounded-lg border px-6 py-5 transition-colors cursor-grab active:cursor-grabbing',
        isSelected ? 'border-blue-500' : 'border-transparent hover:border-blue-300',
        !block.enabled && 'opacity-40',
      )}
      onClick={() => onSelect(block.id)}
    >
      {/* Block content */}
      <BlockContent block={block} theme={theme} eventName={eventName} />
    </div>
  );
}

export function BlockContent({
  block,
  eventName,
}: {
  block: SlideshowBlock;
  theme: SlideshowTheme;
  eventName: string;
}) {
  switch (block.type) {
    case 'header':
      return <HeaderContent props={block.props as HeaderProps} eventName={eventName} />;
    case 'gallery':
      return <GalleryContent props={block.props as GalleryProps} />;
    case 'qr':
      return <QrContent props={block.props as QrProps} />;
    case 'stats':
      return <StatsContent props={block.props as StatsProps} />;
    case 'social':
      return <SocialContent props={block.props as SocialProps} />;
  }
}

function HeaderContent({ props, eventName }: { props: HeaderProps; eventName: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 py-2',
        props.align === 'center' ? 'justify-center' : 'justify-start',
      )}
    >
      {props.showLogo && (
        <div className="flex size-12 shrink-0 items-center justify-center">
          <LogoMark className="size-10 text-primary" />
        </div>
      )}
      {props.showName && <h2 className="text-2xl font-bold text-primary">{eventName}</h2>}
    </div>
  );
}

function GalleryContent({ props }: { props: GalleryProps }) {
  const count = props.density === 's' ? 12 : props.density === 'm' ? 8 : 4;
  const cols =
    props.density === 's' ? 'grid-cols-6' : props.density === 'm' ? 'grid-cols-4' : 'grid-cols-2';

  return (
    <div className={cn('grid gap-2', cols)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-square rounded-lg bg-muted" />
      ))}
    </div>
  );
}

function QrContent({ props }: { props: QrProps }) {
  const sizeClass = props.size === 's' ? 'size-20' : props.size === 'm' ? 'size-28' : 'size-36';

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div
        className={cn(
          sizeClass,
          'flex items-center justify-center rounded-xl border-2 border-border bg-muted',
        )}
      >
        <span className="text-sm font-medium text-muted-foreground">QR</span>
      </div>
      {props.label && <p className="text-sm text-muted-foreground">{props.label}</p>}
    </div>
  );
}

const MOCK_STATS: Record<string, { label: string; value: number }> = {
  photos: { label: 'Photos', value: 142 },
  downloads: { label: 'Downloads', value: 38 },
  searches: { label: 'Searches', value: 67 },
};

function StatsContent({ props }: { props: StatsProps }) {
  if (props.show.length === 0) {
    return <p className="py-2 text-center text-sm text-muted-foreground">No stats selected</p>;
  }

  return (
    <div className="flex justify-center gap-4 py-2">
      {props.show.map((key) => {
        const stat = MOCK_STATS[key];
        if (!stat) return null;
        return (
          <div key={key} className="rounded-lg border border-border bg-card px-5 py-3 text-center">
            <div className="text-xl font-bold text-foreground">{stat.value}</div>
            <div className="text-xs text-muted-foreground">{stat.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function SocialContent({ props }: { props: SocialProps }) {
  const items =
    props.links.length > 0
      ? props.links.map((l) => ({ key: l.type, label: l.type.slice(0, 2).toUpperCase() }))
      : [
          { key: 'ig', label: 'IG' },
          { key: 'fb', label: 'FB' },
          { key: 'tt', label: 'TT' },
        ];

  return (
    <div className="flex justify-center gap-3 py-2">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex size-10 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
