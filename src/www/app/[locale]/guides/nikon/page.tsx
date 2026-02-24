import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { SiteNav } from '@/components/site-nav';
import { Footer } from '@/components/landing/footer';
import { Separator } from '@/shared/components/ui/separator';

const PAGE_METADATA = {
  en: {
    title: 'Nikon Wireless Setup Guide | FrameFast',
    description:
      'Set up your Nikon camera for wireless photo transfer. Connect via WiFi or SnapBridge for instant uploads to FrameFast.',
  },
  th: {
    title: 'คู่มือตั้งค่า Nikon ไร้สาย | FrameFast',
    description:
      'ตั้งค่ากล้อง Nikon สำหรับถ่ายโอนภาพไร้สาย เชื่อมต่อผ่าน WiFi หรือ SnapBridge เพื่ออัปโหลดทันทีไปยัง FrameFast',
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

export default async function NikonGuidesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-12">
        <header className="space-y-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Nikon guide (coming soon)
          </h1>
        </header>
        <Separator className="my-8" />
        <p className="text-sm text-muted-foreground">We’re drafting Nikon setup flows next.</p>
      </main>
      <Footer />
    </div>
  );
}
