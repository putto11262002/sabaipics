'use client';

import dynamic from 'next/dynamic';

// Lazy load below-fold sections for code splitting
// SSR enabled for SEO, chunks loaded on client navigation
const FeatureStory = dynamic(
  () => import('./feature-story').then((mod) => ({ default: mod.FeatureStory })),
  { ssr: true, loading: () => <SectionSkeleton /> }
);

const UploadWaySection = dynamic(
  () => import('./upload-way-section').then((mod) => ({ default: mod.UploadWaySection })),
  { ssr: true, loading: () => <SectionSkeleton /> }
);

const PricingSection = dynamic(
  () => import('./pricing-section').then((mod) => ({ default: mod.PricingSection })),
  { ssr: true, loading: () => <SectionSkeleton /> }
);

const IosAppSection = dynamic(
  () => import('./ios-app-section').then((mod) => ({ default: mod.IosAppSection })),
  { ssr: true, loading: () => <SectionSkeleton /> }
);

const FaqSection = dynamic(
  () => import('./faq-section').then((mod) => ({ default: mod.FaqSection })),
  { ssr: true, loading: () => <SectionSkeleton /> }
);

function SectionSkeleton() {
  return (
    <div className="min-h-[400px] animate-pulse bg-muted/50" />
  );
}

export function LazyBelowFold() {
  return (
    <>
      <FeatureStory />
      <UploadWaySection />
      <PricingSection />
      <IosAppSection />
      <FaqSection />
    </>
  );
}
