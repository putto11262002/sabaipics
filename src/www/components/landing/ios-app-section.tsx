import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';

export async function IosAppSection() {
  const locale = await getLocale();
  const t = await getTranslations('IosApp');
  const appStoreBadgeSrc = locale === 'th' ? '/badges/app-store-th.svg' : '/badges/app-store-en.svg';
  const appStoreAlt = locale === 'th' ? 'ดาวน์โหลดบน App Store' : 'Download on the App Store';

  return (
    <section id="ios-app" className="scroll-mt-24 bg-muted/30 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4">
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('label')}</p>
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

            <div className="order-1 lg:order-2">
              <div className="mx-auto w-full max-w-[360px] rounded-[2.4rem] border border-border/60 bg-[linear-gradient(165deg,color-mix(in_oklab,var(--primary)_12%,transparent)_0%,color-mix(in_oklab,var(--primary)_4%,transparent)_58%,color-mix(in_oklab,var(--primary)_8%,transparent)_100%)] p-3 shadow-[0_26px_64px_-46px_color-mix(in_oklab,var(--foreground)_22%,transparent)] lg:ml-auto">
                <div className="relative aspect-[9/19] overflow-hidden rounded-[1.8rem] border border-border/50 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_8%,var(--card))_0%,color-mix(in_oklab,var(--primary)_4%,var(--card))_100%)]">
                  <div className="absolute inset-x-[30%] top-2 h-1 rounded-full bg-border/60" />
                  <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_100%,color-mix(in_oklab,var(--primary)_22%,transparent)_0%,transparent_72%)]" />

                  <div className="absolute left-4 right-4 top-10 space-y-3">
                    <div className="h-3 w-24 rounded-full bg-border/50" />
                    <div className="h-3 w-36 rounded-full bg-border/30" />
                  </div>

                  <div className="absolute inset-x-4 bottom-6 rounded-2xl border border-border/40 bg-background/60 px-4 py-5 backdrop-blur-md">
                    <p className="text-center text-xs font-medium tracking-wide text-muted-foreground">
                      App screenshot placeholder
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
