import { ArrowRight, ArrowRightLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

type TierRow = {
  amount: string;
  rate: string;
  credits: string;
};

const tierRows: TierRow[] = [
  { amount: '฿50-฿299', rate: '฿0.12/credit', credits: '~416-2,491' },
  { amount: '฿300-฿599', rate: '฿0.11/credit', credits: '~2,727-5,445' },
  { amount: '฿600-฿10,000', rate: '฿0.10/credit', credits: '~6,000-100,000' },
];

function CreditCoin() {
  return (
    <div
      className="relative h-[52px] w-[52px] shrink-0"
      style={{ perspective: '240px' }}
      aria-hidden="true"
    >
      {/* Coin edge (thickness) - positioned behind */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(12deg) rotateY(-18deg) rotateZ(4deg) translateZ(-6px)',
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--primary) 25%, transparent) 0%, color-mix(in oklab, var(--primary) 12%, transparent) 50%, color-mix(in oklab, var(--primary) 25%, transparent) 100%)',
          boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--primary) 18%, transparent)',
        }}
      />
      {/* 3D coin face */}
      <div
        className="relative h-full w-full rounded-full border border-primary/20 backdrop-blur-md"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(12deg) rotateY(-18deg) rotateZ(4deg)',
          background:
            'linear-gradient(145deg, color-mix(in oklab, var(--primary) 18%, transparent) 0%, color-mix(in oklab, var(--primary) 6%, transparent) 100%)',
          boxShadow: `
            inset 2px 2px 4px color-mix(in oklab, var(--primary-end) 25%, transparent),
            inset -1px -1px 3px color-mix(in oklab, var(--primary) 12%, transparent),
            3px 5px 10px color-mix(in oklab, var(--foreground) 18%, transparent)
          `,
        }}
      >
        {/* Inner ring */}
        <div
          className="absolute inset-[16%] rounded-full border border-primary/15"
          style={{
            background: 'color-mix(in oklab, var(--primary) 4%, transparent)',
          }}
        />
        {/* Center C */}
        <div
          className="absolute left-1/2 top-1/2 flex h-[44%] w-[44%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/20 text-lg font-bold"
          style={{
            background:
              'linear-gradient(145deg, color-mix(in oklab, var(--primary) 12%, transparent), color-mix(in oklab, var(--primary) 4%, transparent))',
            color: 'var(--primary)',
          }}
        >
          C
        </div>
        {/* Glass shine */}
        <div
          className="absolute left-[10%] top-[8%] h-[35%] w-[40%] rounded-full"
          style={{
            background:
              'linear-gradient(155deg, color-mix(in oklab, var(--primary-end) 28%, transparent) 0%, transparent 65%)',
          }}
        />
      </div>
    </div>
  );
}

