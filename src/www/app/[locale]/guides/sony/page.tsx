import { setRequestLocale } from 'next-intl/server';

import { SiteNav } from '@/components/site-nav';
import { Footer } from '@/components/landing/footer';
import { Link } from '@/i18n/navigation';
import { Separator } from '@/shared/components/ui/separator';

type Props = {
  params: Promise<{ locale: string }>;
};

function GuideLink({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-background p-4 transition-colors hover:bg-muted/40"
    >
      <div className="text-base font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{description}</div>
    </Link>
  );
}

export default async function SonyGuidesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-12">
        <header className="space-y-3">
          <p className="text-sm text-muted-foreground">Guide</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Sony camera setup guides
          </h1>
        </header>

        <Separator className="my-8" />

        <section className="space-y-3">
          <GuideLink
            href="/guides/sony-wifi-direct-ssid"
            title="Sony Wi‑Fi Direct (SSID + password)"
            description="For models that show DIRECT-xxxx SSID and a Wi‑Fi password on camera."
          />
          <GuideLink
            href="/guides/sony-pc-remote"
            title="Sony PC Remote (Access authentication OFF)"
            description="Recommended for models that support remote control + can disable access authentication."
          />
        </section>
      </main>
      <Footer />
    </div>
  );
}
