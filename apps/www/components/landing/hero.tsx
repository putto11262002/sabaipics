'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { RoundedButton } from '@/components/ui/rounded-button';
import { Badge } from '@/components/ui/badge';
import { HeroEventStage } from '@/components/landing/hero-event-stage';

export function LandingHero() {
  const t = useTranslations('Hero');

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:pb-24 sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="flex justify-center">
            <Badge variant="secondary" className="text-xs font-medium tracking-wide">
              Free trial includes 1000 image uploads
            </Badge>
          </div>

          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {t('title')}
          </h1>

          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t('description')}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <RoundedButton asChild>
              <Link href="#pricing">Start free trial</Link>
            </RoundedButton>
            <RoundedButton asChild variant="outline">
              <Link href="#features">See features</Link>
            </RoundedButton>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
          className="mt-16 flex justify-center"
        >
          <div className="w-full max-w-3xl px-2 pt-10">
            <HeroEventStage className="mx-auto" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
