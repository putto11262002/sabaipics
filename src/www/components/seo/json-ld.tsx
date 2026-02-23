export function OrganizationJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'FrameFast',
          url: 'https://framefast.io',
          logo: 'https://framefast.io/favicon.svg',
          description: 'AI-powered event photo distribution platform for photographers and event organizers.',
        }),
      }}
    />
  );
}

export function SoftwareApplicationJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'FrameFast',
          applicationCategory: 'PhotographyApplication',
          operatingSystem: 'iOS, Web',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'THB',
            description: 'Free tier with 1,000 credits',
          },
          featureList: [
            'AI face recognition photo search',
            'QR code photo sharing',
            'LINE photo delivery',
            'Automatic color grading with LUT',
            'iOS app with camera sync',
          ],
        }),
      }}
    />
  );
}
