import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://framefast.io';
  const locales = ['en', 'th'];
  const defaultLocale = 'en';

  const staticPages = [
    { path: '', priority: 1, changeFrequency: 'weekly' as const },
    { path: '/privacy', priority: 0.3, changeFrequency: 'monthly' as const },
    { path: '/terms', priority: 0.3, changeFrequency: 'monthly' as const },
    { path: '/compatibility', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/guides', priority: 0.6, changeFrequency: 'monthly' as const },
  ];

  const guidePages = [
    { path: '/guides/canon/eos-utility', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/guides/canon/remote-control-eos-utility', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/guides/nikon', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/guides/sony/pc-remote', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/guides/sony/wifi-direct-ssid', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/guides/sony', priority: 0.5, changeFrequency: 'monthly' as const },
  ];

  const allPages = [...staticPages, ...guidePages];

  return locales.flatMap((locale) =>
    allPages.map((page) => {
      // For default locale (en), don't add prefix. For others (th), add prefix.
      const localePath = locale === defaultLocale ? page.path : `/${locale}${page.path}`;

      return {
        url: `${baseUrl}${localePath}`,
        lastModified: new Date(),
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates: {
          languages: {
            en: `${baseUrl}${page.path}`,
            th: `${baseUrl}/th${page.path}`,
          },
        },
      };
    })
  );
}
