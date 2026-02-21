'use client';

import * as React from 'react';

import { cn } from '@/shared/utils/ui';

export function UploadCameraStage({ className }: { className?: string }) {
  const metrics = React.useMemo(
    () => ({
      // Camera body rounding - using cqw (container query width) for responsive scaling
      camRadius: 'clamp(0.6rem, 6cqw, 1.2rem)',
      // Viewfinder size + placement
      vfW: 'clamp(4rem, 28cqw, 8rem)',
      vfH: 'clamp(1rem, 8cqw, 2rem)',
      vfLeft: '46%',
      // Top border eraser width (to visually attach viewfinder)
      eraserW: 'clamp(5rem, 42cqw, 12rem)',
      // Shutter button size + placement
      shW: 'clamp(1.5rem, 10cqw, 3rem)',
      shH: 'clamp(0.8rem, 5cqw, 1.5rem)',
      shRight: 'clamp(0.4rem, 4cqw, 1.5rem)',
      // Control panel sizing
      controlW: 'clamp(2.5rem, 22cqw, 6rem)',
      controlPadX: 'clamp(0.3rem, 2cqw, 0.8rem)',
      controlPadY: 'clamp(0.4rem, 2.5cqw, 1rem)',
      controlGap: 'clamp(0.2rem, 1.5cqw, 0.6rem)',
      btnSize: 'clamp(1rem, 4cqw, 1.8rem)',
      dialSize: 'clamp(1.5rem, 6cqw, 3rem)',
      // Screen rounding
      screenRadius: 'clamp(0.5rem, 3cqw, 1rem)',
    }),
    [],
  );

  return (
    <div className={cn('w-full', className)} style={{ containerType: 'inline-size' }}>
      <div className="relative">

        {/* Contact shadow */}
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

        {/* Camera body - light/card-like with primary accents */}
        <div
          className="relative border border-primary/20 p-1 backdrop-blur-2xl shadow-[0_34px_80px_-52px_color-mix(in_oklab,var(--foreground)_26%,transparent)]"
          style={{
            borderRadius: metrics.camRadius,
            background: 'color-mix(in oklab, var(--primary) 8%, transparent)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--primary-end)_30%,var(--primary)),inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_15%,transparent)]"
            style={{ borderRadius: metrics.camRadius }}
          />

          {/* Erase top border behind viewfinder */}
          <div
            className="pointer-events-none absolute left-1/2 top-0 z-10 h-[2px] -translate-x-1/2"
            style={{ width: metrics.eraserW, background: 'color-mix(in oklab, var(--primary) 8%, transparent)' }}
            aria-hidden="true"
          />

          {/* Viewfinder */}
          <div
            className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 -translate-y-full border border-primary/40 backdrop-blur-xl"
            style={{
              left: metrics.vfLeft,
              width: metrics.vfW,
              height: metrics.vfH,
              borderRadius: '2.5rem 2.5rem 0 0',
              borderBottom: 'none',
              background:
                'linear-gradient(170deg, color-mix(in oklab, var(--primary) 44%, transparent) 0%, color-mix(in oklab, var(--primary) 20%, transparent) 100%)',
            }}
            aria-hidden="true"
          />

          {/* Shutter button */}
          <div
            className="pointer-events-none absolute top-0 z-20 hidden -translate-y-full sm:block"
            style={{ right: metrics.shRight }}
            aria-hidden="true"
          >
            <div className="relative" style={{ width: metrics.shW, height: metrics.shH }}>
              <div
                className="absolute inset-0 rounded-t-xl border-x border-t border-primary/40 shadow-[0_18px_36px_-28px_color-mix(in_oklab,var(--foreground)_18%,transparent)]"
                style={{
                  background:
                    'linear-gradient(180deg, color-mix(in oklab, var(--primary) 42%, transparent), color-mix(in oklab, var(--primary) 18%, transparent))',
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  left: '14%',
                  top: '18%',
                  height: '14%',
                  width: '58%',
                  background: 'color-mix(in oklab, var(--primary) 40%, transparent)',
                }}
              />
              <div
                className="absolute rounded-full border border-primary/40"
                style={{
                  right: '12%',
                  top: '32%',
                  height: '34%',
                  width: '20%',
                  background: 'color-mix(in oklab, var(--primary) 24%, transparent)',
                }}
              />
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-xl border border-primary/35 backdrop-blur-xl shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_28%,transparent),inset_0_12px_30px_-20px_color-mix(in_oklab,var(--primary)_22%,transparent)]"
            style={{
              background:
                'linear-gradient(155deg, color-mix(in oklab, var(--primary) 38%, transparent) 0%, color-mix(in oklab, var(--primary) 12%, transparent) 100%)',
            }}
          >
            <div
              className="grid min-w-0 p-2"
              style={{ gridTemplateColumns: `minmax(0, 1fr) ${metrics.controlW}` }}
            >
              <div className="relative min-w-0 w-full aspect-[4/3]">
                <div
                  className="relative h-full w-full overflow-hidden shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_32%,transparent),0_10px_24px_-24px_color-mix(in_oklab,var(--foreground)_16%,transparent)]"
                  style={{
                    borderRadius: metrics.screenRadius,
                    background: 'linear-gradient(135deg, color-mix(in oklab, var(--primary) 8%, var(--card)) 0%, color-mix(in oklab, var(--primary-end) 12%, var(--card)) 100%)',
                  }}
                />
              </div>

              <div className="relative min-w-0">
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
                  <UploadHardwareButton />
                  <UploadHardwareButton />
                  <div className="flex-1" />
                  <div className="translate-x-1">
                    <UploadHardwareDial />
                  </div>
                  <div
                    className="hidden min-[360px]:flex items-center"
                    style={{ gap: metrics.controlGap }}
                  >
                    <UploadHardwareButton />
                    <UploadHardwareButton />
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

function UploadHardwareButton() {
  return (
    <div
      className="relative rounded-full border border-primary/40 backdrop-blur-md shadow-[inset_0_1px_0_color-mix(in_oklab,var(--primary-end)_34%,var(--primary)),inset_0_-1px_0_color-mix(in_oklab,var(--primary)_24%,transparent)]"
      style={{
        width: 'clamp(0.8rem, 4cqw, 1.8rem)',
        height: 'clamp(0.8rem, 4cqw, 1.8rem)',
        background:
          'linear-gradient(160deg, color-mix(in oklab, var(--primary) 34%, transparent) 0%, color-mix(in oklab, var(--primary) 12%, transparent) 100%)',
      }}
      aria-hidden="true"
    >
      <div
        className="absolute rounded-full border border-primary/36"
        style={{ inset: '18%' }}
      />
    </div>
  );
}

function UploadHardwareDial() {
  return (
    <div
      className="relative rounded-full border border-primary/40 backdrop-blur-md shadow-[inset_0_1px_0_color-mix(in_oklab,var(--primary-end)_34%,var(--primary)),inset_0_-1px_0_color-mix(in_oklab,var(--primary)_24%,transparent)]"
      style={{
        width: 'clamp(1.2rem, 6cqw, 3rem)',
        height: 'clamp(1.2rem, 6cqw, 3rem)',
        background:
          'linear-gradient(165deg, color-mix(in oklab, var(--primary) 34%, transparent) 0%, color-mix(in oklab, var(--primary) 12%, transparent) 100%)',
      }}
      aria-hidden="true"
    >
      <div
        className="absolute rounded-full border border-primary/36"
        style={{ inset: '12%' }}
      />
      <div
        className="absolute rounded-full border border-primary/32"
        style={{ inset: '32%', background: 'color-mix(in oklab, var(--primary) 26%, transparent)' }}
      />
      <div className="absolute left-1/2 top-1 h-1.5 w-px -translate-x-1/2 rounded-full bg-primary-end/25" />
    </div>
  );
}
