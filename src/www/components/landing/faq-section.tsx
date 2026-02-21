'use client';

import { useTranslations } from 'next-intl';

const FAQ_ITEMS = ['accuracy', 'privacy', 'formats', 'credits', 'upload', 'sales'] as const;
const SALES_EMAIL = 'sales@framefast.io';

export function FaqSection() {
  const t = useTranslations('Faq');

  return (
    <section id="faq" className="scroll-mt-24 bg-muted/30 py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              {t('title')}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>

          <div className="lg:col-span-8">
            <div className="divide-y divide-border/80 border-y border-border/80">
              {FAQ_ITEMS.map((item) => (
                <details key={item} className="group">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 px-1 py-6 marker:content-none">
                    <span className="text-lg font-medium text-foreground">
                      {t(`items.${item}.question`)}
                    </span>
                    <span className="relative mt-0.5 size-6 shrink-0">
                      <span className="absolute left-0 top-1/2 h-px w-6 -translate-y-1/2 bg-foreground/80" />
                      <span className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-foreground/80 transition-opacity duration-200 group-open:opacity-0" />
                    </span>
                  </summary>
                  <p className="max-w-2xl px-1 pb-6 text-sm leading-6 text-muted-foreground">
                    {item === 'sales' ? (
                      <>
                        {t(`items.${item}.answer`, { email: SALES_EMAIL }).split('{email}')[0]}
                        <a
                          className="font-medium text-foreground underline-offset-4 hover:underline"
                          href={`mailto:${SALES_EMAIL}`}
                        >
                          {SALES_EMAIL}
                        </a>
                        {t(`items.${item}.answer`, { email: SALES_EMAIL }).split('{email}')[1]}
                      </>
                    ) : (
                      t(`items.${item}.answer`)
                    )}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
