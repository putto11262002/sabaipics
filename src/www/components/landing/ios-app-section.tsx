import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import iosAppScreenshot from '@/assets/ios-app-screenshot.webp';
import { SectionContainer } from './section-container';

export async function IosAppSection() {
  const locale = await getLocale();
  const t = await getTranslations('IosApp');
  const appStoreBadgeSrc =
    locale === 'th' ? '/badges/app-store-th.svg' : '/badges/app-store-en.svg';
  const appStoreAlt = locale === 'th' ? 'ดาวน์โหลดบน App Store' : 'Download on the App Store';

  return (
    <section id="ios-app" className="scroll-mt-24 bg-muted/30 py-16 sm:py-20">
      <SectionContainer>
        <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card text-foreground shadow-[0_36px_90px_-58px_color-mix(in_oklab,var(--foreground)_12%,transparent)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 88% at 12% 92%, color-mix(in oklab, var(--primary-end) 28%, transparent) 0%, transparent 64%), radial-gradient(118% 82% at 88% 86%, color-mix(in oklab, var(--primary) 28%, transparent) 0%, transparent 64%)',
            }}
          />

          <div className="relative grid items-center gap-10 p-6 sm:p-8 lg:grid-cols-2 lg:gap-14 lg:p-12">
            <div className="order-2 lg:order-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('label')}
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                {t('title')}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t('description')}
              </p>

              <div className="mt-7">
                <a
                  href="https://apps.apple.com/app/id0000000000"
                  aria-label="Download on the App Store"
                  className="inline-flex w-fit transition-opacity hover:opacity-90"
                >
                  <Image
                    src={appStoreBadgeSrc}
                    alt={appStoreAlt}
                    width={162}
                    height={48}
                    className="h-11 w-auto"
                  />
                </a>
              </div>
            </div>

            <div className="order-1 lg:order-2" aria-hidden="true">
              <div className="mx-auto w-full max-w-[360px] rounded-[2.4rem] border border-border/60 bg-[linear-gradient(165deg,color-mix(in_oklab,var(--primary)_12%,transparent)_0%,color-mix(in_oklab,var(--primary)_4%,transparent)_58%,color-mix(in_oklab,var(--primary)_8%,transparent)_100%)] p-3 shadow-[0_26px_64px_-46px_color-mix(in_oklab,var(--foreground)_22%,transparent)] lg:ml-auto">
                <div className="relative aspect-[9/19] overflow-hidden rounded-[1.8rem] border border-border/50 bg-background">
                  <Image
                    src={iosAppScreenshot}
                    alt="FrameFast iOS app screenshot"
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
      </SectionContainer>
    </section>
  );
}
