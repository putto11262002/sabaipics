import { Link } from '@/i18n/navigation';
import { LogoMark } from '@/shared/components/icons/logo-mark';
import { Mail } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { SectionContainer } from './section-container';

const CONTACT_EMAIL = 'contact@framefast.io';

export async function Footer() {
  const t = await getTranslations('Footer');
  const year = new Date().getFullYear();

  const productLinks = [
    { href: '#features', label: t('features') },
    { href: '#pricing', label: t('pricing') },
    { href: '/compatibility', label: t('compatibility') },
    { href: '/guides', label: t('cameraSetup') },
    { href: '#upload', label: t('upload') },
    { href: '#faq', label: t('faq') },
  ];

  const legalLinks = [
    { href: '/privacy', label: t('privacy') },
    { href: '/terms', label: t('terms') },
  ];

  return (
    <footer className="bg-muted/30">
      <SectionContainer className="py-12 sm:py-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
            >
              <LogoMark className="h-5 w-5" />
              FrameFast
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">{t('brandDescription')}</p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-medium">{t('product')}</h3>
            <ul className="mt-3 space-y-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-medium">{t('legal')}</h3>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-medium">{t('contact')}</h3>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="h-4 w-4" />
              {CONTACT_EMAIL}
            </a>
            <div className="mt-3 flex items-center gap-4">
              <Link
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Instagram"
              >
                <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </Link>
              <Link
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Facebook"
              >
                <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
                </svg>
              </Link>
              <Link
                href="https://line.me"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="LINE"
              >
                <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 5.82 2 10.5c0 4.21 3.74 7.74 8.78 8.41.34.07.81.23.93.52.1.27.07.68.03.95l-.15.91c-.05.27-.21 1.05.92.57 1.13-.47 6.1-3.59 8.33-6.15C22.34 13.89 22 12.24 22 10.5 22 5.82 17.52 2 12 2zm-3.5 11.5h-2a.5.5 0 01-.5-.5v-4a.5.5 0 011 0v3.5h1.5a.5.5 0 010 1zm2 0a.5.5 0 01-.5-.5v-4a.5.5 0 011 0v4a.5.5 0 01-.5.5zm4.5 0h-2a.5.5 0 01-.5-.5v-4a.5.5 0 011 0v2.5l1.5-2.75a.5.5 0 01.9.45L13.5 12l1.4 2.3a.5.5 0 01-.9.45L12.5 12v1a.5.5 0 01-.5.5zm4 0h-2a.5.5 0 01-.5-.5v-4a.5.5 0 01.5-.5h2a.5.5 0 010 1h-1.5v1h1.5a.5.5 0 010 1h-1.5v1h1.5a.5.5 0 010 1z" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 flex flex-col items-center justify-center gap-4 pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground">{t('copyright', { year })}</p>
        </div>
      </SectionContainer>
    </footer>
  );
}
