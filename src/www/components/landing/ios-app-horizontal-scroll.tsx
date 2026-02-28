'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import ios0 from '@/assets/ios-screenshots/ios-0.webp';
import ios1 from '@/assets/ios-screenshots/ios-1.webp';
import ios2 from '@/assets/ios-screenshots/ios-2.webp';
import ios3 from '@/assets/ios-screenshots/ios-3.webp';

// Adjustable: viewport height for each panel (100vh = one full scroll)
const SCROLL_HEIGHT_PER_PANEL = 100;

type Panel = {
  screenshot: typeof ios0;
  title: string;
  description: string;
};

const panels: Panel[] = [
  {
    screenshot: ios0,
    title: 'Connect Your Camera',
    description: 'Wirelessly connect to Canon, Nikon, or Sony cameras and automatically sync photos in the background.',
  },
  {
    screenshot: ios1,
    title: 'Real-Time Upload',
    description: 'Photos transfer seamlessly while you shoot. No cables, no manual export.',
  },
  {
    screenshot: ios2,
    title: 'Monitor Progress',
    description: 'Track upload status and manage multiple events from your iPhone.',
  },
  {
    screenshot: ios3,
    title: 'Ready to Share',
    description: 'Photos are instantly available for guests to find via face search.',
  },
];

export function IosAppHorizontalScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const containerTop = rect.top;
      const containerHeight = rect.height;
      const viewportHeight = window.innerHeight;

      // Calculate scroll progress (0 to 1)
      // When container top is at viewport height, progress = 0
      // When container bottom reaches top, progress = 1
      const scrollableDistance = containerHeight - viewportHeight;
      const scrolled = -containerTop;
      const rawProgress = scrolled / scrollableDistance;
      const clampedProgress = Math.max(0, Math.min(1, rawProgress));

      setProgress(clampedProgress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Calculate horizontal translation
  // progress 0 = first panel, progress 1 = last panel
  const totalPanels = panels.length;
  const translateX = -progress * (totalPanels - 1) * 100; // Move through panels

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{
        height: `${SCROLL_HEIGHT_PER_PANEL * totalPanels}vh`,
      }}
    >
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="relative h-full bg-muted/30">
          {/* Gradient background */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 88% at 12% 92%, color-mix(in oklab, var(--primary-end) 28%, transparent) 0%, transparent 64%), radial-gradient(118% 82% at 88% 86%, color-mix(in oklab, var(--primary) 28%, transparent) 0%, transparent 64%)',
            }}
          />

          {/* Horizontal sliding content */}
          <div
            className="absolute inset-0 flex transition-transform duration-100 ease-out"
            style={{
              transform: `translateX(${translateX}%)`,
              width: `${totalPanels * 100}%`,
            }}
          >
            {panels.map((panel, index) => (
              <div
                key={index}
                className="flex h-full w-full shrink-0 items-center"
                style={{ width: `${100 / totalPanels}%` }}
              >
                <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 lg:grid-cols-2 lg:gap-14">
                  {/* Copy - left column */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      iOS app
                    </p>
                    <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                      {panel.title}
                    </h2>
                    <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                      {panel.description}
                    </p>

                    {/* App Store badge - show only on last panel */}
                    {index === panels.length - 1 && (
                      <div className="mt-7">
                        <a
                          href="https://apps.apple.com/app/id0000000000"
                          aria-label="Download on the App Store"
                          className="inline-flex w-fit transition-opacity hover:opacity-90"
                        >
                          <Image
                            src="/badges/app-store-en.svg"
                            alt="Download on the App Store"
                            width={162}
                            height={48}
                            className="h-11 w-auto"
                          />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* iPhone mockup - right column */}
                  <div aria-hidden="true">
                    <div className="mx-auto w-full max-w-[360px] rounded-[2.4rem] border border-border/60 bg-[linear-gradient(165deg,color-mix(in_oklab,var(--primary)_12%,transparent)_0%,color-mix(in_oklab,var(--primary)_4%,transparent)_58%,color-mix(in_oklab,var(--primary)_8%,transparent)_100%)] p-3 shadow-[0_26px_64px_-46px_color-mix(in_oklab,var(--foreground)_22%,transparent)] lg:ml-auto">
                      <div className="relative aspect-[9/19] overflow-hidden rounded-[1.8rem] border border-border/50 bg-background">
                        <Image
                          src={panel.screenshot}
                          alt={`${panel.title} screenshot`}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 360px, 400px"
                        />
                        <div className="absolute inset-x-[30%] top-2 z-10 h-1 rounded-full bg-foreground/20" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
