import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { source } from '@/lib/source';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { DM_Sans, Noto_Sans_Thai } from 'next/font/google';
import 'fumadocs-ui/style.css';
import '../globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai'],
  variable: '--font-thai',
  weight: ['400', '500', '600', '700'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={`${dmSans.variable} ${notoSansThai.variable}`}>
      <body className="antialiased">
        <RootProvider>
          <DocsLayout
            tree={source.pageTree}
            nav={{
              title: 'FrameFast เอกสาร',
              url: '/docs',
            }}
            sidebar={{
              banner: (
                <Link href="/" className="text-sm hover:underline">
                  ← กลับหน้าแรก
                </Link>
              ),
            }}
          >
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
