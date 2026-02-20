'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

import { Link } from '@/i18n/navigation';

import { LogoMark } from '@/shared/components/icons/logo-mark';
import { SiteNavAuthCta } from '@/components/site-nav-auth-cta';

const navItems = [
  { href: '#features', label: 'Features' },
  { href: '#upload', label: 'Upload' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const;

export function SiteNav() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <div className="h-14 md:h-20 bg-muted/30" aria-hidden="true" />

      <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
        <div className="pointer-events-auto mx-auto mt-2 w-full max-w-7xl px-4 md:mt-5">
          <div
            className={[
              'relative flex h-11 items-center rounded-full border px-3 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-200 md:h-14 md:px-5',
              isScrolled
                ? 'border-border/90 bg-background/70 shadow-[0_10px_26px_-18px_color-mix(in_oklab,var(--foreground)_36%,transparent)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/58'
                : 'border-border/85 bg-background shadow-none',
            ].join(' ')}
          >
            <div className="flex shrink-0 items-center">
              <Link
                href="/"
                className="inline-flex items-center gap-2.5 text-base font-semibold tracking-tight"
                onClick={closeMenu}
              >
                <LogoMark className="h-6 w-6" />
                FrameFast
              </Link>
            </div>

            <nav
              className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 md:flex"
              aria-label="Primary"
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2 md:gap-3">
              <SiteNavAuthCta />

              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:text-foreground md:hidden"
                aria-expanded={isMenuOpen}
                aria-controls="site-mobile-nav"
                aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                onClick={() => setIsMenuOpen((open) => !open)}
              >
                {isMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <nav
            id="site-mobile-nav"
            aria-label="Mobile primary"
            className={`md:hidden ${isMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
          >
            <div
              className={`mt-2 overflow-hidden rounded-2xl border border-border/85 bg-background transition-[opacity,transform] duration-200 ${
                isMenuOpen ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
              }`}
            >
              <ul className="flex flex-col p-2">
                {navItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeMenu}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
