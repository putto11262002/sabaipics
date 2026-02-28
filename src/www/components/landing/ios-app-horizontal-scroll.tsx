'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import ios0 from '@/assets/ios-screenshots/ios-0.webp';
import ios1 from '@/assets/ios-screenshots/ios-1.webp';
import ios2 from '@/assets/ios-screenshots/ios-2.webp';
import ios3 from '@/assets/ios-screenshots/ios-3.webp';

// Adjustable: viewport height for each panel (100vh = one full scroll)
const SCROLL_HEIGHT_PER_PANEL = 100;

type Panel = {
  screenshot: typeof ios0;
  key: 'panel1' | 'panel2' | 'panel3' | 'panel4';
};

const panelScreenshots: Panel[] = [
  { screenshot: ios0, key: 'panel1' },
  { screenshot: ios1, key: 'panel2' },
  { screenshot: ios2, key: 'panel3' },
  { screenshot: ios3, key: 'panel4' },
];

export function IosAppHorizontalScroll() {
  const t = useTranslations('IosAppPanels');
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

  // Calculate which panel is active and opacity for each
  const totalPanels = panelScreenshots.length;
  const getPanelOpacity = (index: number) => {
    const panelProgress = progress * (totalPanels - 1);
    const distance = Math.abs(panelProgress - index);

    // Each screenshot stays at 100% for a range, then fades
    const plateauRange = 0.4; // Stay at 100% within this distance
    const fadeRange = 0.3; // Fade over this distance

    if (distance < plateauRange) return 1;
    if (distance > plateauRange + fadeRange) return 0;
    return 1 - ((distance - plateauRange) / fadeRange);
  };

  const firstPanel = panelScreenshots[0];

  return (
    <div
      ref={containerRef}
      className="bg-muted/30 py-16 sm:py-20"
      style={{
        height: typeof window !== 'undefined' && window.innerWidth >= 1024
          ? `${SCROLL_HEIGHT_PER_PANEL * totalPanels}vh`
          : 'auto',
      }}
    >
      {/* Content */}
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 lg:grid-cols-2 lg:gap-14">
        {/* Copy - left column */}
        <div>
          {/* Mobile: show only first panel */}
          <div className="lg:hidden text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              {t(`${firstPanel.key}.title`)}
            </h2>
            <p className="mt-4 mx-auto max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t(`${firstPanel.key}.description`)}
            </p>
          </div>

          {/* Desktop: show all panels with scroll behavior */}
          <div className="hidden lg:block">
            {panelScreenshots.map((panel, index) => (
              <div key={panel.key} className="flex min-h-screen items-center justify-center py-16 sm:py-20">
                <div>
                  <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                    {t(`${panel.key}.title`)}
                  </h2>
                  <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    {t(`${panel.key}.description`)}
                  </p>

                  {/* App Store badge - show only on last panel */}
                  {index === panelScreenshots.length - 1 && (
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
              </div>
            ))}
          </div>
        </div>

        {/* iPhone mockup - right column */}
        <div className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:items-center" aria-hidden="true">
          <div className="mx-auto w-full max-w-[280px] rounded-[2.4rem] border border-border/60 bg-muted p-3 shadow-[0_26px_64px_-46px_color-mix(in_oklab,var(--foreground)_22%,transparent)] lg:ml-auto">
            <div className="relative aspect-[9/19] overflow-hidden rounded-[1.8rem] border border-border/50 bg-background">
              {/* Mobile: show only first screenshot */}
              <Image
                src={firstPanel.screenshot}
                alt={t(`${firstPanel.key}.title`)}
                fill
                className="object-cover lg:hidden"
                sizes="280px"
              />

              {/* Desktop: all screenshots with fade transitions */}
              {panelScreenshots.map((panel, index) => (
                <Image
                  key={panel.key}
                  src={panel.screenshot}
                  alt={t(`${panel.key}.title`)}
                  fill
                  className="hidden object-cover transition-opacity duration-500 ease-out lg:block"
                  style={{ opacity: getPanelOpacity(index) }}
                  sizes="280px"
                />
              ))}
              <div className="absolute inset-x-[30%] top-2 z-10 h-1 rounded-full bg-foreground/20" />
            </div>
          </div>

          {/* Download badge - mobile only, below screen */}
          <div className="mt-7 flex justify-center lg:hidden">
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
        </div>
      </div>
    </div>
  );
}
