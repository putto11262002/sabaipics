import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { SiteNav } from '@/components/site-nav';
import { Footer } from '@/components/landing/footer';
import { Separator } from '@/shared/components/ui/separator';
import { CameraGuideEntry } from '@/components/guides/camera-guide-entry';

const PAGE_METADATA = {
  en: {
    title: 'Camera Setup Guides | FrameFast',
    description:
      'Step-by-step guides to connect your Canon, Sony, or Nikon camera for wireless photo transfer to FrameFast.',
  },
  th: {
    title: 'คู่มือตั้งค่ากล้อง | FrameFast',
    description:
      'คู่มือทีละขั้นตอนเชื่อมต่อกล้อง Canon, Sony หรือ Nikon เพื่อถ่ายโอนภาพไร้สายไปยัง FrameFast',
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

export default async function GuidesEntryPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-12">
        <header className="space-y-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Select your camera brand
          </h1>
        </header>

        <Separator className="my-8" />

        <CameraGuideEntry />
      </main>
      <Footer />
    </div>
  );
}
