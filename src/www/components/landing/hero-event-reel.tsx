'use client';

import * as React from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/shared/utils/ui';

type ReelFrame = {
  key: string;
  src: string;
  alt: string;
};

const frame: ReelFrame = {
  key: 'event-i',
  src: '/landing/i.png',
  alt: 'Event photo example',
};

export function HeroEventReel({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [captureTick, setCaptureTick] = React.useState(0);

  React.useEffect(() => {
    // Temporary: single static image. We still run a subtle "capture" cue.
    const id = window.setInterval(() => setCaptureTick((v) => v + 1), 4200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={cn('mx-auto mt-10 w-full max-w-5xl', className)}>
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
        <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/0 to-background/30" />

        <div className="relative aspect-[16/9] w-full">
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
              sizes="(max-width: 1024px) 100vw, 960px"
              className="object-cover"
            />
          </motion.div>

          {/* Camera capture vibe: shutter blink */}
          <AnimatePresence>
            <motion.div
              key={`vignette-${captureTick}`}
              initial={{ opacity: 0 }}
              animate={
                reduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: [0, 0.18, 0.0],
                    }
              }
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse at center, transparent 35%, color-mix(in oklab, var(--foreground) 18%, transparent) 100%)',
              }}
            />

            <motion.div
              key={`shutter-top-${captureTick}`}
              initial={{ height: '0%' }}
              animate={
                reduceMotion
                  ? { height: '0%' }
                  : {
                      height: ['0%', '52%', '0%'],
                    }
              }
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              className="pointer-events-none absolute inset-x-0 top-0 bg-foreground/10"
              style={{ mixBlendMode: 'multiply' }}
            />
            <motion.div
              key={`shutter-bottom-${captureTick}`}
              initial={{ height: '0%' }}
              animate={
                reduceMotion
                  ? { height: '0%' }
                  : {
                      height: ['0%', '52%', '0%'],
                    }
              }
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-foreground/10"
              style={{ mixBlendMode: 'multiply' }}
            />
          </AnimatePresence>

          {/* Subtle frame */}
          <div className="pointer-events-none absolute inset-3 rounded-xl border border-border/50" />
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Placeholder: static event visual with a subtle capture effect.
      </p>
    </div>
  );
}
