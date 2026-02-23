import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import '@/shared/styles/globals.css';
import '../www.css';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai'],
  variable: '--font-thai',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'FrameFast',
  description: 'AI face recognition photo distribution for events.',
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
    <html lang={locale} className={`${notoSansThai.variable}`}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
