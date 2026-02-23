import { setRequestLocale } from 'next-intl/server';
import { FaqSection } from '@/components/landing/faq-section';
import { Footer } from '@/components/landing/footer';
import { LandingHero } from '@/components/landing/hero';
import { IosAppSection } from '@/components/landing/ios-app-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { SiteNav } from '@/components/site-nav';
import { FeatureStory } from '@/components/landing/feature-story';
import { UploadWaySection } from '@/components/landing/upload-way-section';

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
        <FaqSection />
      </main>
      <Footer />
    </div>
  );
}
