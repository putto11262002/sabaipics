import Link from 'next/link';

import { RoundedButton } from '@/components/ui/rounded-button';

const navItems = [
  { href: '#features', label: 'Features' },
  { href: '#upload', label: 'Upload' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const;

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="size-2 rounded-full bg-foreground" aria-hidden="true" />
            SabaiPics
          </Link>

          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
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
        </div>

        <div className="flex items-center justify-end gap-3">
          <RoundedButton asChild variant="outline" size="sm">
            <Link href="#">Sign in</Link>
          </RoundedButton>
        </div>
      </div>
    </header>
  );
}
