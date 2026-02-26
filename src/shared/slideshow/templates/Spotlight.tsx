import { useState, useEffect } from 'react';
import QRCodeSVG from 'react-qr-code';
import type { SlideshowProps } from '../types';

/**
 * Spotlight template - fullscreen photo with header and footer bars
 * Fits in 100vh, no scrolling
 * Auto-slides every 5 seconds
 * Header: event title and subtitle (always visible)
 * Footer: QR code only
 */
export function SpotlightTemplate({ event, photos, config, qrUrl, imageUrlBuilder }: SlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (photos.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [photos.length]);

  // Container background (CSS variables --primary and --background are set by SlideshowPlayer wrapper)
  const containerStyle = {
    background: config.background,
  } as React.CSSProperties;

  if (photos.length === 0) {
    return (
      <div
        className="relative h-full w-full overflow-hidden flex flex-col"
        style={containerStyle}
      >
        {/* Header - always visible */}
        <Header event={event} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--primary)] opacity-60 text-xl">No photos yet</p>
        </div>
        <FooterBar qrUrl={qrUrl} />
      </div>
    );
  }

  const photo = photos[currentIndex];
  const imageUrl = imageUrlBuilder(photo.r2Key, 1200);

  return (
    <div
      className="relative h-full w-full overflow-hidden flex flex-col"
      style={containerStyle}
    >
      {/* Header - always visible */}
      <Header event={event} />

      {/* Photo area - takes remaining space */}
      <div className="relative flex-1 overflow-hidden">
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-contain animate-in fade-in duration-500"
          key={photo.id}
        />
      </div>

      {/* Footer bar */}
      <FooterBar qrUrl={qrUrl} />
    </div>
  );
}

function Header({ event }: { event: SlideshowProps['event'] }) {
  return (
    <div className="bg-background/80 backdrop-blur-sm shadow-[0_4px_20px_rgba(0,0,0,0.1)] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-lg @md:text-xl text-primary">
          {event.name}
        </h2>
        {event.subtitle && (
          <>
            <span className="text-primary/70">|</span>
            <p className="text-sm @md:text-base text-primary/70">
              {event.subtitle}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function FooterBar({ qrUrl }: { qrUrl: string }) {
  return (
    <div className="bg-background/80 backdrop-blur-sm shadow-[0_-4px_20px_rgba(0,0,0,0.1)] px-4 py-2.5">
      <div className="flex items-center justify-end gap-2">
        <div className="text-right">
          <p className="text-primary text-xs @md:text-sm">Find your photos</p>
          <p className="text-muted-foreground text-[10px] @md:text-xs">Scan to search by face</p>
        </div>
        <div className="p-1 rounded-lg bg-white">
          <QRCodeSVG value={qrUrl} level="M" size={40} className="@md:w-14 @md:h-14 w-10 h-10" />
        </div>
      </div>
    </div>
  );
}
