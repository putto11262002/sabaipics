import { setRequestLocale } from 'next-intl/server';

import { SiteNav } from '@/components/site-nav';
import { Footer } from '@/components/landing/footer';
import { Separator } from '@/shared/components/ui/separator';
import { CameraGuideEntry } from '@/components/guides/camera-guide-entry';

type Props = {
  params: Promise<{ locale: string }>;
};

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
