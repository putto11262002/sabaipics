// Server Component - Static shell for instant LCP
import Image from 'next/image';

import { cn } from '@/shared/utils/ui';

import event1 from '@/assets/hero/event1.webp';

export function HeroEventStageShell({ className }: { className?: string }) {
  const metrics = {
    camRadius: 'clamp(0.95rem, 2.4vw, 1.7rem)',
    vfW: 'clamp(6.6rem, 24vw, 11rem)',
    vfH: 'clamp(1.7rem, 5vw, 3rem)',
    vfLeft: '46%',
    eraserW: 'clamp(8.25rem, 36vw, 16rem)',
    shW: 'clamp(2.5rem, 8vw, 4rem)',
    shH: 'clamp(1.3rem, 4vw, 2rem)',
    shRight: 'clamp(0.65rem, 3vw, 2.5rem)',
    controlW: 'clamp(4.35rem, 18vw, 9.5rem)',
    screenRadius: 'clamp(0.8rem, 2.2vw, 1.35rem)',
  };

  return (
    <div className={cn('w-full', className)}>
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

        {/* Camera body */}
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

          {/* Eraser for viewfinder */}
          <div
            className="pointer-events-none absolute left-1/2 top-0 z-10 h-[2px] -translate-x-1/2"
            style={{ width: metrics.eraserW, background: 'rgba(255,255,255,0.08)' }}
            aria-hidden="true"
          />

          {/* Viewfinder */}
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

          {/* Shutter button */}
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

          {/* Screen with static image */}
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
                    {/* Static first frame - LCP image with high priority */}
                    <div className="absolute inset-0">
                      <Image
                        src={event1}
                        alt="Event photo example 1"
                        fill
                        fetchPriority="high"
                        sizes="(max-width: 1024px) 100vw, 720px"
                        className="object-contain"
                      />
                    </div>
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-border/35" />
                  </div>
                </div>
              </div>

              {/* Control panel - static */}
              <ControlPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlPanel() {
  return (
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
          paddingLeft: 'clamp(0.45rem, 1.2vw, 1.15rem)',
          paddingRight: 'clamp(0.45rem, 1.2vw, 1.15rem)',
          paddingTop: 'clamp(0.65rem, 1.5vw, 1.35rem)',
          paddingBottom: 'clamp(0.65rem, 1.5vw, 1.35rem)',
          gap: 'clamp(0.35rem, 0.95vw, 0.9rem)',
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
          style={{ gap: 'clamp(0.35rem, 0.95vw, 0.9rem)' }}
        >
          <HardwareButton />
          <HardwareButton />
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
