import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

import { RoundedButton } from '@/components/ui/rounded-button';
import { Badge } from '@/shared/components/ui/badge';
import { HeroEventStage } from '@/components/landing/hero-event-stage';

// Reference-inspired experiment: cool-to-warm field with layered hotspots.
const HERO_GRADIENT_EXPERIMENT =
  'linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--primary-end) 4%, transparent) 48%, color-mix(in oklab, var(--primary-end) 8%, transparent) 68%, color-mix(in oklab, var(--primary) 12%, transparent) 100%), radial-gradient(142% 90% at 12% 106%, color-mix(in oklab, var(--primary-end) 45%, transparent) 0%, color-mix(in oklab, var(--primary-end) 22%, transparent) 44%, transparent 80%), radial-gradient(142% 90% at 88% 106%, color-mix(in oklab, var(--primary) 45%, transparent) 0%, color-mix(in oklab, var(--primary) 22%, transparent) 44%, transparent 80%), radial-gradient(176% 114% at 50% 122%, color-mix(in oklab, var(--primary) 32%, var(--primary-end) 30%) 0%, color-mix(in oklab, var(--primary) 10%, transparent) 58%, transparent 88%)';

/*
const HERO_GRADIENT_EXPERIMENT =
  'linear-gradient(180deg, var(--background) 0%, var(--background) 33%, color-mix(in oklab, var(--background) 90%, var(--primary-end)) 52%, color-mix(in oklab, var(--background) 70%, var(--primary)) 100%), linear-gradient(90deg, color-mix(in oklab, var(--primary-end) 30%, transparent) 0%, color-mix(in oklab, var(--primary-end) 12%, transparent) 34%, color-mix(in oklab, var(--primary) 16%, transparent) 62%, color-mix(in oklab, var(--primary) 34%, transparent) 100%), radial-gradient(132% 90% at 16% 116%, color-mix(in oklab, var(--primary-end) 100%, transparent) 0%, color-mix(in oklab, var(--primary-end) 58%, transparent) 38%, transparent 74%), radial-gradient(118% 84% at 86% 116%, color-mix(in oklab, var(--primary) 100%, transparent) 0%, color-mix(in oklab, var(--primary) 58%, transparent) 38%, transparent 74%), radial-gradient(124% 78% at 52% 120%, color-mix(in oklab, var(--primary) 72%, color-mix(in oklab, var(--primary-end) 62%, transparent)) 0%, color-mix(in oklab, var(--primary) 28%, transparent) 46%, transparent 78%), radial-gradient(168% 108% at 52% 134%, color-mix(in oklab, var(--primary) 42%, color-mix(in oklab, var(--primary-end) 46%, transparent)) 0%, transparent 80%)';
*/

export function LandingHero() {
  const t = useTranslations('Hero');
  const locale = useLocale();
  const isThai = locale === 'th';

  return (
    <section className="pb-14 pt-8 sm:pb-20 sm:pt-10 bg-muted/30">
      <div className="mx-auto w-[min(100vw-2rem,1700px)] sm:w-[min(100vw-2.75rem,1700px)] lg:w-[min(100vw-3.25rem,1700px)]">
        <div
          className="relative overflow-hidden rounded-b-[2rem] bg-muted/30"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: HERO_GRADIENT_EXPERIMENT,
            }}
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-12 text-center sm:pb-16 sm:pt-16">
            <div className="flex justify-center">
              <Badge variant="secondary" className="text-xs font-medium tracking-wide">
                1,000 free credits to start
              </Badge>
            </div>

            <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              {t.rich('title', {
                highlight: (chunks) => (
                    <span className="relative inline-block">
                      {chunks}
                      {!isThai && (
                        <span
                          className="absolute -bottom-1 left-0 h-2 w-full -rotate-1 rounded-sm"
                          style={{
                            background:
                              'linear-gradient(90deg, var(--primary-end) 0%, var(--primary) 100%)',
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                ),
              })}
            </h1>

            <p className="mx-auto mt-4 max-w-3xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t('description')}
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <RoundedButton asChild>
                <Link href="https://app.framefast.io/sign-up">Start free trial</Link>
              </RoundedButton>
            </div>
          </div>

          <div className="relative mx-auto mt-4 max-w-[340px] px-3 pb-6 sm:mt-6 sm:max-w-[780px] sm:px-6 sm:pb-8 lg:max-w-[720px]">
            <HeroEventStage className="mx-auto" />
          </div>
        </div>
      </div>
    </section>
  );
}
