'use client';

import * as React from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/shared/utils/ui';

import event1 from '@/assets/hero/event1.webp';
import event2 from '@/assets/hero/event2.webp';
import event3 from '@/assets/hero/event3.webp';
import event4 from '@/assets/hero/event4.webp';

const frames = [
  { src: event1, alt: 'Event photo example 1' },
  { src: event2, alt: 'Event photo example 2' },
  { src: event3, alt: 'Event photo example 3' },
  { src: event4, alt: 'Event photo example 4' },
] as const;

export function HeroEventStage({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [captureTick, setCaptureTick] = React.useState(0);
  const [frameIndex, setFrameIndex] = React.useState(0);

  const [isShutterClosed, setIsShutterClosed] = React.useState(false);

  const metrics = React.useMemo(
    () => ({
      // Camera body rounding
      camRadius: 'clamp(0.95rem, 2.4vw, 1.7rem)',
      // Viewfinder size + placement
      vfW: 'clamp(6.6rem, 24vw, 11rem)',
      vfH: 'clamp(1.7rem, 5vw, 3rem)',
      vfLeft: '46%',
      // Top border eraser width (to visually attach viewfinder)
      eraserW: 'clamp(8.25rem, 36vw, 16rem)',
      // Shutter button size + placement
      shW: 'clamp(2.5rem, 8vw, 4rem)',
      shH: 'clamp(1.3rem, 4vw, 2rem)',
      shRight: 'clamp(0.65rem, 3vw, 2.5rem)',
      // Control panel sizing
      controlW: 'clamp(4.35rem, 18vw, 9.5rem)',
      controlPadX: 'clamp(0.45rem, 1.2vw, 1.15rem)',
      controlPadY: 'clamp(0.65rem, 1.5vw, 1.35rem)',
      controlGap: 'clamp(0.35rem, 0.95vw, 0.9rem)',
      btnSize: 'clamp(1.55rem, 3vw, 2.55rem)',
      dialSize: 'clamp(2.55rem, 5vw, 4.55rem)',
      // Screen rounding
      screenRadius: 'clamp(0.8rem, 2.2vw, 1.35rem)',
    }),
    [],
  );

  React.useEffect(() => {
    if (reduceMotion) return;

    const periodMs = 3200;
    const closeAtMs = 0;
    const swapAtMs = 160;
    const openAtMs = 190;

    const run = () => {
      setCaptureTick((v) => v + 1);
      window.setTimeout(() => setIsShutterClosed(true), closeAtMs);
      window.setTimeout(() => setFrameIndex((v) => (v + 1) % frames.length), swapAtMs);
      window.setTimeout(() => setIsShutterClosed(false), openAtMs);
    };

    run();
    const id = window.setInterval(run, periodMs);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  React.useEffect(() => {
    if (!reduceMotion) return;
    // Reduced motion: keep static, no shutter.
    setIsShutterClosed(false);
  }, [reduceMotion]);

  const currentFrame = frames[frameIndex] ?? frames[0];

  return (
    <div className={cn('w-full', className)}>
      <div className="relative">

        {/* Contact shadow (standout without adding background shapes) */}
        <div
          className="pointer-events-none absolute left-1/2 top-[calc(100%-0.25rem)] -z-10 h-10 w-[92%] -translate-x-1/2 rounded-[999px]"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in oklab, var(--foreground) 12%, transparent) 0%, transparent 72%)',
            filter: 'blur(10px)',
            opacity: 0.35,
          }}
          aria-hidden="true"
        />

        {/* Temporary: no hump/grip. Just the stage body + screen + controls. */}
        <div
          className="relative border border-white/30 p-3 backdrop-blur-2xl shadow-[0_34px_80px_-52px_color-mix(in_oklab,var(--foreground)_26%,transparent)]"
          style={{
            borderRadius: metrics.camRadius,
            background: 'rgba(255,255,255,0.12)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.20)]"
            style={{ borderRadius: metrics.camRadius }}
          />

          {/* Erase top border behind viewfinder so it reads attached */}
          <div
            className="pointer-events-none absolute left-1/2 top-0 z-10 h-[2px] -translate-x-1/2 bg-muted/20"
            style={{ width: metrics.eraserW, background: 'rgba(255,255,255,0.08)' }}
            aria-hidden="true"
          />

          {/* Viewfinder (simple rounded div) */}
          <div
            className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 -translate-y-full border border-white/55 backdrop-blur-xl supports-[backdrop-filter]:bg-white/14"
            style={{
              left: metrics.vfLeft,
              width: metrics.vfW,
              height: metrics.vfH,
              borderRadius: '2.5rem 2.5rem 0 0',
              borderBottom: 'none',
              background:
                'linear-gradient(170deg, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0.2) 100%)',
            }}
            aria-hidden="true"
          />

          {/* Old viewfinder (trapezoid with clipPath) - commented out
          <div
            className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 -translate-y-full overflow-hidden"
            style={{ left: metrics.vfLeft, width: metrics.vfW, height: metrics.vfH }}
            aria-hidden="true"
          >
            <div
              className="relative h-full w-full rounded-2xl bg-transparent shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_55%,transparent)]"
              style={{
                clipPath: 'polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)',
              }}
            />
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
                    'linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--primary) 8%, transparent) 50%, transparent 100%)',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent" />
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
          */}

          {/* Shutter button (top plate, side view; attached, no bottom border) */}
          <div
            className="pointer-events-none absolute top-0 z-20 hidden -translate-y-full sm:block"
            style={{ right: metrics.shRight }}
            aria-hidden="true"
          >
            <div className="relative" style={{ width: metrics.shW, height: metrics.shH }}>
              <div
                className="absolute inset-0 rounded-t-xl border-x border-t border-white/55 shadow-[0_18px_36px_-28px_color-mix(in_oklab,var(--foreground)_18%,transparent)]"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.18))',
                }}
              />
              <div
                className="absolute rounded-full bg-white/40"
                style={{ left: '14%', top: '18%', height: '14%', width: '58%' }}
              />
              <div
                className="absolute rounded-full border border-white/50 bg-white/24"
                style={{ right: '12%', top: '32%', height: '34%', width: '20%' }}
              />
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-xl border border-white/45 bg-white/24 backdrop-blur-xl supports-[backdrop-filter]:bg-white/14 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28),inset_0_12px_30px_-20px_rgba(255,255,255,0.22)]"
            style={{
              background:
                'linear-gradient(155deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.12) 100%)',
            }}
          >
            <div
              className="grid min-w-0 p-2"
              style={{ gridTemplateColumns: `minmax(0, 1fr) ${metrics.controlW}` }}
            >
              <div className="relative min-w-0 w-full aspect-[1.1/1] min-[360px]:aspect-[1.2/1] sm:aspect-[4/3]">
                <div
                  className="relative h-full w-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.42),0_10px_24px_-24px_color-mix(in_oklab,var(--foreground)_16%,transparent)]"
                  style={{ borderRadius: metrics.screenRadius, padding: 'clamp(8px, 1.2vw, 16px)' }}
                >
                  <div
                    className="relative h-full w-full overflow-hidden"
                    style={{ borderRadius: 'calc(var(--radius) + 0.4rem)' }}
                  >
                    <motion.div
                      key={`image-${frameIndex}`}
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
                        src={frameIndex === 0 ? event1 : currentFrame.src}
                        alt={currentFrame.alt}
                        fill
                        priority={frameIndex === 0}
                        loading={frameIndex === 0 ? 'eager' : 'lazy'}
                        sizes="(max-width: 1024px) 100vw, 720px"
                        className="object-contain"
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
                              opacity: isShutterClosed ? 0.32 : 0.0,
                            }
                      }
                      transition={{ duration: 0.12, ease: 'easeOut' }}
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
                              height: isShutterClosed ? '50%' : '0%',
                            }
                      }
                      transition={{ duration: 0.12, ease: 'easeOut' }}
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
                              height: isShutterClosed ? '50%' : '0%',
                            }
                      }
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    />

                    <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-border/35" />
                  </div>
                </div>
              </div>

              <div className="relative min-w-0">
                <div
                  className="pointer-events-none absolute right-2 rounded-2xl border border-white/52"
                  style={{
                    top: 'clamp(2.1rem, 4vw, 2.9rem)',
                    width: 'clamp(2.1rem, 5vw, 3.7rem)',
                    height: 'clamp(2.8rem, 6.2vw, 4.6rem)',
                    background: 'rgba(255,255,255,0.24)',
                  }}
                />
                <div
                  className="relative flex h-full flex-col items-end"
                  style={{
                    paddingLeft: metrics.controlPadX,
                    paddingRight: metrics.controlPadX,
                    paddingTop: metrics.controlPadY,
                    paddingBottom: metrics.controlPadY,
                    gap: metrics.controlGap,
                  }}
                >
                  <HardwareButton />
                  <HardwareButton />
                  <div className="flex-1" />
                  <div className="translate-x-1">
                    <HardwareDial />
                  </div>
                  <div
                    className="hidden min-[360px]:flex items-center"
                    style={{ gap: metrics.controlGap }}
                  >
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
      className="relative rounded-full border border-white/55 bg-white/30 backdrop-blur-md supports-[backdrop-filter]:bg-white/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),inset_0_-1px_0_rgba(255,255,255,0.24)]"
      style={{
        width: 'clamp(1.55rem, 3vw, 2.55rem)',
        height: 'clamp(1.55rem, 3vw, 2.55rem)',
        background:
          'linear-gradient(160deg, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0.2) 100%)',
      }}
      aria-hidden="true"
    >
      <div className="absolute rounded-full border border-white/56" style={{ inset: '18%' }} />
    </div>
  );
}

function HardwareDial() {
  return (
    <div
      className="relative rounded-full border border-white/55 bg-white/30 backdrop-blur-md supports-[backdrop-filter]:bg-white/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),inset_0_-1px_0_rgba(255,255,255,0.24)]"
      style={{
        width: 'clamp(2.55rem, 5vw, 4.55rem)',
        height: 'clamp(2.55rem, 5vw, 4.55rem)',
        background:
          'linear-gradient(165deg, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0.2) 100%)',
      }}
      aria-hidden="true"
    >
      <div className="absolute rounded-full border border-white/56" style={{ inset: '12%' }} />
      <div
        className="absolute rounded-full border border-white/52"
        style={{ inset: '32%', background: 'rgba(255,255,255,0.26)' }}
      />
      <div className="absolute left-1/2 top-1.5 h-2 w-px -translate-x-1/2 rounded-full bg-primary/25" />
    </div>
  );
}
