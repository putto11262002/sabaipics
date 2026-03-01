import QRCodeSVG from 'react-qr-code';
import { cn } from '@/shared/utils/ui';
import type { SlideshowBlock, SlideshowContext, QrProps } from '../../types';

const SIZE_CLASS: Record<string, string> = {
  sm: 'size-20',
  md: 'size-28',
  lg: 'size-36',
};

export function QrRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as QrProps;
  const searchUrl = `${import.meta.env.VITE_EVENT_URL}/${context.event.id}/search`;

  // Editor mode - show placeholder
  if (!context.liveMode) {
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        <div
          className={cn(
            SIZE_CLASS[props.size] ?? 'size-28',
            'flex items-center justify-center rounded-xl border-2 border-border bg-muted',
          )}
        >
          <span className="text-sm font-medium text-muted-foreground">QR</span>
        </div>
        {props.label && <p className="text-sm text-muted-foreground">{props.label}</p>}
      </div>
    );
  }

  // Live mode - render actual QR code
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div
        className={cn(
          SIZE_CLASS[props.size] ?? 'size-28',
          'flex items-center justify-center rounded-xl bg-white p-2',
        )}
      >
        <QRCodeSVG value={searchUrl} level="M" style={{ height: '100%', width: '100%' }} />
      </div>
      {props.label && <p className="text-sm text-muted-foreground">{props.label}</p>}
    </div>
  );
}