function CreditStack() {
  return (
    <div
      className="relative h-[52px] w-full max-w-[130px] shrink-0"
      style={{ perspective: '240px' }}
      aria-hidden="true"
    >
      {/* Coin 1 */}
      <div
        className="absolute left-0 top-0 h-[52px] w-[52px]"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(12deg) rotateY(-18deg) rotateZ(4deg) translateZ(0px)',
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklab, var(--primary) 15%, transparent) 0%, color-mix(in oklab, var(--primary) 7%, transparent) 50%, color-mix(in oklab, var(--primary) 15%, transparent) 100%)',
            boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--primary) 12%, transparent)',
          }}
        />
        <div
          className="absolute inset-0 rounded-full border border-primary/15 backdrop-blur-md"
          style={{
            background:
              'linear-gradient(145deg, color-mix(in oklab, var(--primary) 12%, transparent) 0%, color-mix(in oklab, var(--primary) 4%, transparent) 100%)',
            boxShadow:
              'inset 2px 2px 4px color-mix(in oklab, var(--primary-end) 18%, transparent), inset -1px -1px 3px color-mix(in oklab, var(--primary) 8%, transparent), 2px 4px 8px color-mix(in oklab, var(--foreground) 14%, transparent)',
          }}
        >
          <div
            className="absolute inset-[16%] rounded-full border border-primary/10"
            style={{ background: 'color-mix(in oklab, var(--primary) 3%, transparent)' }}
          />
          <div
            className="absolute left-1/2 top-1/2 flex h-[44%] w-[44%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/15 text-lg font-bold"
            style={{
              background:
                'linear-gradient(145deg, color-mix(in oklab, var(--primary) 8%, transparent), color-mix(in oklab, var(--primary) 3%, transparent))',
              color: 'var(--primary)',
            }}
          >
            C
          </div>
          <div
            className="absolute left-[10%] top-[8%] h-[35%] w-[40%] rounded-full"
            style={{
              background:
                'linear-gradient(155deg, color-mix(in oklab, var(--primary-end) 18%, transparent) 0%, transparent 65%)',
            }}
          />
        </div>
      </div>

      {/* Coin 2 */}
      <div
        className="absolute left-[20px] top-0 h-[52px] w-[52px]"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(12deg) rotateY(-18deg) rotateZ(4deg) translateZ(2px)',
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklab, var(--primary) 15%, transparent) 0%, color-mix(in oklab, var(--primary) 7%, transparent) 50%, color-mix(in oklab, var(--primary) 15%, transparent) 100%)',
            boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--primary) 12%, transparent)',
          }}
        />
        <div
          className="absolute inset-0 rounded-full border border-primary/15 backdrop-blur-md"
          style={{
            background:
              'linear-gradient(145deg, color-mix(in oklab, var(--primary) 12%, transparent) 0%, color-mix(in oklab, var(--primary) 4%, transparent) 100%)',
            boxShadow:
              'inset 2px 2px 4px color-mix(in oklab, var(--primary-end) 18%, transparent), inset -1px -1px 3px color-mix(in oklab, var(--primary) 8%, transparent), 2px 4px 8px color-mix(in oklab, var(--foreground) 14%, transparent)',
          }}
        >
          <div
            className="absolute inset-[16%] rounded-full border border-primary/10"
            style={{ background: 'color-mix(in oklab, var(--primary) 3%, transparent)' }}
          />
          <div
            className="absolute left-1/2 top-1/2 flex h-[44%] w-[44%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/15 text-lg font-bold"
            style={{
              background:
                'linear-gradient(145deg, color-mix(in oklab, var(--primary) 8%, transparent), color-mix(in oklab, var(--primary) 3%, transparent))',
              color: 'var(--primary)',
            }}
          >
            C
          </div>
          <div
            className="absolute left-[10%] top-[8%] h-[35%] w-[40%] rounded-full"
            style={{
              background:
                'linear-gradient(155deg, color-mix(in oklab, var(--primary-end) 18%, transparent) 0%, transparent 65%)',
            }}
          />
        </div>
      </div>

      {/* Coin 3 */}
      <div
        className="absolute left-[40px] top-0 h-[52px] w-[52px]"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(12deg) rotateY(-18deg) rotateZ(4deg) translateZ(4px)',
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklab, var(--primary) 15%, transparent) 0%, color-mix(in oklab, var(--primary) 7%, transparent) 50%, color-mix(in oklab, var(--primary) 15%, transparent) 100%)',
            boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--primary) 12%, transparent)',
          }}
        />
        <div
          className="absolute inset-0 rounded-full border border-primary/15 backdrop-blur-md"
          style={{
            background:
              'linear-gradient(145deg, color-mix(in oklab, var(--primary) 12%, transparent) 0%, color-mix(in oklab, var(--primary) 4%, transparent) 100%)',
            boxShadow:
              'inset 2px 2px 4px color-mix(in oklab, var(--primary-end) 18%, transparent), inset -1px -1px 3px color-mix(in oklab, var(--primary) 8%, transparent), 2px 4px 8px color-mix(in oklab, var(--foreground) 14%, transparent)',
          }}
        >
          <div
            className="absolute inset-[16%] rounded-full border border-primary/10"
            style={{ background: 'color-mix(in oklab, var(--primary) 3%, transparent)' }}
          />
          <div
            className="absolute left-1/2 top-1/2 flex h-[44%] w-[44%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/15 text-lg font-bold"
            style={{
              background:
                'linear-gradient(145deg, color-mix(in oklab, var(--primary) 8%, transparent), color-mix(in oklab, var(--primary) 3%, transparent))',
              color: 'var(--primary)',
            }}
          >
            C
          </div>
          <div
            className="absolute left-[10%] top-[8%] h-[35%] w-[40%] rounded-full"
            style={{
              background:
                'linear-gradient(155deg, color-mix(in oklab, var(--primary-end) 18%, transparent) 0%, transparent 65%)',
            }}
          />
        </div>
      </div>

      {/* Coin 4 */}
      <div
        className="absolute left-[60px] top-0 h-[52px] w-[52px]"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(12deg) rotateY(-18deg) rotateZ(4deg) translateZ(6px)',
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklab, var(--primary) 15%, transparent) 0%, color-mix(in oklab, var(--primary) 7%, transparent) 50%, color-mix(in oklab, var(--primary) 15%, transparent) 100%)',
            boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--primary) 12%, transparent)',
          }}
        />
        <div
          className="absolute inset-0 rounded-full border border-primary/15 backdrop-blur-md"
          style={{
            background:
              'linear-gradient(145deg, color-mix(in oklab, var(--primary) 12%, transparent) 0%, color-mix(in oklab, var(--primary) 4%, transparent) 100%)',
            boxShadow:
              'inset 2px 2px 4px color-mix(in oklab, var(--primary-end) 18%, transparent), inset -1px -1px 3px color-mix(in oklab, var(--primary) 8%, transparent), 2px 4px 8px color-mix(in oklab, var(--foreground) 14%, transparent)',
          }}
        >
          <div
            className="absolute inset-[16%] rounded-full border border-primary/10"
            style={{ background: 'color-mix(in oklab, var(--primary) 3%, transparent)' }}
          />
          <div
            className="absolute left-1/2 top-1/2 flex h-[44%] w-[44%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/15 text-lg font-bold"
            style={{
              background:
                'linear-gradient(145deg, color-mix(in oklab, var(--primary) 8%, transparent), color-mix(in oklab, var(--primary) 3%, transparent))',
              color: 'var(--primary)',
            }}
          >
            C
          </div>
          <div
            className="absolute left-[10%] top-[8%] h-[35%] w-[40%] rounded-full"
            style={{
              background:
                'linear-gradient(155deg, color-mix(in oklab, var(--primary-end) 18%, transparent) 0%, transparent 65%)',
            }}
          />
        </div>
      </div>

      {/* Coin 5 */}
      <div
        className="absolute left-[80px] top-0 h-[52px] w-[52px]"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(12deg) rotateY(-18deg) rotateZ(4deg) translateZ(8px)',
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklab, var(--primary) 15%, transparent) 0%, color-mix(in oklab, var(--primary) 7%, transparent) 50%, color-mix(in oklab, var(--primary) 15%, transparent) 100%)',
            boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--primary) 12%, transparent)',
          }}
        />
        <div
          className="absolute inset-0 rounded-full border border-primary/15 backdrop-blur-md"
          style={{
            background:
              'linear-gradient(145deg, color-mix(in oklab, var(--primary) 12%, transparent) 0%, color-mix(in oklab, var(--primary) 4%, transparent) 100%)',
            boxShadow:
              'inset 2px 2px 4px color-mix(in oklab, var(--primary-end) 18%, transparent), inset -1px -1px 3px color-mix(in oklab, var(--primary) 8%, transparent), 3px 5px 10px color-mix(in oklab, var(--foreground) 18%, transparent)',
          }}
        >
          <div
            className="absolute inset-[16%] rounded-full border border-primary/10"
            style={{ background: 'color-mix(in oklab, var(--primary) 3%, transparent)' }}
          />
          <div
            className="absolute left-1/2 top-1/2 flex h-[44%] w-[44%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/15 text-lg font-bold"
            style={{
              background:
                'linear-gradient(145deg, color-mix(in oklab, var(--primary) 8%, transparent), color-mix(in oklab, var(--primary) 3%, transparent))',
              color: 'var(--primary)',
            }}
          >
            C
          </div>
          <div
            className="absolute left-[10%] top-[8%] h-[35%] w-[40%] rounded-full"
            style={{
              background:
                'linear-gradient(155deg, color-mix(in oklab, var(--primary-end) 18%, transparent) 0%, transparent 65%)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function PhotoPrint() {
  return (
    <div
      className="relative h-[52px] w-[52px] shrink-0"
      style={{ perspective: '240px' }}
      aria-hidden="true"
    >
      {/* Photo back/thickness */}
      <div
        className="absolute inset-0 rounded-sm"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(12deg) rotateY(-18deg) rotateZ(4deg) translateZ(-6px)',
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--primary) 25%, transparent) 0%, color-mix(in oklab, var(--primary) 12%, transparent) 50%, color-mix(in oklab, var(--primary) 25%, transparent) 100%)',
          boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--primary) 18%, transparent)',
        }}
      />
      {/* Photo front - Polaroid style */}
      <div
        className="relative h-full w-full rounded-sm border border-primary/20 backdrop-blur-md"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(12deg) rotateY(-18deg) rotateZ(4deg)',
          background:
            'linear-gradient(145deg, color-mix(in oklab, var(--primary) 18%, transparent) 0%, color-mix(in oklab, var(--primary) 6%, transparent) 100%)',
          padding: '4px 4px 12px 4px',
          boxShadow: `
            inset 2px 2px 4px color-mix(in oklab, var(--primary-end) 25%, transparent),
            inset -1px -1px 3px color-mix(in oklab, var(--primary) 12%, transparent),
            3px 5px 10px color-mix(in oklab, var(--foreground) 18%, transparent)
          `,
        }}
      >
        {/* Photo image area */}
        <div
          className="relative h-[calc(100%-8px)] w-full overflow-hidden rounded-[2px] border border-primary/15"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklab, var(--primary-end) 25%, transparent) 0%, color-mix(in oklab, var(--primary-end) 12%, transparent) 100%)',
          }}
        >
          {/* Sun */}
          <div
            className="absolute right-[18%] top-[18%] h-[16%] w-[16%] rounded-full border border-primary-end/20"
            style={{
              background:
                'radial-gradient(circle, color-mix(in oklab, var(--primary-end) 40%, transparent) 0%, transparent 70%)',
            }}
          />
          {/* Mountains with curves */}
          <svg
            className="absolute bottom-0 left-0 h-full w-full"
            viewBox="0 0 44 36"
            preserveAspectRatio="none"
          >
            {/* Back mountain */}
            <path
              d="M0 36 L0 22 Q8 14 15 20 Q22 26 28 18 Q36 8 44 16 L44 36 Z"
              fill="color-mix(in oklab, var(--primary) 20%, transparent)"
            />
            {/* Front mountain */}
            <path
              d="M0 36 L0 28 Q10 20 18 26 Q26 32 32 22 Q40 12 44 24 L44 36 Z"
              fill="color-mix(in oklab, var(--primary) 30%, transparent)"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export async function PricingSection() {
  const t = await getTranslations('Pricing');

  return (
    <section id="pricing" className="scroll-mt-24 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
        <div className="overflow-hidden rounded-3xl bg-card/72 backdrop-blur-xl shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_85%,transparent),0_24px_60px_color-mix(in_oklab,var(--foreground)_8%,transparent)]">
          <div className="grid lg:grid-cols-12">
            <article className="relative flex min-h-[360px] flex-col justify-between p-6 sm:p-8 lg:col-span-6">
              <div>
                <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  {t.rich('title', {
                    credits: (chunks) => (
                      <span className="bg-[linear-gradient(135deg,var(--primary),var(--primary-end))] bg-clip-text text-transparent">
                        {chunks}
                      </span>
                    ),
                  })}
                </h2>
                <p className="mt-4 max-w-md text-lg text-muted-foreground sm:text-xl">
                  {t.rich('subtitle', {
                    highlight: (chunks) => (
                      <span className="font-medium text-foreground">{chunks}</span>
                    ),
                  })}
                </p>
              </div>

              <div className="mt-8">
                <a
                  href="https://app.framefast.io/sign-up"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t('cta')}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </article>

            <article className="flex min-h-[360px] flex-col border-t border-border/70 p-6 sm:p-7 lg:col-span-3 lg:border-l lg:border-t-0">
              <div className="flex h-full flex-col">
                <p className="text-lg font-medium tracking-tight text-foreground sm:text-xl">
                  {t('creditEquivalence')}
                </p>

                <div className="grid h-28 place-items-center py-2">
                  <div className="flex w-full items-center justify-between">
                    <CreditCoin />

                    <ArrowRightLeft className="size-5 text-muted-foreground/80" />

                    <PhotoPrint />
                  </div>
                </div>

                <div className="mt-auto divide-y divide-border/80">
                  <div className="py-3.5">
                    <p className="text-sm text-muted-foreground">{t('uploadRequirements')}</p>
                    <p className="text-base text-foreground">{t('uploadFormats')}</p>
                  </div>
                  <div className="py-3.5">
                    <p className="text-sm text-muted-foreground">{t('imageRetention')}</p>
                    <p className="text-base text-foreground">{t('imageRetentionValue')}</p>
                  </div>
                  <div className="py-3.5">
                    <p className="text-sm text-muted-foreground">{t('creditExpiration')}</p>
                    <p className="text-base text-foreground">{t('creditExpirationValue')}</p>
                  </div>
                </div>
              </div>
            </article>

            <article className="flex min-h-[360px] flex-col border-t border-border/70 p-6 sm:p-7 lg:col-span-3 lg:border-l lg:border-t-0">
              <div className="flex h-full flex-col">
                <p className="text-lg font-medium tracking-tight text-foreground sm:text-xl">
                  {t('topupTiers')}
                </p>
                <div className="grid h-28 place-items-center py-2">
                  <CreditStack />
                </div>

                <div className="mt-auto divide-y divide-border/80">
                  {tierRows.map((tier, index) => (
                    <div
                      key={tier.amount}
                      className="flex items-center justify-between gap-3 py-3.5"
                    >
                      <div>
                        <p className="text-base font-medium text-foreground">{tier.amount}</p>
                        <p
                          className="text-sm"
                          style={{
                            color:
                              index === 0
                                ? 'color-mix(in oklab, var(--primary) 45%, var(--primary-end) 55%)'
                                : index === 1
                                  ? 'color-mix(in oklab, var(--primary) 72%, var(--primary-end) 28%)'
                                  : 'var(--primary)',
                          }}
                        >
                          {tier.rate}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">{tier.credits}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </div>

        <div className="mt-3 rounded-2xl bg-card/72 px-5 py-4 text-center backdrop-blur-xl shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_85%,transparent),0_24px_60px_color-mix(in_oklab,var(--foreground)_8%,transparent)]">
          <a
            href="mailto:sales@framefast.io"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t('salesCta')}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
