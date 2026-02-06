import { createMDX } from 'fumadocs-mdx/next';
import createNextIntlPlugin from 'next-intl/plugin';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: '../../',
  },
};

// Initialize OpenNext Cloudflare for local development
initOpenNextCloudflareForDev();

export default withMDX(withNextIntl(nextConfig));
