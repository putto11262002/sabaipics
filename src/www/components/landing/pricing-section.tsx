import { ArrowRight, ArrowRightLeft } from 'lucide-react';
import Image from 'next/image';

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

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-24">

      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
        <div className="overflow-hidden rounded-3xl bg-card/72 backdrop-blur-xl shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_85%,transparent),0_24px_60px_color-mix(in_oklab,var(--foreground)_8%,transparent)]">
          <div className="grid lg:grid-cols-12">
          <article className="relative flex min-h-[360px] flex-col justify-between p-6 sm:p-8 lg:col-span-6">
            <div>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Sign up free. Get{' '}
                <span className="bg-[linear-gradient(135deg,var(--primary),var(--primary-end))] bg-clip-text text-transparent">
                  1,000 credits
                </span>{' '}
                for real event workloads.
              </h2>
              <p className="mt-4 max-w-md text-lg text-muted-foreground sm:text-xl">
                <span className="font-medium text-foreground">Pay as you go</span>{' '}
                <span>after your free credits are used.</span>
              </p>
            </div>

            <div className="mt-8">
              <a
                href="https://app.framefast.io/sign-up"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </article>

          <article className="flex min-h-[360px] flex-col border-t border-border/70 p-6 sm:p-7 lg:col-span-3 lg:border-l lg:border-t-0">
            <div className="flex h-full flex-col">
              <p className="text-lg font-medium tracking-tight text-foreground sm:text-xl">
                1 credit = 1 image
              </p>

              <div className="grid h-28 place-items-center py-2">
                <div className="flex w-full items-center justify-between">
                  <Image
                    src="/credit.svg"
                    alt="Credit"
                    width={96}
                    height={96}
                    className="h-[46px] w-auto max-w-[40%] object-contain"
                  />

                  <ArrowRightLeft className="size-5 text-muted-foreground/80" />

                  <Image
                    src="/image.svg"
                    alt="Image"
                    width={96}
                    height={96}
                    className="h-[46px] w-auto max-w-[40%] object-contain"
                  />
                </div>
              </div>

              <div className="mt-auto divide-y divide-border/80">
                <div className="py-3.5">
                  <p className="text-sm text-muted-foreground">Upload requirements</p>
                  <p className="text-base text-foreground">JPEG, PNG, WebP · 10 MB</p>
                </div>
                <div className="py-3.5">
                  <p className="text-sm text-muted-foreground">Image retention</p>
                  <p className="text-base text-foreground">1 month</p>
                </div>
                <div className="py-3.5">
                  <p className="text-sm text-muted-foreground">Credit expiration</p>
                  <p className="text-base text-foreground">Paid top-up credits: 6 months</p>
                </div>
              </div>
            </div>
          </article>

          <article className="flex min-h-[360px] flex-col border-t border-border/70 p-6 sm:p-7 lg:col-span-3 lg:border-l lg:border-t-0">
            <div className="flex h-full flex-col">
              <p className="text-lg font-medium tracking-tight text-foreground sm:text-xl">
                Top-up tiers
              </p>
              <div className="grid h-28 place-items-center py-2">
                <Image
                  src="/credit_stack.svg"
                  alt="Credit stack tiers illustration"
                  width={300}
                  height={82}
                  className="h-[60px] w-auto max-w-full object-contain"
                />
              </div>

              <div className="mt-auto divide-y divide-border/80">
                {tierRows.map((tier, index) => (
                  <div key={tier.amount} className="flex items-center justify-between gap-3 py-3.5">
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
            Need high-volume event pricing? Contact sales
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
