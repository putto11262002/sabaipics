import { setRequestLocale } from 'next-intl/server';

import { SiteNav } from '@/components/site-nav';
import { Footer } from '@/components/landing/footer';
import { Separator } from '@/shared/components/ui/separator';

type Props = {
  params: Promise<{ locale: string }>;
};

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
        <p className="text-sm text-muted-foreground">
          We’re drafting Nikon setup flows next.
        </p>
      </main>
      <Footer />
    </div>
  );
}

