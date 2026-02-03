import { setRequestLocale } from 'next-intl/server';
import { Footer } from '@/components/landing/footer';
import { LandingHero } from '@/components/landing/hero';
import { BentoFeatures } from '@/components/landing/bento-features';
import { SiteNav } from '@/components/site-nav';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />
      <main>
        <LandingHero />
        <BentoFeatures />

        <section id="pricing" className="mx-auto max-w-7xl px-4 py-16" />
        <section id="faq" className="mx-auto max-w-7xl px-4 py-16" />
      </main>
      <Footer />
    </div>
  );
}
