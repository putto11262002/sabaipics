import { setRequestLocale } from 'next-intl/server';
import dynamic from 'next/dynamic';

import { LandingHero } from '@/components/landing/hero';
import { SiteNav } from '@/components/site-nav';

// Lazy load below-fold sections to reduce initial JS bundle
const FeatureStory = dynamic(
  () => import('@/components/landing/feature-story').then((mod) => mod.FeatureStory),
  { ssr: true, loading: () => <SectionSkeleton /> }
);
const UploadWaySection = dynamic(
  () => import('@/components/landing/upload-way-section').then((mod) => mod.UploadWaySection),
  { ssr: true, loading: () => <SectionSkeleton /> }
);
const PricingSection = dynamic(
  () => import('@/components/landing/pricing-section').then((mod) => mod.PricingSection),
  { ssr: true, loading: () => <SectionSkeleton /> }
);
const IosAppSection = dynamic(
  () => import('@/components/landing/ios-app-section').then((mod) => mod.IosAppSection),
  { ssr: true, loading: () => <SectionSkeleton /> }
);
const FaqSection = dynamic(
  () => import('@/components/landing/faq-section').then((mod) => mod.FaqSection),
  { ssr: true, loading: () => <SectionSkeleton /> }
);
const Footer = dynamic(
  () => import('@/components/landing/footer').then((mod) => mod.Footer),
  { ssr: true, loading: () => <SectionSkeleton /> }
);

function SectionSkeleton() {
  return <div className="h-96" />;
}

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
