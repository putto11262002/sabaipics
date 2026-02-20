import { setRequestLocale } from 'next-intl/server';

import { Footer } from '@/components/landing/footer';
import { SiteNav } from '@/components/site-nav';
import { CameraCompatibilityContent } from '@/components/compatibility/camera-compatibility-content';

type Props = {
  params: Promise<{ locale: string }>;
};

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
