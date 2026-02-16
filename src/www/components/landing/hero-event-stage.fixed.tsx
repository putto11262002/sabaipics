'use client';

import * as React from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/shared/utils/ui';

const frame = {
  src: '/landing/i.png',
  alt: 'Event photo example',
};

export function HeroEventStageFixed({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [captureTick, setCaptureTick] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => setCaptureTick((v) => v + 1), 4200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={cn('w-full', className)}>
      <div className="relative">
        <div
          className="pointer-events-none absolute -inset-10 -z-10 opacity-80"
          style={{
            background:
              'radial-gradient(60% 55% at 35% 25%, color-mix(in oklab, var(--muted) 80%, transparent) 0%, transparent 60%), radial-gradient(70% 60% at 65% 55%, color-mix(in oklab, var(--foreground) 6%, transparent) 0%, transparent 68%)',
          }}
        />

        {/* Temporary: no hump/grip. Just the stage body + screen + controls. */}
        <div className="relative rounded-[1.7rem] border border-border/35 bg-muted/10 p-3 shadow-[0_30px_70px_-45px_color-mix(in_oklab,var(--foreground)_18%,transparent)]">
          <div className="pointer-events-none absolute inset-0 rounded-[1.7rem] shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_55%,transparent),inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_6%,transparent)]" />
          <div
            className="pointer-events-none absolute inset-0 rounded-[1.7rem]"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--foreground) 4%, transparent) 45%, transparent 100%)',
            }}
            aria-hidden="true"
          />

          {/* Erase top border behind viewfinder so it reads attached */}
          <div
            className="pointer-events-none absolute left-1/2 top-0 z-10 h-[2px] w-64 -translate-x-1/2 bg-muted/10"
            aria-hidden="true"
          />

          {/* Viewfinder (rounded trapezoid) */}
          <div
            className="pointer-events-none absolute left-[46%] top-0 z-20 h-12 w-44 -translate-x-1/2 -translate-y-full overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="relative h-full w-full rounded-2xl bg-transparent shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_55%,transparent)]"
              style={{
                clipPath: 'polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)',
              }}
            />

            {/* Viewfinder fill (clipped to trapezoid) */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                clipPath: 'polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)',
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--foreground) 2.2%, transparent) 50%, transparent 100%)',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/3 to-transparent" />
            </div>

            <svg
              viewBox="0 0 100 60"
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              shapeRendering="geometricPrecision"
              aria-hidden="true"
            >
              <path
                d="M12 0 H88 L100 60 H0 Z"
                fill="none"
                stroke="color-mix(in oklab, var(--border) 55%, transparent)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Shutter button (top plate, side view; attached, no bottom border) */}
          <div
            className="pointer-events-none absolute right-10 top-0 z-20 hidden -translate-y-full sm:block"
            aria-hidden="true"
          >
            <div className="relative h-8 w-16">
              <div
                className="absolute inset-0 rounded-t-xl border-x border-t border-border/40 bg-muted/15 shadow-[0_16px_30px_-26px_color-mix(in_oklab,var(--foreground)_16%,transparent)]"
                style={{
                  background:
                    'linear-gradient(180deg, color-mix(in oklab, var(--background) 75%, transparent), color-mix(in oklab, var(--muted) 55%, transparent))',
                }}
              />
              <div className="absolute left-2 top-1.5 h-1 w-9 rounded-full bg-background/35" />
              <div className="absolute right-2 top-2.5 h-3 w-3 rounded-full border border-border/35 bg-muted/15" />
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-background shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent),inset_0_12px_30px_-20px_color-mix(in_oklab,var(--foreground)_18%,transparent)]">
            <div className="grid grid-cols-[1fr_104px] p-2">
              <div className="relative aspect-[4/3] w-full">
                <div className="relative h-full w-full overflow-hidden rounded-[1.35rem] bg-background shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_8%,transparent),0_10px_24px_-24px_color-mix(in_oklab,var(--foreground)_10%,transparent)]">
                  <motion.div
                    key={`image-${captureTick}`}
                    initial={false}
                    animate={
                      reduceMotion
                        ? undefined
                        : {
                            scale: [1, 0.997, 1],
                            filter: ['saturate(1)', 'saturate(1.06)', 'saturate(1)'],
                          }
                    }
                    transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                    className="absolute inset-0"
                  >
                    <Image
                      src={frame.src}
                      alt={frame.alt}
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 720px"
                      className="object-cover"
                    />
                  </motion.div>

                  {/* Shutter blink (screen only) */}
                  <motion.div
                    key={`vignette-${captureTick}`}
                    className="pointer-events-none absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={
                      reduceMotion
                        ? { opacity: 0 }
                        : {
                            opacity: [0, 0.18, 0.0],
                          }
                    }
                    transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                    style={{
                      background:
                        'radial-gradient(ellipse at center, transparent 35%, color-mix(in oklab, var(--foreground) 18%, transparent) 100%)',
                    }}
                  />
                  <motion.div
                    key={`shutter-top-${captureTick}`}
                    className="pointer-events-none absolute inset-x-0 top-0 bg-foreground/10"
                    style={{ mixBlendMode: 'multiply' }}
                    initial={{ height: '0%' }}
                    animate={
                      reduceMotion
                        ? { height: '0%' }
                        : {
                            height: ['0%', '52%', '0%'],
                          }
                    }
                    transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                  <motion.div
                    key={`shutter-bottom-${captureTick}`}
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-foreground/10"
                    style={{ mixBlendMode: 'multiply' }}
                    initial={{ height: '0%' }}
                    animate={
                      reduceMotion
                        ? { height: '0%' }
                        : {
                            height: ['0%', '52%', '0%'],
                          }
                    }
                    transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                  />

                  <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-border/35" />
                </div>
              </div>

              <div className="relative bg-muted/10">
                <div className="pointer-events-none absolute right-2 top-10 h-16 w-12 rounded-2xl border border-border/35 bg-muted/15" />
                <div className="relative flex h-full flex-col items-end px-3 py-4">
                  <HardwareButton />
                  <div className="mt-3" />
                  <HardwareButton />
                  <div className="flex-1" />
                  <div className="translate-x-1">
                    <HardwareDial />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <HardwareButton />
                    <HardwareButton />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HardwareButton() {
  return (
    <div
      className="relative size-7 rounded-full border border-border/60 bg-background/35 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_70%,transparent),inset_0_-1px_0_color-mix(in_oklab,var(--foreground)_12%,transparent)]"
      aria-hidden="true"
    >
      <div className="absolute inset-1 rounded-full border border-border/40" />
    </div>
  );
}

function HardwareDial() {
  return (
    <div
      className="relative size-12 rounded-full border border-border/60 bg-background/35 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_70%,transparent),inset_0_-1px_0_color-mix(in_oklab,var(--foreground)_12%,transparent)]"
      aria-hidden="true"
    >
      <div className="absolute inset-1 rounded-full border border-border/50" />
      <div className="absolute inset-[0.9rem] rounded-full border border-border/60 bg-muted/30" />
      <div className="absolute left-1/2 top-1.5 h-2 w-px -translate-x-1/2 rounded-full bg-foreground/40" />
    </div>
  );
}
