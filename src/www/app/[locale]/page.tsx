import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import dynamic from 'next/dynamic';

import { LandingHero } from '@/components/landing/hero';
import { SiteNav } from '@/components/site-nav';
import { SoftwareApplicationJsonLd } from '@/components/seo/json-ld';

const PAGE_METADATA = {
  en: {
    title: 'FrameFast - AI Face Recognition Photo Distribution for Events',
    description:
      'Deliver event photos instantly with AI face search. Guests find their photos in seconds via QR code or LINE. Free 1,000 credits to start.',
  },
  th: {
    title: 'FrameFast - แพลตฟอร์มแชร์ภาพงานอีเวนต์ด้วย AI',
    description:
      'ส่งมอบภาพงานอีเวนต์ทันทีด้วย AI ค้นหาใบหน้า แขกค้นหารูปตัวเองในไม่กี่วินาทีผ่าน QR Code หรือ LINE ทดลองใช้ฟรี 1,000 เครดิต',
  },
} as const;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const meta = PAGE_METADATA[locale as keyof typeof PAGE_METADATA] ?? PAGE_METADATA.en;

  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: `https://framefast.io/${locale}`,
      languages: {
        en: 'https://framefast.io/en',
        th: 'https://framefast.io/th',
      },
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `https://framefast.io/${locale}`,
      siteName: 'FrameFast',
      locale: locale === 'th' ? 'th_TH' : 'en_US',
      alternateLocale: locale === 'th' ? ['en_US'] : ['th_TH'],
      type: 'website',
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'FrameFast - AI Face Recognition Photo Distribution' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
    },
  };
}

// Lazy load below-fold sections to reduce initial JS bundle
const FeatureStory = dynamic(
  () => import('@/components/landing/feature-story').then((mod) => mod.FeatureStory),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
const UploadWaySection = dynamic(
  () => import('@/components/landing/upload-way-section').then((mod) => mod.UploadWaySection),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
const PricingSection = dynamic(
  () => import('@/components/landing/pricing-section').then((mod) => mod.PricingSection),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
const IosAppSection = dynamic(
  () => import('@/components/landing/ios-app-section').then((mod) => mod.IosAppSection),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
const FaqSection = dynamic(
  () => import('@/components/landing/faq-section').then((mod) => mod.FaqSection),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
const Footer = dynamic(() => import('@/components/landing/footer').then((mod) => mod.Footer), {
  ssr: true,
  loading: () => <SectionSkeleton />,
});

function SectionSkeleton() {
  return <div className="h-96" />;
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="bg-background">
      <SoftwareApplicationJsonLd />
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
