'use client';

import Image from 'next/image';
import { useLocale } from 'next-intl';

export function IosAppSection() {
  const locale = useLocale();
  const appStoreBadgeSrc = locale === 'th' ? '/badges/app-store-th.svg' : '/badges/app-store-en.svg';

  return (
    <section id="ios-app" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0d16] text-white shadow-[0_36px_90px_-58px_rgba(5,8,16,0.9)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 88% at 12% 92%, color-mix(in oklab, var(--primary-end) 34%, transparent) 0%, transparent 64%), radial-gradient(118% 82% at 88% 86%, color-mix(in oklab, var(--primary) 34%, transparent) 0%, transparent 64%), linear-gradient(180deg, rgba(8,11,19,0.9) 0%, rgba(10,13,22,0.96) 64%, rgba(12,16,28,0.98) 100%)',
            }}
          />

          <div className="relative grid items-center gap-10 p-6 sm:p-8 lg:grid-cols-2 lg:gap-14 lg:p-12">
            <div className="order-2 lg:order-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">iOS app</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Capture, sync, and deliver from your pocket.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/74 sm:text-lg">
                Import from camera, monitor upload status, and keep event delivery moving while you
                are still on-site.
              </p>

              <div className="mt-7">
                <a
                  href="https://apps.apple.com/app/id0000000000"
                  aria-label="Download on the App Store"
                  className="inline-flex w-fit transition-opacity hover:opacity-90"
                >
                  <Image
                    src={appStoreBadgeSrc}
                    alt={locale === 'th' ? 'ดาวน์โหลดบน App Store' : 'Download on the App Store'}
                    width={162}
                    height={48}
                    className="h-11 w-auto"
                  />
                </a>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <div className="mx-auto w-full max-w-[360px] rounded-[2.4rem] border border-white/16 bg-[linear-gradient(165deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.06)_58%,rgba(255,255,255,0.12)_100%)] p-3 shadow-[0_26px_64px_-46px_rgba(0,0,0,0.85)] lg:ml-auto">
                <div className="relative aspect-[9/19] overflow-hidden rounded-[1.8rem] border border-white/14 bg-[linear-gradient(180deg,rgba(24,30,46,0.96)_0%,rgba(16,20,32,0.98)_100%)]">
                  <div className="absolute inset-x-[30%] top-2 h-1 rounded-full bg-white/30" />
                  <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_100%,color-mix(in_oklab,var(--primary)_28%,transparent)_0%,transparent_72%)]" />

                  <div className="absolute left-4 right-4 top-10 space-y-3">
                    <div className="h-3 w-24 rounded-full bg-white/22" />
                    <div className="h-3 w-36 rounded-full bg-white/12" />
                  </div>

                  <div className="absolute inset-x-4 bottom-6 rounded-2xl border border-white/14 bg-white/8 px-4 py-5 backdrop-blur-md">
                    <p className="text-center text-xs font-medium tracking-wide text-white/72">
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
