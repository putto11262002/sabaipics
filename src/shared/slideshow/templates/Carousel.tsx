import { useEffect, useState } from 'react';
import QRCodeSVG from 'react-qr-code';
import { Image as ImageIcon } from 'lucide-react';
import type { SlideshowProps } from '../types';

/**
 * Carousel template - photo carousel centered in viewport
 * Desktop (container >= 768px): 3 photos visible (left smaller, center larger, right smaller)
 * Mobile (container < 768px): 1 photo visible (center)
 * Auto-slides every 5 seconds
 */
export function CarouselTemplate({ event, photos, config, qrUrl, imageUrlBuilder }: SlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (photos.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [photos.length]);

  // Helper to get photo at offset from current (with wrapping)
  const getPhotoAt = (offset: number) => {
    if (photos.length === 0) return null;
    const index = (currentIndex + offset) % photos.length;
    return photos[index];
  };

  // No photos - show placeholder cards
  if (photos.length === 0) {
    return (
      <div
        className="relative h-full w-full overflow-hidden flex flex-col"
        style={{ background: config.background }}
      >
        {/* Event title */}
        <div className="pt-8 pb-4 text-center">
          <h1 className="text-2xl @md:text-3xl font-bold text-[var(--primary)]">
            {event.name}
          </h1>
          {event.subtitle && (
            <p className="text-sm text-[var(--primary)] opacity-80 mt-1">
              {event.subtitle}
            </p>
          )}
        </div>

        {/* Placeholder cards - responsive to container width */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-4 px-4">
            {/* Left placeholder - hidden on small containers */}
            <div className="hidden @md:flex aspect-[3/2] w-72 items-center justify-center rounded-lg bg-white/10">
              <ImageIcon className="size-10 text-white/30" />
            </div>
            <div className="aspect-[3/2] w-80 flex items-center justify-center rounded-lg bg-white/10">
              <ImageIcon className="size-10 text-white/30" />
            </div>
            {/* Right placeholder - hidden on small containers */}
            <div className="hidden @md:flex aspect-[3/2] w-72 items-center justify-center rounded-lg bg-white/10">
              <ImageIcon className="size-10 text-white/30" />
            </div>
          </div>
        </div>

        {/* QR code */}
        <div className="pb-6 flex flex-col items-center">
          <div className="p-2 bg-white rounded-lg">
            <QRCodeSVG value={qrUrl} level="M" size={80} />
          </div>
          <p className="text-xs text-center mt-2 font-medium text-[var(--primary)]">
            Find your photos
          </p>
        </div>
      </div>
    );
  }

  // Get photos for each position
  // Side photos only shown on larger containers (>= 768px via @md:)
  const leftPhoto = photos.length >= 2 ? getPhotoAt(0) : null;
  const centerPhoto = photos.length >= 1 ? getPhotoAt(photos.length >= 2 ? 1 : 0) : null;
  const rightPhoto = photos.length >= 3 ? getPhotoAt(2) : null;

  return (
    <div
      className="relative h-full w-full overflow-hidden flex flex-col"
      style={{ background: config.background }}
    >
      {/* Event title */}
      <div className="pt-8 pb-4 text-center">
        <h1 className="text-2xl @md:text-3xl font-bold text-[var(--primary)]">
          {event.name}
        </h1>
        {event.subtitle && (
          <p className="text-sm text-[var(--primary)] opacity-80 mt-1">
            {event.subtitle}
          </p>
        )}
      </div>

      {/* Photos container */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-4 px-4">
          {/* Left photo - hidden on small containers */}
          {leftPhoto && (
            <div className="hidden @md:block aspect-[3/2] w-72 overflow-hidden rounded-lg shadow-lg bg-black/30 scale-90 opacity-70">
              <img
                src={imageUrlBuilder(leftPhoto.r2Key, 600)}
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
          )}

          {/* Center photo - always visible */}
          {centerPhoto && (
            <div className="aspect-[3/2] w-80 overflow-hidden rounded-lg shadow-xl bg-black/40">
              <img
                src={imageUrlBuilder(centerPhoto.r2Key, 800)}
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
          )}

          {/* Right photo - hidden on small containers */}
          {rightPhoto && (
            <div className="hidden @md:block aspect-[3/2] w-72 overflow-hidden rounded-lg shadow-lg bg-black/30 scale-90 opacity-70">
              <img
                src={imageUrlBuilder(rightPhoto.r2Key, 600)}
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>
      </div>

      {/* QR code */}
      <div className="pb-6 flex flex-col items-center">
        <div className="p-2 bg-white rounded-lg">
          <QRCodeSVG value={qrUrl} level="M" size={80} />
        </div>
        <p className="text-xs text-center mt-2 font-medium text-[var(--primary)]">
          Find your photos
        </p>
      </div>
    </div>
  );
}
