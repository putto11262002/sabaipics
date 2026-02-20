import { Link } from '@/i18n/navigation';
import { LogoMark } from '@/shared/components/icons/logo-mark';

const footerLinks = {
  product: [
    { href: '#features', label: 'Features' },
    { href: '#pricing', label: 'Pricing' },
    { href: '/compatibility', label: 'Compatibility' },
    { href: '/guides', label: 'Camera Setup' },
    { href: '#upload', label: 'Upload' },
    { href: '#faq', label: 'FAQ' },
  ],
  company: [
    { href: '/about', label: 'About' },
    { href: '/blog', label: 'Blog' },
    { href: '/contact', label: 'Contact' },
  ],
  legal: [
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/terms', label: 'Terms of Service' },
  ],
};

export function Footer() {
  return (
    <footer>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
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
            <p className="mt-3 text-sm text-muted-foreground">
              Event photo distribution with AI-powered face recognition. Made for photographers and
              event organizers.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-medium">Product</h3>
            <ul className="mt-3 space-y-2">
              {footerLinks.product.map((link) => (
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

          {/* Company */}
          <div>
            <h3 className="text-sm font-medium">Company</h3>
            <ul className="mt-3 space-y-2">
              {footerLinks.company.map((link) => (
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
            <h3 className="text-sm font-medium">Legal</h3>
            <ul className="mt-3 space-y-2">
              {footerLinks.legal.map((link) => (
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
        </div>

        {/* Bottom */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} FrameFast. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Twitter"
            >
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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
    </footer>
  );
}
