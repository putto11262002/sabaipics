import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { OrganizationJsonLd } from '@/components/seo/json-ld';
import '../www.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://framefast.io'),
  title: {
    template: '%s | FrameFast',
    default: 'FrameFast - AI Face Recognition Photo Distribution for Events',
  },
  description: 'Deliver event photos instantly with AI face search. Guests find their photos in seconds via QR code or LINE.',
  keywords: ['event photo distribution', 'AI face recognition', 'photo sharing', 'QR code photos', 'LINE photo delivery'],
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <OrganizationJsonLd />
      </head>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
