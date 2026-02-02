import { setRequestLocale } from 'next-intl/server';
import { Footer } from '@/components/landing/footer';
import { LandingHero } from '@/components/landing/hero';
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

        <section id="features" className="mx-auto max-w-6xl px-4 py-16" />
        <section id="upload" className="mx-auto max-w-6xl px-4 py-16" />
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-16" />
        <section id="faq" className="mx-auto max-w-6xl px-4 py-16" />
      </main>
      <Footer />
    </div>
  );
}
