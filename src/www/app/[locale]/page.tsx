import { setRequestLocale } from 'next-intl/server';
import { Footer } from '@/components/landing/footer';
import { LandingHero } from '@/components/landing/hero';
import { FeatureStory } from '@/components/landing/feature-story';
import { UploadWaySection } from '@/components/landing/upload-way-section';
import { IosAppSection } from '@/components/landing/ios-app-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { SiteNav } from '@/components/site-nav';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="bg-muted/30">
      <SiteNav />
      <main>
        <LandingHero />
        <FeatureStory />
        <UploadWaySection />
        <PricingSection />
        <IosAppSection />

        <section id="faq" className="scroll-mt-24 py-16">
          <div className="mx-auto max-w-7xl px-4">
            <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-4">
                <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                  Frequently asked questions
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Privacy, attendee flow, and credit-based delivery.
              </p>
            </div>

              <div className="lg:col-span-8">
                <div className="divide-y divide-border/80 border-y border-border/80">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 px-1 py-6 marker:content-none">
                    <span className="text-lg font-medium text-foreground">How accurate is face search?</span>
                    <span className="relative mt-0.5 size-6 shrink-0">
                      <span className="absolute left-0 top-1/2 h-px w-6 -translate-y-1/2 bg-foreground/80" />
                      <span className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-foreground/80 transition-opacity duration-200 group-open:opacity-0" />
                    </span>
                  </summary>
                  <p className="max-w-2xl px-1 pb-6 text-sm leading-6 text-muted-foreground">
                    FrameFast is tuned for real event conditions and typically returns strong matches fast. Guests confirm with one selfie and see their photos in seconds.
                  </p>
                </details>

                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 px-1 py-6 marker:content-none">
                    <span className="text-lg font-medium text-foreground">Is attendee privacy protected?</span>
                    <span className="relative mt-0.5 size-6 shrink-0">
                      <span className="absolute left-0 top-1/2 h-px w-6 -translate-y-1/2 bg-foreground/80" />
                      <span className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-foreground/80 transition-opacity duration-200 group-open:opacity-0" />
                    </span>
                  </summary>
                  <p className="max-w-2xl px-1 pb-6 text-sm leading-6 text-muted-foreground">
                    Yes. Guests only see photos matched to their own selfie. You control album visibility and event access.
                  </p>
                </details>

                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 px-1 py-6 marker:content-none">
                    <span className="text-lg font-medium text-foreground">
                      What formats are supported, and how long are photos retained?
                    </span>
                    <span className="relative mt-0.5 size-6 shrink-0">
                      <span className="absolute left-0 top-1/2 h-px w-6 -translate-y-1/2 bg-foreground/80" />
                      <span className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-foreground/80 transition-opacity duration-200 group-open:opacity-0" />
                    </span>
                  </summary>
                  <p className="max-w-2xl px-1 pb-6 text-sm leading-6 text-muted-foreground">
                    We support JPEG, PNG, and WebP uploads up to 10 MB per image. Event photo access is set to a 30-day window by default (about 1 month).
                  </p>
                </details>

                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 px-1 py-6 marker:content-none">
                    <span className="text-lg font-medium text-foreground">Do free credits expire?</span>
                    <span className="relative mt-0.5 size-6 shrink-0">
                      <span className="absolute left-0 top-1/2 h-px w-6 -translate-y-1/2 bg-foreground/80" />
                      <span className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-foreground/80 transition-opacity duration-200 group-open:opacity-0" />
                    </span>
                  </summary>
                  <p className="max-w-2xl px-1 pb-6 text-sm leading-6 text-muted-foreground">
                    Yes. Your 1,000 free credits are valid for 1 month. After that, you can continue with paid top-ups at transparent tier pricing.
                  </p>
                </details>

                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 px-1 py-6 marker:content-none">
                    <span className="text-lg font-medium text-foreground">Which upload methods are supported?</span>
                    <span className="relative mt-0.5 size-6 shrink-0">
                      <span className="absolute left-0 top-1/2 h-px w-6 -translate-y-1/2 bg-foreground/80" />
                      <span className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-foreground/80 transition-opacity duration-200 group-open:opacity-0" />
                    </span>
                  </summary>
                  <p className="max-w-2xl px-1 pb-6 text-sm leading-6 text-muted-foreground">
                    Upload via iOS app, web uploader, or desktop uploader, then deliver through QR and LINE links.
                  </p>
                </details>

                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 px-1 py-6 marker:content-none">
                    <span className="text-lg font-medium text-foreground">Can I talk to sales for high-volume events?</span>
                    <span className="relative mt-0.5 size-6 shrink-0">
                      <span className="absolute left-0 top-1/2 h-px w-6 -translate-y-1/2 bg-foreground/80" />
                      <span className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-foreground/80 transition-opacity duration-200 group-open:opacity-0" />
                    </span>
                  </summary>
                  <p className="max-w-2xl px-1 pb-6 text-sm leading-6 text-muted-foreground">
                    Yes. Email{' '}
                    <a className="font-medium text-foreground underline-offset-4 hover:underline" href="mailto:sales@framefast.io">
                      sales@framefast.io
                    </a>{' '}
                    for volume pricing and support.
                  </p>
                </details>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
