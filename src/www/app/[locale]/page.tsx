import { setRequestLocale } from 'next-intl/server';
import { Footer } from '@/components/landing/footer';
import { LandingHero } from '@/components/landing/hero';
import { LazyBelowFold } from '@/components/landing/lazy-sections';
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
        <LazyBelowFold />
      </main>
      <Footer />
    </div>
  );
}
