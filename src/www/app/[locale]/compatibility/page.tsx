import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { Footer } from '@/components/landing/footer';
import { SiteNav } from '@/components/site-nav';
import { CameraCompatibilityContent } from '@/components/compatibility/camera-compatibility-content';

const PAGE_METADATA = {
  en: {
    title: 'Camera Compatibility | FrameFast',
    description:
      'Check if your camera works with FrameFast wireless upload. Supports Canon, Sony, Nikon with WiFi or USB tethering.',
  },
  th: {
    title: 'กล้องที่รองรับ | FrameFast',
    description:
      'ตรวจสอบว่ากล้องของคุณรองรับการอัปโหลดไร้สายกับ FrameFast รองรับ Canon, Sony, Nikon ด้วย WiFi หรือ USB',
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
    openGraph: {
      title: meta.title,
      description: meta.description,
    },
  };
}

export default async function CompatibilityPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />
      <CameraCompatibilityContent />
      <Footer />
    </div>
  );
}
